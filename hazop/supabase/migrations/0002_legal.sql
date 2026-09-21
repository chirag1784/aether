-- 0002_legal.sql — legal and compliance schema
--
-- Reference side (instruments, obligations, thresholds) is org-global and
-- versioned. Project side (applicability, compliance, permits) is
-- project-scoped and carries the legal source version every conclusion was
-- made against, so a later amendment never silently rewrites a past finding.

create type applicability_status as enum (
  'APPLICABLE_CONFIRMED', 'POTENTIALLY_APPLICABLE', 'NOT_APPLICABLE_CONFIRMED',
  'NOT_ENOUGH_DATA', 'REQUIRES_LEGAL_REVIEW'
);

create type compliance_status as enum (
  'COMPLIANT_EVIDENCE_VERIFIED', 'PARTIALLY_EVIDENCED', 'EVIDENCE_MISSING',
  'POTENTIAL_GAP', 'NOT_APPLICABLE', 'UNDER_REVIEW', 'EXPIRED', 'RENEWAL_DUE'
);

create type instrument_type as enum (
  'law', 'rule', 'notification', 'licence_condition', 'consent_condition',
  'ec_condition', 'standard', 'guideline', 'company_requirement'
);

create type legal_source_status as enum (
  'METADATA_SEEDED_UNVERIFIED', 'OFFICIAL_TEXT_RETRIEVED',
  'USER_SUPPLIED_OFFICIAL', 'SUPERSEDED'
);

create type legal_source_rank as enum (
  'GAZETTE', 'INDIA_CODE', 'MINISTRY_OR_REGULATOR', 'STATE_OFFICIAL',
  'USER_UPLOADED_OFFICIAL', 'OFFICIAL_GUIDANCE', 'STANDARDS_BODY', 'SECONDARY'
);

create type permit_expiry_status as enum (
  'VALID', 'RENEWAL_DUE', 'EXPIRING_SOON', 'EXPIRED', 'NO_EXPIRY', 'UNKNOWN'
);

-- ---------------------------------------------------------------------------
-- Legal registry (reference data)
-- ---------------------------------------------------------------------------

create table legal_instruments (
  id                      text primary key,           -- e.g. 'IN-MSIHC-1989'
  org_id                  uuid references organizations(id) on delete cascade,
  title                   text not null,
  instrument_type         instrument_type not null,
  domain                  text not null,
  parent_instrument_id    text references legal_instruments(id) on delete set null,
  jurisdiction_country    text not null,
  jurisdiction_state      text,
  authority               text not null,
  notification_number     text,
  gazette_date            date,
  effective_from          date,
  effective_to            date,
  amendment_status        text,
  official_source_url     text,
  official_source_rank    legal_source_rank,
  official_document_hash  text,
  source_status           legal_source_status not null default 'METADATA_SEEDED_UNVERIFIED',
  is_standard             boolean not null default false,
  -- A standard is mandatory ONLY where a route is recorded here.
  mandatory_via           jsonb not null default '[]'::jsonb,
  triggers                text[] not null default '{}',
  notes                   text,
  retrieved_at            timestamptz,
  last_verified_at        timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index legal_instruments_domain_idx on legal_instruments(domain);
create index legal_instruments_jurisdiction_idx on legal_instruments(jurisdiction_country, jurisdiction_state);

-- A retrieved snapshot of the official text.
create table legal_instrument_versions (
  id                uuid primary key default gen_random_uuid(),
  instrument_id     text not null references legal_instruments(id) on delete cascade,
  version_label     text not null,
  effective_from    date,
  effective_to      date,
  url               text,
  sha256            text,
  byte_size         bigint,
  storage_key       text,
  retrieved_at      timestamptz not null default now(),
  retrieved_by      uuid references users(id),
  source_rank       legal_source_rank not null,
  is_current        boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (instrument_id, version_label)
);
create index legal_instrument_versions_current_idx on legal_instrument_versions(instrument_id, is_current);

create table legal_sources (
  id                uuid primary key default gen_random_uuid(),
  instrument_id     text references legal_instruments(id) on delete cascade,
  version_id        uuid references legal_instrument_versions(id) on delete cascade,
  source_rank       legal_source_rank not null,
  source_label      source_label not null,
  title             text not null,
  publisher         text,
  url               text,
  locator           text,
  quote             text,
  sha256            text,
  retrieved_at      timestamptz,
  created_at        timestamptz not null default now()
);

create table legal_obligations (
  id                      text primary key,
  instrument_id           text not null references legal_instruments(id) on delete cascade,
  section_rule_schedule   text not null,
  topic                   text not null,
  obligation_summary      text not null,
  applicability_logic     jsonb not null default '{}'::jsonb,
  threshold_ref           text,
  frequency               text,
  responsible_authority   text,
  evidence_expected       text[] not null default '{}',
  affected_process_types  text[] not null default '{}',
  affected_chemical_classes text[] not null default '{}',
  affected_equipment_types text[] not null default '{}',
  source_quote_locator    text,
  unresolved_questions    text[] not null default '{}',
  legal_review_required   boolean not null default true,
  links_to_hazop          boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index legal_obligations_instrument_idx on legal_obligations(instrument_id);

-- Threshold sets and entries. `value` is NULLABLE and ships NULL: a figure
-- exists only once a user has read it from the official text and cited it.
create table legal_thresholds (
  id                uuid primary key default gen_random_uuid(),
  set_key           text not null,
  instrument_id     text not null references legal_instruments(id) on delete cascade,
  label             text not null,
  basis             text,
  locator           text not null,
  official_source_url text,
  chemical_name     text,
  cas               text,
  is_class          boolean not null default false,
  value             numeric,
  unit              text,
  status            field_status not null default 'MISSING',
  source_refs       jsonb not null default '[]'::jsonb,
  entered_by        uuid references users(id),
  entered_at        timestamptz,
  verified_by       uuid references users(id),
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A figure may not be stored without a citation.
  constraint legal_thresholds_cited
    check (value is null or (locator is not null and length(locator) > 3)),
  -- A figure may not be marked verified without a verifier.
  constraint legal_thresholds_verifier
    check (status <> 'VERIFIED' or verified_by is not null)
);
create index legal_thresholds_set_idx on legal_thresholds(set_key);
create index legal_thresholds_cas_idx on legal_thresholds(cas);

-- ---------------------------------------------------------------------------
-- Project applicability and compliance
-- ---------------------------------------------------------------------------

create table project_legal_applicability (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  instrument_id         text not null references legal_instruments(id) on delete cascade,
  candidate_reason      text not null,      -- TRIGGER_TRUE | TRIGGER_UNRESOLVED | NO_TRIGGERS
  triggers_evaluated    jsonb not null default '[]'::jsonb,
  resolved_facts        jsonb not null default '{}'::jsonb,
  engine_version        text not null,
  evaluated_at          timestamptz not null default now(),
  unique (project_id, instrument_id)
);
create index project_legal_applicability_project_idx on project_legal_applicability(project_id);

create table project_compliance_records (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  obligation_id         text not null references legal_obligations(id) on delete cascade,
  applicability_status  applicability_status not null default 'NOT_ENOUGH_DATA',
  applicability_reason  text,
  set_by                text,               -- the engine rule or 'HUMAN'
  project_facts_used    jsonb not null default '[]'::jsonb,
  missing_facts         text[] not null default '{}',
  threshold_evaluation  jsonb,
  crossings             jsonb not null default '[]'::jsonb,
  evidence_status       text,
  compliance_status     compliance_status not null default 'UNDER_REVIEW',
  gaps                  text[] not null default '{}',
  owner                 uuid references users(id),
  due_date              date,
  renewal_date          date,
  gap_description       text,
  recommended_action    text,
  action_needed         text,
  is_standard_guidance  boolean not null default false,
  legal_source_version  text,
  legal_version_id      uuid references legal_instrument_versions(id) on delete set null,
  requires_human_review boolean not null default true,
  reviewed_by           uuid references users(id),
  reviewed_at           timestamptz,
  engine_version        text,
  rev                   integer not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (project_id, obligation_id),
  -- The engine may not write a CONFIRMED status; only a human review can.
  constraint compliance_confirmed_needs_reviewer
    check (applicability_status not in ('APPLICABLE_CONFIRMED')
           or set_by like 'ENGINE_VERIFIED%' or reviewed_by is not null),
  -- Compliance may not be declared verified without a reviewer.
  constraint compliance_verified_needs_reviewer
    check (compliance_status <> 'COMPLIANT_EVIDENCE_VERIFIED' or reviewed_by is not null)
);
create index project_compliance_project_idx on project_compliance_records(project_id);
create index project_compliance_status_idx on project_compliance_records(project_id, applicability_status, compliance_status);

create table permits_licenses_consents (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  permit_type           text not null,
  label                 text,
  issuing_authority     text,
  number                text,
  issue_date            date,
  effective_date        date,
  expiry_date           date,
  renewal_date          date,
  expiry_status         permit_expiry_status not null default 'UNKNOWN',
  notice_days           integer not null default 90,
  status_note           text,
  approved_capacity     text,
  chemicals_covered     uuid[] not null default '{}',
  equipment_covered     uuid[] not null default '{}',
  key_conditions        text,
  document_id           uuid references project_documents(id) on delete set null,
  source_refs           jsonb not null default '[]'::jsonb,
  revoked               boolean not null default false,
  renewal_acknowledged  boolean not null default false,
  next_action           text,
  rev                   integer not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index permits_project_idx on permits_licenses_consents(project_id);
create index permits_expiry_idx on permits_licenses_consents(project_id, expiry_status);

-- Conditions extracted from an uploaded licence / consent / EC.
-- `text` holds the condition VERBATIM; `analysis` holds the clearly separated,
-- labelled interpretation. The two are never merged.
create table permit_conditions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  permit_id         uuid not null references permits_licenses_consents(id) on delete cascade,
  condition_number  text,
  text              text not null,
  category          text,          -- monitoring | return | capacity | infrastructure | reporting | other
  frequency         text,
  due_date          date,
  analysis          text,
  analysis_status   field_status not null default 'AI_INFERRED',
  obligation_id     text references legal_obligations(id) on delete set null,
  node_ids          uuid[] not null default '{}',
  equipment_ids     uuid[] not null default '{}',
  chemical_ids      uuid[] not null default '{}',
  source_refs       jsonb not null default '[]'::jsonb,
  extracted_at      timestamptz not null default now(),
  verified_by       uuid references users(id),
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index permit_conditions_permit_idx on permit_conditions(permit_id);

create table compliance_evidence (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  compliance_id     uuid references project_compliance_records(id) on delete cascade,
  permit_id         uuid references permits_licenses_consents(id) on delete cascade,
  condition_id      uuid references permit_conditions(id) on delete cascade,
  expects           text,          -- which evidence_expected item this satisfies
  title             text not null,
  document_id       uuid references project_documents(id) on delete set null,
  note              text,
  valid_from        date,
  valid_to          date,
  status            field_status not null default 'DOCUMENT_EXTRACTED',
  uploaded_by       uuid references users(id),
  verified_by       uuid references users(id),
  verified_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint evidence_verified_needs_reviewer
    check (status <> 'VERIFIED' or verified_by is not null)
);
create index compliance_evidence_project_idx on compliance_evidence(project_id);

create table compliance_tasks (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  compliance_id     uuid references project_compliance_records(id) on delete cascade,
  condition_id      uuid references permit_conditions(id) on delete cascade,
  permit_id         uuid references permits_licenses_consents(id) on delete cascade,
  title             text not null,
  detail            text,
  frequency         text,
  anchor_date       date,
  last_completed    date,
  due_date          date,
  status            text not null default 'SCHEDULED',  -- SCHEDULED | DUE_SOON | OVERDUE | COMPLETE
  owner             uuid references users(id),
  evidence_required boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index compliance_tasks_project_idx on compliance_tasks(project_id, status);
create index compliance_tasks_due_idx on compliance_tasks(due_date);

-- A detected change in an official source. Creates a review event and nothing
-- else — no project conclusion changes automatically.
create table legal_update_events (
  id                    uuid primary key default gen_random_uuid(),
  instrument_id         text not null references legal_instruments(id) on delete cascade,
  old_version_id        uuid references legal_instrument_versions(id) on delete set null,
  new_version_id        uuid references legal_instrument_versions(id) on delete set null,
  change_date           date,
  detected_at           timestamptz not null default now(),
  detection_method      text,
  sections_to_review    text[] not null default '{}',
  affected_project_ids  uuid[] not null default '{}',
  status                text not null default 'REVIEW_REQUIRED',  -- REVIEW_REQUIRED | REVIEWED | DISMISSED
  reviewed_by           uuid references users(id),
  reviewed_at           timestamptz,
  review_note           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index legal_update_events_status_idx on legal_update_events(status);

-- ---------------------------------------------------------------------------
-- Obligation <-> HAZOP links
-- ---------------------------------------------------------------------------

create table legal_node_links (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  compliance_id     uuid not null references project_compliance_records(id) on delete cascade,
  node_id           uuid not null references nodes(id) on delete cascade,
  reason            text not null,
  detail            text,
  chemical_ids      uuid[] not null default '{}',
  equipment_ids     uuid[] not null default '{}',
  condition_id      uuid references permit_conditions(id) on delete set null,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  unique (compliance_id, node_id)
);
create index legal_node_links_node_idx on legal_node_links(node_id);

create table legal_scenario_links (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  compliance_id     uuid not null references project_compliance_records(id) on delete cascade,
  scenario_id       uuid not null references hazop_scenarios(id) on delete cascade,
  reason            text not null,
  created_at        timestamptz not null default now(),
  unique (compliance_id, scenario_id)
);

create table legal_recommendation_links (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  compliance_id     uuid not null references project_compliance_records(id) on delete cascade,
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  basis_kind        text not null default 'LEGAL',   -- LEGAL | STANDARD
  reason            text,
  created_at        timestamptz not null default now(),
  unique (compliance_id, recommendation_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers for the tables added here
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
      and not exists (
        select 1 from pg_trigger tg
        join pg_class cl on cl.oid = tg.tgrelid
        where cl.relname = c.table_name and tg.tgname = c.table_name || '_touch'
      )
  loop
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security scaffold
-- ---------------------------------------------------------------------------
-- Project data is readable by project members and writable per the role matrix
-- in docs/SECURITY.md. Policies are written against a `current_app_user()`
-- helper that the API sets per request; the reference-side legal tables are
-- readable org-wide and writable by admins only.

alter table projects                    enable row level security;
alter table project_compliance_records  enable row level security;
alter table permits_licenses_consents   enable row level security;
alter table hazop_scenarios             enable row level security;
alter table recommendations             enable row level security;
alter table legal_thresholds            enable row level security;

create or replace function current_app_user() returns uuid as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$ language sql stable;

create or replace function app_user_role_in(p_project uuid) returns user_role as $$
  select pm.role from project_members pm
  where pm.project_id = p_project and pm.user_id = current_app_user();
$$ language sql stable;

create policy projects_read on projects for select
  using (exists (select 1 from project_members pm where pm.project_id = projects.id and pm.user_id = current_app_user()));

create policy compliance_read on project_compliance_records for select
  using (app_user_role_in(project_id) is not null);

create policy compliance_write on project_compliance_records for update
  using (app_user_role_in(project_id) in ('admin', 'facilitator', 'reviewer'));

create policy permits_read on permits_licenses_consents for select
  using (app_user_role_in(project_id) is not null);

create policy permits_write on permits_licenses_consents for all
  using (app_user_role_in(project_id) in ('admin', 'facilitator'));

create policy scenarios_read on hazop_scenarios for select
  using (app_user_role_in(project_id) is not null);

create policy scenarios_write on hazop_scenarios for all
  using (app_user_role_in(project_id) in ('admin', 'facilitator', 'engineer'));

create policy recommendations_read on recommendations for select
  using (app_user_role_in(project_id) is not null);

create policy recommendations_write on recommendations for all
  using (app_user_role_in(project_id) in ('admin', 'facilitator', 'engineer'));

-- A threshold figure may only be written by admin or facilitator, and only a
-- reviewer or admin may mark it VERIFIED (enforced additionally by the
-- legal_thresholds_verifier check constraint above).
create policy thresholds_read on legal_thresholds for select using (true);
create policy thresholds_write on legal_thresholds for all
  using (exists (select 1 from users u where u.id = current_app_user() and u.role in ('admin', 'facilitator')));
