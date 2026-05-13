-- Incident Analytics Dashboard — Supabase Schema
-- Full schema reflecting all tables as of 2026-05-12.
-- Run once on a fresh project; for existing projects use the migration scripts.

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Enum types ────────────────────────────────────────────────────────────────
create type public.upload_job_status as enum ('pending','processing','completed','failed');
create type public.module_code       as enum ('im','jo');

-- ═════════════════════════════════════════════════════════════════════════════
-- Upload jobs & files
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.upload_jobs (
  id              uuid                    primary key default gen_random_uuid(),
  organization_id uuid                    not null,
  module_code     public.module_code      not null,
  status          public.upload_job_status not null default 'pending',
  source_name     text,
  requested_by    uuid,
  started_at      timestamptz,
  completed_at    timestamptz,
  failed_reason   text,
  total_files     integer                 not null default 0,
  total_rows      integer                 not null default 0,
  processed_rows  integer                 not null default 0,
  created_at      timestamptz             not null default now(),
  updated_at      timestamptz             not null default now()
);

create table if not exists public.uploaded_files (
  id              uuid               primary key default gen_random_uuid(),
  organization_id uuid               not null,
  upload_job_id   uuid               not null references public.upload_jobs(id) on delete cascade,
  module_code     public.module_code not null,
  file_name       text               not null,
  mime_type       text,
  file_size_bytes bigint,
  file_hash       text               not null,
  storage_bucket  text,
  storage_path    text,
  uploaded_by     uuid,
  uploaded_at     timestamptz        not null default now(),
  created_at      timestamptz        not null default now(),
  updated_at      timestamptz        not null default now()
);

-- ═════════════════════════════════════════════════════════════════════════════
-- IM (Incident Management) tables
-- ═════════════════════════════════════════════════════════════════════════════

-- Raw CSV rows before validation
create table if not exists public.im_staging_rows (
  id               bigint      generated always as identity primary key,
  organization_id  uuid        not null,
  upload_job_id    uuid        not null references public.upload_jobs(id) on delete cascade,
  uploaded_file_id uuid        not null references public.uploaded_files(id) on delete cascade,
  row_number       integer     not null,
  raw_row          jsonb       not null,   -- original key→value map from CSV
  parse_error      text,
  is_valid         boolean     not null default true,
  created_at       timestamptz not null default now()
);

-- Normalised, validated IM records (one row per CSV incident)
create table if not exists public.im_records (
  id               bigint      generated always as identity primary key,
  organization_id  uuid        not null,
  upload_job_id    uuid        not null references public.upload_jobs(id) on delete cascade,
  uploaded_file_id uuid        references public.uploaded_files(id),
  source_row_id    bigint      references public.im_staging_rows(id),

  -- ── Incident identity ──────────────────────────────────────────────────────
  incident_case    text,                   -- e.g. IC-00539-001
  incident_status  text,                   -- Completed / Cancelled / Pending …
  incident_category    text,
  incident_item_name   text,
  incident_description text,
  incident_location    text,
  severity             text,               -- Critical / High / Medium / Low
  subject              text,
  source_of_complaint  text,

  -- ── Dates ─────────────────────────────────────────────────────────────────
  created_date     timestamptz,            -- "Created Date" column
  incident_datetime timestamptz,           -- "Incident Date/Time" column

  -- ── Guest profile ──────────────────────────────────────────────────────────
  guest_name       text,
  room_no          text,
  profile_type     text,                   -- Guest / Company / …
  vip_code         text,                   -- e.g. V8, VIP1, or blank / '-'
  membership_number text,
  reservation_number text,
  date_of_birth    text,                   -- kept as text; format varies by property
  company_name     text,

  -- ── Stay details ──────────────────────────────────────────────────────────
  arrival_date     timestamptz,
  departure_date   timestamptz,
  nights           numeric,
  rates            text,
  rate_code        text,
  booking_source   text,
  visits           text,                   -- number of prior stays; may be blank

  -- ── Staff ─────────────────────────────────────────────────────────────────
  created_by       text,
  department       text,

  -- ── Investigation cycle 1 ─────────────────────────────────────────────────
  investigation_1           text,
  investigation_remarks_1   text,
  investigation_updated_by_1 text,
  investigation_updated_on_1 timestamptz,

  -- ── Investigation cycle 2 ─────────────────────────────────────────────────
  investigation_2           text,
  investigation_remarks_2   text,
  investigation_updated_by_2 text,
  investigation_updated_on_2 timestamptz,

  -- ── Feedback cycle 1 ──────────────────────────────────────────────────────
  feedback_method_1      text,
  feedback_updated_by_1  text,
  feedback_updated_on_1  timestamptz,
  feedback_remarks_1     text,

  -- ── Full raw row (catch-all for any additional columns) ───────────────────
  normalized_row jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dashboard JSON (one row per upload job, upserted on re-finalize)
create table if not exists public.im_dashboard_json (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null,
  upload_job_id   uuid        not null references public.upload_jobs(id) on delete cascade,
  schema_version  text        not null,
  generated_json  jsonb       not null,
  generated_at    timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (upload_job_id)
);

-- ═════════════════════════════════════════════════════════════════════════════
-- JO (Job Order) tables
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.jo_staging_rows (
  id               bigint      generated always as identity primary key,
  organization_id  uuid        not null,
  upload_job_id    uuid        not null references public.upload_jobs(id) on delete cascade,
  uploaded_file_id uuid        not null references public.uploaded_files(id) on delete cascade,
  row_number       integer     not null,
  raw_row          jsonb       not null,
  parse_error      text,
  is_valid         boolean     not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.jo_records (
  id               bigint      generated always as identity primary key,
  organization_id  uuid        not null,
  upload_job_id    uuid        not null references public.upload_jobs(id) on delete cascade,
  uploaded_file_id uuid        references public.uploaded_files(id),
  source_row_id    bigint      references public.jo_staging_rows(id),

  department_name      text,
  created_datetime     timestamptz,
  job_status           text,
  job_order            text,
  guest_name           text,
  location             text,
  service_item_category text,
  service_item         text,
  quantity             numeric,
  remarks              text,
  execution_duration   text,
  initial_deadline     timestamptz,
  extended_deadline    timestamptz,
  acknowledged_datetime timestamptz,
  completed_datetime   timestamptz,
  delay_duration       text,
  created_by_department text,
  created_by_user       text,
  assigned_to_department text,
  assigned_to_user      text,
  acknowledged_by_department text,
  acknowledged_by_user  text,
  completed_by_department text,
  completed_by_user     text,
  total_hour_between_created_to_completed text,
  total_act_between_acknowledged_to_completed text,
  comments              text,
  attachment            text,
  reassigned_job        text,
  escalation_group      text,

  normalized_row jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jo_dashboard_json (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null,
  upload_job_id   uuid        not null references public.upload_jobs(id) on delete cascade,
  schema_version  text        not null,
  generated_json  jsonb       not null,
  generated_at    timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (upload_job_id)
);

-- ═════════════════════════════════════════════════════════════════════════════
-- Indexes
-- ═════════════════════════════════════════════════════════════════════════════

-- upload_jobs
create index if not exists upload_jobs_org_idx        on public.upload_jobs (organization_id);
create index if not exists upload_jobs_status_idx     on public.upload_jobs (status);
create index if not exists upload_jobs_module_idx     on public.upload_jobs (module_code);

-- uploaded_files
create index if not exists uploaded_files_job_idx     on public.uploaded_files (upload_job_id);

-- im_records — analytics columns
create index if not exists im_records_job_idx             on public.im_records (upload_job_id);
create index if not exists im_records_incident_status_idx on public.im_records (incident_status);
create index if not exists im_records_severity_idx        on public.im_records (severity);
create index if not exists im_records_created_date_idx    on public.im_records (created_date);
create index if not exists im_records_incident_datetime_idx on public.im_records (incident_datetime);
create index if not exists im_records_vip_code_idx        on public.im_records (vip_code);
create index if not exists im_records_department_idx      on public.im_records (department);
create index if not exists im_records_booking_source_idx  on public.im_records (booking_source);
create index if not exists im_records_profile_type_idx    on public.im_records (profile_type);
create index if not exists im_records_incident_category_idx on public.im_records (incident_category);

-- jo_records
create index if not exists jo_records_job_idx             on public.jo_records (upload_job_id);
create index if not exists jo_records_status_idx          on public.jo_records (job_status);
create index if not exists jo_records_created_datetime_idx on public.jo_records (created_datetime);

-- dashboard JSON
create index if not exists im_dashboard_json_job_idx      on public.im_dashboard_json (upload_job_id);
create index if not exists im_dashboard_json_created_idx  on public.im_dashboard_json (created_at);
create index if not exists jo_dashboard_json_job_idx      on public.jo_dashboard_json (upload_job_id);
