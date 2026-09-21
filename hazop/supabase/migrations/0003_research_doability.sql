-- 0003_research_doability.sql
--
-- The tables behind three features added after the core schema: external
-- research with provenance, the company profile, the practicability scoring
-- that drives the before-and-after risk picture, and the ledger of what the
-- assistant did.
--
-- The rules the application enforces in code are repeated here as check
-- constraints, so a direct SQL write cannot produce a state the engines
-- consider impossible. Two in particular:
--
--   * a WEB_SOURCED value must carry a URL or a document reference, and
--   * nothing produced by research may be marked VERIFIED without a named
--     verifier, which only a human session can supply.

-- ---------------------------------------------------------------------------
-- Evidence classes
-- ---------------------------------------------------------------------------

-- Mirrors EVIDENCE_CLASSES in packages/research/sources.js, in rank order.
create type evidence_class as enum (
  'PRIMARY_REGULATOR',
  'SUPPLIER_SDS',
  'MANUFACTURER_SDS',
  'AUTHORITATIVE_DATABASE',
  'PEER_REVIEWED',
  'COMMERCIAL_CATALOGUE',
  'AGGREGATOR',
  'MODEL_RECALL'
);

create type research_route as enum ('CONNECTOR', 'PASTE', 'SERVER', 'RECALL');

create type research_outcome as enum ('APPLIED', 'REJECTED', 'CONFLICT', 'NOT_FOUND');

-- ---------------------------------------------------------------------------
-- Research findings
-- ---------------------------------------------------------------------------

-- Every lookup this project has run, applied or not. A rejected finding is
-- kept so nobody repeats the search, and a conflict is kept because the value
-- not chosen is never deleted.
create table research_findings (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  subject_kind    text not null check (subject_kind in ('chemical', 'company')),
  subject_id      uuid,
  subject_label   text,
  target          text not null,
  target_label    text,
  query           text,
  route           research_route,
  evidence_klass  evidence_class,
  raw_value       text,
  value_applied   text,
  unit            text,
  url             text,
  quote           text,
  retrieved_at    timestamptz,
  status          field_status,
  warnings        jsonb not null default '[]'::jsonb,
  outcome         research_outcome not null,
  note            text,
  requested_by    uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A sourced value has to be traceable. This is the same refusal
  -- assessFinding() makes in the application.
  constraint research_sourced_needs_citation check (
    status is distinct from 'WEB_SOURCED' or url is not null or quote is not null
  ),
  -- Model recall cannot be recorded as anything but inferred, whatever a
  -- caller asks for.
  constraint research_recall_is_inferred check (
    evidence_klass is distinct from 'MODEL_RECALL' or status is null or status = 'AI_INFERRED'
  ),
  -- Research never produces an attestation.
  constraint research_never_verified check (status is distinct from 'VERIFIED')
);
create index research_findings_project_idx on research_findings(project_id);
create index research_findings_subject_idx on research_findings(subject_kind, subject_id, target);

-- The queries the app built, kept so a repeat visit shows what was already
-- tried rather than starting from nothing.
create table research_queries (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  subject_kind    text not null check (subject_kind in ('chemical', 'company')),
  subject_id      uuid,
  target          text not null,
  query           text not null,
  authorities     jsonb not null default '[]'::jsonb,
  route           research_route,
  ran_at          timestamptz not null default now(),
  requested_by    uuid references users(id),
  created_at      timestamptz not null default now()
);
create index research_queries_project_idx on research_queries(project_id);

-- ---------------------------------------------------------------------------
-- Company profile
-- ---------------------------------------------------------------------------

-- One row per field, each with its own provenance. A profile is never a block
-- of unattributed text: the consented quantity caps production and the named
-- occupier carries personal duties, so both have to say where they came from.
create table company_profile (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  field           text not null,
  value           text,
  status          field_status not null default 'MISSING',
  evidence_klass  evidence_class,
  authority_key   text,
  source_url      text,
  retrieved_at    timestamptz,
  research_note   text,
  notes           text,
  verified_by     uuid references users(id),
  verified_at     timestamptz,
  rev             integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, field),

  constraint company_sourced_needs_citation check (
    status is distinct from 'WEB_SOURCED' or source_url is not null
  ),
  -- VERIFIED is a signature: it needs the person who signed.
  constraint company_verified_needs_verifier check (
    status is distinct from 'VERIFIED' or (verified_by is not null and verified_at is not null)
  )
);
create index company_profile_project_idx on company_profile(project_id);

-- ---------------------------------------------------------------------------
-- Practicability
-- ---------------------------------------------------------------------------

-- The seven declared effort facts, as columns rather than a jsonb blob, so a
-- report query can group by cost band without parsing JSON. Every one is
-- nullable and null means undeclared — which keeps the recommendation out of
-- the ranking instead of being read as cheap.
create type cost_band as enum ('A', 'B', 'C', 'D');
create type lead_time_band as enum ('DAYS', 'WEEKS', 'MONTHS', 'OVER_A_YEAR');
create type outage_need as enum ('NONE', 'PLANNED_SHUTDOWN', 'EXTENDED_SHUTDOWN');
create type engineering_need as enum ('NONE', 'MINOR', 'MODIFICATION', 'REDESIGN');
create type competency_source as enum ('IN_HOUSE', 'LOCAL_VENDOR', 'SPECIALIST', 'NOT_IDENTIFIED');
create type approval_need as enum ('NONE', 'INTERNAL_ONLY', 'REGULATOR');
create type space_access as enum ('YES', 'TIGHT', 'NO');

alter table recommendations
  add column effort_cost_band cost_band,
  add column effort_lead_time lead_time_band,
  add column effort_outage outage_need,
  add column effort_engineering engineering_need,
  add column effort_competency competency_source,
  add column effort_approval approval_need,
  add column effort_space_access space_access,
  add column effort_declared_by uuid references users(id),
  add column effort_declared_at timestamptz;

comment on column recommendations.effort_cost_band is
  'Null means undeclared. The doability engine leaves an undeclared action out of the ranking rather than assuming it is cheap.';

-- A saved practicability cut, so the package presented to a plant manager can
-- be reproduced exactly when they ask about it three months later.
create table doability_selections (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  label           text not null,
  mode            text not null check (mode in ('DO_NOW', 'THIS_QUARTER', 'NEXT_SHUTDOWN', 'ALL_PRACTICABLE', 'TOP_N', 'EXPLICIT')),
  top_n           integer check (top_n is null or top_n > 0),
  explicit_ids    jsonb not null default '[]'::jsonb,
  matrix_id       text,
  matrix_version  integer,
  -- The counts the engine produced when this cut was saved, so a later report
  -- can show what was claimed at the time without recomputing against data
  -- that has since moved.
  band_counts_before jsonb,
  band_counts_after  jsonb,
  needing_action_before integer,
  needing_action_after  integer,
  rows_moved      integer,
  rows_stationary integer,
  saved_by        uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint doability_top_n_needs_mode check (mode <> 'TOP_N' or top_n is not null)
);
create index doability_selections_project_idx on doability_selections(project_id);

-- ---------------------------------------------------------------------------
-- What the assistant did
-- ---------------------------------------------------------------------------

-- The reversible ledger. `before_value` and `after_value` hold only the fields
-- that changed, which is what makes a one-click undo possible and keeps the
-- row small.
create table chat_actions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  op              text not null check (op in ('create', 'update', 'remove')),
  collection      text not null,
  record_id       text not null,
  summary         text not null,
  before_value    jsonb,
  after_value     jsonb,
  autonomy        text check (autonomy in ('ASK', 'ACT')),
  actor_kind      text not null default 'ai' check (actor_kind in ('ai', 'human')),
  requested_by    uuid references users(id),
  undone          boolean not null default false,
  undone_at       timestamptz,
  undone_by       uuid references users(id),
  at              timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint chat_actions_undone_has_time check (not undone or undone_at is not null)
);
create index chat_actions_project_idx on chat_actions(project_id, at desc);

-- One row per reasoning pass. The method the pass stated is recorded, because
-- a finding is only as good as the method that produced it and a reviewer
-- reading the report six months later needs to see both.
create table reasoning_runs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  pass            text not null,
  label           text,
  tier_requested  text,
  tier_applied    text,
  prompt_version  text not null,
  engine_version  text not null,
  runtime_ms      integer,
  finding_count   integer not null default 0,
  with_proposals  integer not null default 0,
  method_stated   text,
  -- Always true. A reasoning pass produces proposals, never conclusions.
  human_review_required boolean not null default true,
  requested_by    uuid references users(id),
  created_at      timestamptz not null default now(),

  constraint reasoning_always_reviewed check (human_review_required)
);
create index reasoning_runs_project_idx on reasoning_runs(project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table research_findings enable row level security;
alter table research_queries enable row level security;
alter table company_profile enable row level security;
alter table doability_selections enable row level security;
alter table chat_actions enable row level security;
alter table reasoning_runs enable row level security;

create policy research_findings_read on research_findings for select
  using (app_user_role_in(project_id) is not null);
create policy research_findings_write on research_findings for all
  using (app_user_role_in(project_id) in ('admin', 'facilitator', 'engineer'));

create policy research_queries_read on research_queries for select
  using (app_user_role_in(project_id) is not null);
create policy research_queries_write on research_queries for all
  using (app_user_role_in(project_id) in ('admin', 'facilitator', 'engineer'));

-- The company profile carries the facts that decide which statutes bite, so
-- writing it is a facilitator's job and verifying it is a reviewer's.
create policy company_profile_read on company_profile for select
  using (app_user_role_in(project_id) is not null);
create policy company_profile_write on company_profile for all
  using (app_user_role_in(project_id) in ('admin', 'facilitator'));

create policy doability_read on doability_selections for select
  using (app_user_role_in(project_id) is not null);
create policy doability_write on doability_selections for all
  using (app_user_role_in(project_id) in ('admin', 'facilitator', 'engineer'));

-- Anyone on the project may read what the assistant did — that transparency is
-- the point of the ledger — and anyone who can edit may undo it.
create policy chat_actions_read on chat_actions for select
  using (app_user_role_in(project_id) is not null);
create policy chat_actions_write on chat_actions for all
  using (app_user_role_in(project_id) in ('admin', 'facilitator', 'engineer'));

create policy reasoning_runs_read on reasoning_runs for select
  using (app_user_role_in(project_id) is not null);
create policy reasoning_runs_write on reasoning_runs for all
  using (app_user_role_in(project_id) in ('admin', 'facilitator', 'engineer'));

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- The 0001 migration attached touch_updated_at() to every table that had an
-- updated_at column at the time. Attach it to the new ones.
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'research_findings',
      'company_profile',
      'doability_selections',
      'chat_actions'
    ])
  loop
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
