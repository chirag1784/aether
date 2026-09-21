-- 0001_core.sql — HAZOP MASTER AI core schema
-- PostgreSQL 15+ / Supabase. pgvector for the RAG collections.
--
-- Conventions applied throughout:
--   * every table has id, created_at, updated_at
--   * every project-scoped table has project_id with ON DELETE CASCADE
--   * every table that can be revised has rev integer NOT NULL DEFAULT 1
--   * provenance lives in source_refs jsonb, never as a bare text column
--   * status columns use the status vocabulary enum, so an invalid status
--     cannot be written at all

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type field_status as enum (
  'VERIFIED', 'USER_CONFIRMED', 'DOCUMENT_EXTRACTED', 'WEB_SOURCED',
  'AI_INFERRED', 'CONFLICT', 'MISSING', 'NOT_APPLICABLE'
);

create type source_label as enum (
  'STATUTE', 'RULE', 'NOTIFICATION', 'GAZETTE', 'REGULATOR_GUIDANCE',
  'LICENCE_CONDITION', 'CONSENT_CONDITION', 'EC_CONDITION', 'STANDARD',
  'COMPANY_STANDARD', 'SDS', 'MANUFACTURER_DATA', 'SCIENTIFIC_SOURCE',
  'PROJECT_DOCUMENT', 'AI_INFERENCE'
);

create type user_role as enum ('admin', 'facilitator', 'engineer', 'reviewer', 'viewer');

create type node_review_status as enum ('PROPOSED', 'APPROVED', 'WORKSHEETED', 'COMPLETE');
create type scenario_review_status as enum ('DRAFT', 'TEAM_REVIEWED', 'FACILITATOR_ACCEPTED', 'CLOSED_OUT');
create type rec_status as enum ('OPEN', 'IN_PROGRESS', 'AWAITING_EVIDENCE', 'CLOSED', 'REJECTED', 'DEFERRED');
create type control_level as enum ('ELIMINATE', 'SUBSTITUTE', 'ENGINEERING', 'ADMINISTRATIVE', 'PPE');
create type priority_level as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type residual_basis_kind as enum (
  'ELIMINATION', 'SUBSTITUTION', 'ENGINEERING_CONTROL', 'INSTRUMENTED_FUNCTION', 'ADMINISTRATIVE'
);
create type safeguard_class as enum (
  'PREVENTION', 'DETECTION', 'CONTROL', 'MITIGATION', 'EMERGENCY_RESPONSE', 'ADMINISTRATIVE'
);
create type report_status as enum ('DRAFT', 'REVIEWED', 'APPROVED', 'SUPERSEDED');
create type project_type as enum ('greenfield', 'brownfield', 'existing', 'revalidation');

-- ---------------------------------------------------------------------------
-- Organizations and users
-- ---------------------------------------------------------------------------

create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table users (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  email         citext,
  display_name  text not null,
  role          user_role not null default 'viewer',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, email)
);
create index users_org_idx on users(org_id);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create table projects (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  project_name          text not null,
  client_name           text,
  site_name             text,
  site_address          text,
  country               text,
  state                 text,
  district              text,
  industrial_estate     text,
  latitude              numeric(9,6),
  longitude             numeric(9,6),
  department            text,
  product               text,
  process               text,
  process_stage         text,
  project_type          project_type,
  revision              text not null default 'R0',
  study_start_date      date,
  study_end_date        date,
  process_description   text,
  chemistry             text,
  stoichiometry         text,
  batch_size            text,
  production_rate       text,
  charging_sequence     text,
  reaction_sequence     text,
  reaction_time         text,
  normal_operating_range text,
  design_range          text,
  utilities             text[] not null default '{}',
  startup_basis         text,
  shutdown_basis        text,
  emergency_shutdown_basis text,
  abnormal_cases        text,
  risk_matrix_id        uuid,
  research_enabled      boolean not null default false,
  confidential_documents boolean not null default true,
  source_precedence_enabled boolean not null default false,
  rev                   integer not null default 1,
  created_by            uuid references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index projects_org_idx on projects(org_id);

create table project_members (
  project_id    uuid not null references projects(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          user_role not null default 'viewer',
  created_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Jurisdiction profile: 1:1 with project. Every boolean is NULLABLE on
-- purpose — NULL means "not resolved" and the applicability engine returns
-- NOT_ENOUGH_DATA rather than guessing.
create table project_jurisdictions (
  project_id                uuid primary key references projects(id) on delete cascade,
  country                   text,
  state                     text,
  district                  text,
  local_authority           text,
  appropriate_government    text,
  establishment_category    text,
  process_category          text,
  hazardous_process         boolean,
  mah_candidate             boolean,
  worker_count              integer,
  environmental_category    text,
  consent_authority         text,
  scheduled_activity        boolean,
  emits_to_air              boolean,
  discharges_to_water_or_land boolean,
  hazardous_waste_generated boolean,
  groundwater_abstraction   boolean,
  dispatches_hazardous_goods boolean,
  peso_relevant             boolean,
  petroleum_class_present   boolean,
  compressed_gas_present    boolean,
  pressure_vessel_present   boolean,
  explosives_relevant       boolean,
  ammonium_nitrate_relevant boolean,
  calcium_carbide_relevant  boolean,
  boiler_in_scope           boolean,
  fire_authority            text,
  electrical_inspectorate   text,
  industrial_estate_authority text,
  rev                       integer not null default 1,
  resolved_by               uuid references users(id),
  resolved_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Documents, versions, chunks, provenance
-- ---------------------------------------------------------------------------

create table project_documents (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  title           text not null,
  doc_class       text,
  doc_number      text,
  doc_revision    text,
  issued_date     date,
  storage_key     text,
  mime_type       text,
  page_count      integer,
  current_version integer not null default 1,
  parse_status    text not null default 'PENDING',
  parse_error     text,
  uploaded_by     uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index project_documents_project_idx on project_documents(project_id);

create table document_versions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references project_documents(id) on delete cascade,
  version       integer not null,
  sha256        text not null,
  byte_size     bigint,
  storage_key   text,
  supersedes    uuid references document_versions(id),
  uploaded_by   uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (document_id, version)
);
create index document_versions_hash_idx on document_versions(sha256);

create table document_chunks (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  document_id     uuid not null references project_documents(id) on delete cascade,
  version_id      uuid references document_versions(id) on delete cascade,
  collection      text not null default 'PROJECT_DOCUMENTS',
  page            integer,
  locator         text,
  content         text not null,
  token_count     integer,
  embedding       vector(1536),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index document_chunks_project_idx on document_chunks(project_id);
create index document_chunks_collection_idx on document_chunks(collection);
create index document_chunks_embedding_idx on document_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- The citation register.
create table sources (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  source_type     source_label not null,
  title           text not null,
  publisher       text,
  url             text,
  document_id     uuid references project_documents(id) on delete set null,
  version_id      uuid references document_versions(id) on delete set null,
  locator         text,
  sha256          text,
  retrieved_at    timestamptz,
  verified_by     uuid references users(id),
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index sources_project_idx on sources(project_id);

-- One extracted (entity, field) value with its locator and status.
create table extracted_fields (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  entity_kind       text not null,          -- 'project' | 'equipment' | 'chemical' | 'node' ...
  entity_id         uuid,
  field             text not null,
  raw_text          text,
  value             text,
  unit              text,
  normalized_value  numeric,
  normalized_unit   text,
  status            field_status not null default 'DOCUMENT_EXTRACTED',
  confidence        numeric(4,3),
  method            text,                   -- 'text-layer' | 'ocr' | 'table' | 'ai-extract' | 'manual'
  source_refs       jsonb not null default '[]'::jsonb,
  ai_run_id         uuid,
  extracted_at      timestamptz not null default now(),
  verified_by       uuid references users(id),
  verified_at       timestamptz,
  rev               integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index extracted_fields_project_idx on extracted_fields(project_id);
create index extracted_fields_target_idx on extracted_fields(project_id, entity_kind, entity_id, field);

-- A set of extracted_fields for one target that disagree. Never auto-resolved.
create table field_conflicts (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  entity_kind     text not null,
  entity_id       uuid,
  field           text not null,
  candidate_ids   uuid[] not null,
  is_critical     boolean not null default false,
  status          text not null default 'OPEN',   -- OPEN | RESOLVED | ACCEPTED_AS_ASSUMPTION
  resolution      text,
  resolved_value_id uuid references extracted_fields(id),
  resolved_by     uuid references users(id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index field_conflicts_project_idx on field_conflicts(project_id, status);

-- ---------------------------------------------------------------------------
-- Process model
-- ---------------------------------------------------------------------------

create table process_steps (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  step_number     text not null,
  title           text not null,
  description     text,
  duration        text,
  temperature     text,
  pressure        text,
  source_refs     jsonb not null default '[]'::jsonb,
  sort_order      integer not null default 0,
  rev             integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index process_steps_project_idx on process_steps(project_id);

create table equipment (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references projects(id) on delete cascade,
  tag                     text not null,
  service                 text,
  type                    text,
  capacity                text,
  material_of_construction text,
  operating_temperature   numeric,
  operating_temperature_unit text,
  operating_pressure      numeric,
  operating_pressure_unit text,
  design_temperature      numeric,
  design_temperature_unit text,
  design_pressure         numeric,
  design_pressure_unit    text,
  mawp                    numeric,
  mawp_unit               text,
  heating_system          text,
  cooling_system          text,
  agitator                boolean not null default false,
  agitator_details        text,
  relief_arrangement      text,
  vent_arrangement        text,
  pressure_equipment      boolean not null default false,
  compressed_gas_service  boolean not null default false,
  vacuum_service          boolean not null default false,
  powder_handling         boolean not null default false,
  nozzle_list             text,
  instruments             text[] not null default '{}',
  alarms                  text[] not null default '{}',
  trips                   text[] not null default '{}',
  interlocks              text[] not null default '{}',
  inspection_data         text,
  source_refs             jsonb not null default '[]'::jsonb,
  rev                     integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (project_id, tag)
);
create index equipment_project_idx on equipment(project_id);

create table equipment_connections (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  from_equipment  uuid not null references equipment(id) on delete cascade,
  to_equipment    uuid not null references equipment(id) on delete cascade,
  line_tag        text,
  line_size       text,
  service         text,
  source_refs     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index equipment_connections_project_idx on equipment_connections(project_id);

-- ---------------------------------------------------------------------------
-- Chemicals
-- ---------------------------------------------------------------------------

create table chemicals (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references projects(id) on delete cascade,
  canonical_name          text not null,
  synonyms                text[] not null default '{}',
  cas                     text,
  cas_valid               boolean,
  ec_number               text,
  formula                 text,
  molecular_weight        numeric,
  identity_status         field_status not null default 'MISSING',
  identity_match_kind     text,
  quantity                numeric,
  quantity_unit           text,
  quantity_status         field_status not null default 'MISSING',
  concentration           text,
  physical_state          text,
  process_temperature     numeric,
  process_temperature_unit text,
  process_pressure        numeric,
  process_pressure_unit   text,
  storage_quantity        numeric,
  storage_quantity_unit   text,
  storage_type            text,
  charging_method         text,
  hazardous_classification text,
  hazard_classes          text[] not null default '{}',
  sds_status              text,
  source_refs             jsonb not null default '[]'::jsonb,
  rev                     integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index chemicals_project_idx on chemicals(project_id);
create index chemicals_cas_idx on chemicals(cas);

create table chemical_inventory (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  chemical_id     uuid not null references chemicals(id) on delete cascade,
  location        text,
  container_type  text,
  quantity        numeric,
  quantity_unit   text,
  max_quantity    numeric,
  max_quantity_unit text,
  status          field_status not null default 'MISSING',
  source_refs     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index chemical_inventory_project_idx on chemical_inventory(project_id);

-- One row per (chemical, property). A chemical can hold a VERIFIED flash point
-- and a CONFLICT autoignition temperature at the same time.
create table chemical_properties (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  chemical_id     uuid not null references chemicals(id) on delete cascade,
  prop_group      text not null,
  prop_key        text not null,
  value           text,
  numeric_value   numeric,
  unit            text,
  at_temperature  numeric,
  status          field_status not null default 'MISSING',
  confidence      numeric(4,3),
  source_class    text,
  source_refs     jsonb not null default '[]'::jsonb,
  verified_by     uuid references users(id),
  verified_at     timestamptz,
  rev             integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (chemical_id, prop_key)
);
create index chemical_properties_project_idx on chemical_properties(project_id);

-- Candidate property values before resolution; the basis of a conflict card.
create table chemical_sources (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  chemical_id     uuid not null references chemicals(id) on delete cascade,
  prop_key        text not null,
  value           text,
  numeric_value   numeric,
  unit            text,
  source_class    text not null,
  source_id       uuid references sources(id) on delete set null,
  url             text,
  retrieved_at    timestamptz,
  status          field_status not null default 'WEB_SOURCED',
  created_at      timestamptz not null default now()
);
create index chemical_sources_lookup_idx on chemical_sources(chemical_id, prop_key);

-- ---------------------------------------------------------------------------
-- Risk matrices
-- ---------------------------------------------------------------------------

create table risk_matrices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references organizations(id) on delete cascade,
  project_id      uuid references projects(id) on delete cascade,
  matrix_key      text not null,
  version         integer not null default 1,
  name            text not null,
  combine         text not null default 'product',  -- 'product' | 'lookup'
  likelihood_scale jsonb not null,
  severity_scale  jsonb not null,
  cells           jsonb,
  bands           jsonb not null,
  alarp_enabled   boolean not null default true,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (matrix_key, version)
);

alter table projects
  add constraint projects_risk_matrix_fk
  foreign key (risk_matrix_id) references risk_matrices(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Nodes
-- ---------------------------------------------------------------------------

create table nodes (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects(id) on delete cascade,
  node_number         text not null,
  worksheet_name      text,
  description         text,
  design_intent       text,
  boundaries          text,
  document_refs       jsonb not null default '[]'::jsonb,
  utilities           text[] not null default '{}',
  operating_temperature numeric,
  operating_temperature_max numeric,
  operating_temperature_unit text,
  operating_pressure  numeric,
  operating_pressure_unit text,
  operating_params    jsonb not null default '{}'::jsonb,
  design_params       jsonb not null default '{}'::jsonb,
  instruments         text[] not null default '{}',
  alarms              text[] not null default '{}',
  trips               text[] not null default '{}',
  reliefs             text[] not null default '{}',
  has_charging        boolean not null default false,
  has_transfer        boolean not null default false,
  has_discharge       boolean not null default false,
  has_sampling        boolean not null default false,
  has_timed_step      boolean not null default false,
  is_reaction_step    boolean not null default false,
  exothermic          boolean,
  ph_controlled       boolean not null default false,
  manual_operation    boolean not null default false,
  viscous_service     boolean not null default false,
  review_status       node_review_status not null default 'PROPOSED',
  proposed_by         text,
  approved_by         uuid references users(id),
  approved_at         timestamptz,
  sort_order          integer not null default 0,
  split_from          uuid references nodes(id) on delete set null,
  merged_from         uuid[] not null default '{}',
  rev                 integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (project_id, node_number)
);
create index nodes_project_idx on nodes(project_id);

create table node_equipment (
  node_id       uuid not null references nodes(id) on delete cascade,
  equipment_id  uuid not null references equipment(id) on delete cascade,
  primary key (node_id, equipment_id)
);

create table node_lines (
  node_id       uuid not null references nodes(id) on delete cascade,
  connection_id uuid not null references equipment_connections(id) on delete cascade,
  primary key (node_id, connection_id)
);

create table node_chemicals (
  node_id       uuid not null references nodes(id) on delete cascade,
  chemical_id   uuid not null references chemicals(id) on delete cascade,
  role          text,
  primary key (node_id, chemical_id)
);

-- ---------------------------------------------------------------------------
-- HAZOP scenarios
-- ---------------------------------------------------------------------------

create table hazop_scenarios (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references projects(id) on delete cascade,
  node_id                 uuid not null references nodes(id) on delete cascade,
  row_number              integer not null,
  parameter               text not null,
  guideword               text not null,
  deviation               text not null,
  deviation_kind          text not null default 'GUIDEWORD',
  no_meaningful_deviation boolean not null default false,
  no_meaningful_reason    text,
  initial_likelihood      integer,
  initial_severity        integer,
  initial_risk            jsonb,      -- the engine's result incl. matrix id/version
  risk_basis              text,
  severity_dimensions     text[] not null default '{}',
  residual_likelihood     integer,
  residual_severity       integer,
  residual_risk           jsonb,
  residual_basis_kind     residual_basis_kind,
  residual_basis_text     text,
  acceptance_rationale    text,
  assumptions             text[] not null default '{}',
  evidence_refs           jsonb not null default '[]'::jsonb,
  reviewer_status         scenario_review_status not null default 'DRAFT',
  reviewed_by             uuid references users(id),
  reviewed_at             timestamptz,
  ai_run_id               uuid,
  rev                     integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (node_id, row_number)
);
create index hazop_scenarios_project_idx on hazop_scenarios(project_id);
create index hazop_scenarios_node_idx on hazop_scenarios(node_id);

create table scenario_causes (
  id            uuid primary key default gen_random_uuid(),
  scenario_id   uuid not null references hazop_scenarios(id) on delete cascade,
  family        text,
  text          text not null,
  source_refs   jsonb not null default '[]'::jsonb,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index scenario_causes_scenario_idx on scenario_causes(scenario_id);

create table scenario_consequences (
  id                      uuid primary key default gen_random_uuid(),
  scenario_id             uuid not null references hazop_scenarios(id) on delete cascade,
  family                  text,
  dimension               text,
  text                    text not null,
  safeguard_credit_flag   boolean not null default false,
  source_refs             jsonb not null default '[]'::jsonb,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now()
);
create index scenario_consequences_scenario_idx on scenario_consequences(scenario_id);

create table safeguards (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  node_id       uuid references nodes(id) on delete cascade,
  equipment_id  uuid references equipment(id) on delete set null,
  class         safeguard_class,
  text          text not null,
  is_existing   boolean not null default true,
  tag           text,
  source_refs   jsonb not null default '[]'::jsonb,
  rev           integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index safeguards_project_idx on safeguards(project_id);

create table scenario_safeguards (
  scenario_id   uuid not null references hazop_scenarios(id) on delete cascade,
  safeguard_id  uuid not null references safeguards(id) on delete cascade,
  adequacy      text,
  primary key (scenario_id, safeguard_id)
);

create table risk_assessments (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  scenario_id     uuid not null references hazop_scenarios(id) on delete cascade,
  stage           text not null,  -- 'INITIAL' | 'POST_EXISTING_SAFEGUARD' | 'RESIDUAL'
  likelihood      integer not null,
  severity        integer not null,
  score           integer,
  band_key        text not null,
  band_label      text not null,
  action          text,
  matrix_id       uuid not null references risk_matrices(id),
  matrix_version  integer not null,
  engine_version  text not null,
  basis           text,
  assessed_by     uuid references users(id),
  created_at      timestamptz not null default now()
);
create index risk_assessments_scenario_idx on risk_assessments(scenario_id);

-- ---------------------------------------------------------------------------
-- Recommendations
-- ---------------------------------------------------------------------------

create table recommendations (
  id                        uuid primary key default gen_random_uuid(),
  project_id                uuid not null references projects(id) on delete cascade,
  rec_id                    text not null,
  scenario_id               uuid references hazop_scenarios(id) on delete set null,
  node_id                   uuid references nodes(id) on delete set null,
  text                      text not null,
  technical_basis           text,
  legal_basis               text,
  standard_basis            text,
  control_level             control_level,
  equipment_tags            text[] not null default '{}',
  priority                  priority_level,
  responsible_department    text,
  responsible_person        text,
  target_date               date,
  status                    rec_status not null default 'OPEN',
  closure_evidence_required boolean not null default true,
  closure_comments          text,
  verifier                  uuid references users(id),
  verification_date         date,
  merged_from               text[] not null default '{}',
  raised_from               jsonb not null default '[]'::jsonb,
  ai_run_id                 uuid,
  rev                       integer not null default 1,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (project_id, rec_id)
);
create index recommendations_project_idx on recommendations(project_id);
create index recommendations_node_idx on recommendations(node_id);
create index recommendations_status_idx on recommendations(project_id, status);

create table recommendation_links (
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  scenario_id       uuid not null references hazop_scenarios(id) on delete cascade,
  origin_rec_id     text,
  primary key (recommendation_id, scenario_id)
);

create table recommendation_evidence (
  id                uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  document_id       uuid references project_documents(id) on delete set null,
  title             text not null,
  note              text,
  status            field_status not null default 'DOCUMENT_EXTRACTED',
  uploaded_by       uuid references users(id),
  verified_by       uuid references users(id),
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index recommendation_evidence_rec_idx on recommendation_evidence(recommendation_id);

-- ---------------------------------------------------------------------------
-- Team, assumptions, gaps
-- ---------------------------------------------------------------------------

create table team_members (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  serial_number   integer,
  name            text not null,
  designation     text,
  department      text,
  organization    text,
  role            text not null,
  discipline      text,
  experience      text,
  email           citext,
  attendance      jsonb not null default '[]'::jsonb,
  signature_key   text,
  comments        text,
  is_reviewer     boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index team_members_project_idx on team_members(project_id);

create table workshop_sessions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  session_date    date not null,
  start_time      time,
  end_time        time,
  nodes_covered   text[] not null default '{}',
  notes           text,
  created_at      timestamptz not null default now()
);

create table assumptions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  category        text,
  text            text not null,
  basis           text,
  node_id         uuid references nodes(id) on delete set null,
  scenario_id     uuid references hazop_scenarios(id) on delete set null,
  raised_by       uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index assumptions_project_idx on assumptions(project_id);

create table data_gaps (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  entity_kind     text,
  entity_id       uuid,
  field           text not null,
  label           text,
  blocks          text[] not null default '{}',
  resolve_with    text[] not null default '{}',
  node_ids        uuid[] not null default '{}',
  status          text not null default 'OPEN',
  detail          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index data_gaps_project_idx on data_gaps(project_id, status);

-- ---------------------------------------------------------------------------
-- AI runs, audit, reports
-- ---------------------------------------------------------------------------

create table ai_runs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid references projects(id) on delete cascade,
  task                  text not null,
  task_class            text not null,      -- light | medium | strong
  provider              text not null,
  model                 text,
  model_tier_requested  text,
  model_tier_applied    text,
  fallback_occurred     boolean not null default false,
  fallback_reason       text,
  prompt_version        text not null,
  schema_version        text not null,
  source_ids            uuid[] not null default '{}',
  facts_used            jsonb not null default '[]'::jsonb,
  assumptions           jsonb not null default '[]'::jsonb,
  missing_data          jsonb not null default '[]'::jsonb,
  confidence            numeric(4,3),
  human_review_required boolean not null default true,
  output_valid          boolean,
  validation_errors     jsonb,
  repaired              boolean not null default false,
  runtime_ms            integer,
  requested_by          uuid references users(id),
  created_at            timestamptz not null default now()
);
create index ai_runs_project_idx on ai_runs(project_id, created_at desc);

create table audit_logs (
  id            bigserial primary key,
  project_id    uuid references projects(id) on delete cascade,
  at            timestamptz not null default now(),
  actor_id      uuid references users(id),
  actor_kind    text not null default 'human',  -- human | ai | system
  action        text not null,
  entity_kind   text,
  entity_id     uuid,
  before_value  jsonb,
  after_value   jsonb,
  ai_run_id     uuid references ai_runs(id) on delete set null,
  source_refs   jsonb not null default '[]'::jsonb,
  note          text
);
create index audit_logs_project_idx on audit_logs(project_id, at desc);
create index audit_logs_entity_idx on audit_logs(entity_kind, entity_id);

-- Append-only in practice: no UPDATE or DELETE grant is issued on this table.
revoke update, delete on audit_logs from public;

create table report_versions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  revision        text not null,
  status          report_status not null default 'DRAFT',
  template_key    text,
  sections        jsonb not null default '[]'::jsonb,
  quality_gate    jsonb,
  engine_versions jsonb not null default '{}'::jsonb,
  storage_key     text,
  formats         text[] not null default '{}',
  generated_by    uuid references users(id),
  generated_at    timestamptz not null default now(),
  reviewed_by     uuid references users(id),
  reviewed_at     timestamptz,
  approved_by     uuid references users(id),
  approved_at     timestamptz,
  notes           text,
  unique (project_id, revision)
);
create index report_versions_project_idx on report_versions(project_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  if to_jsonb(new) ? 'rev' and to_jsonb(old) ? 'rev'
     and (to_jsonb(new) - 'updated_at' - 'rev') is distinct from (to_jsonb(old) - 'updated_at' - 'rev') then
    new.rev = old.rev + 1;
  end if;
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
