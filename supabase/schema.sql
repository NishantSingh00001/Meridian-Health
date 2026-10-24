-- Customer Data Bridge — core schema with RLS.
-- Every table is scoped to workspace_id; policies derive it from the JWT claim
-- set at auth time (never trust a workspace_id sent from the client).

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table connectors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source_system text not null,
  target_system text not null,
  status text not null default 'pending' check (status in ('live','warn','error','pending')),
  created_at timestamptz default now()
);

create table field_mappings (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references connectors(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  source_field text not null,
  target_field text not null,
  source_type text not null,
  target_type text not null,
  crosswalk jsonb,
  required boolean default false
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references connectors(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  status text not null check (status in ('success','partial','failed')),
  record_count int not null default 0,
  ran_at timestamptz default now()
);

create table exceptions (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references sync_runs(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  field text not null,
  reason text not null,
  resolved boolean default false
);

-- RLS: on every table, every row's workspace_id must match the caller's
-- workspace claim. This is what actually prevents one customer's PR/review
-- traffic from ever reading or writing another's rows — not app-layer checks.
alter table connectors enable row level security;
alter table field_mappings enable row level security;
alter table sync_runs enable row level security;
alter table exceptions enable row level security;

create policy workspace_isolation_connectors on connectors
  using (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);

create policy workspace_isolation_field_mappings on field_mappings
  using (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);

create policy workspace_isolation_sync_runs on sync_runs
  using (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);

create policy workspace_isolation_exceptions on exceptions
  using (workspace_id = (auth.jwt() ->> 'workspace_id')::uuid);
