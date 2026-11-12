create table if not exists public.app_state_store (
  id integer primary key default 1 check (id = 1),
  state_json jsonb not null check (jsonb_typeof(state_json) = 'object'),
  state_revision text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.offline_commit_archive (
  commit_id varchar(128) primary key,
  client_id varchar(128) not null,
  client_ip inet not null,
  actor_username varchar(150),
  base_revision varchar(80),
  committed_at timestamptz not null,
  changed_at_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(changed_at_json) = 'object')
);

create index if not exists offline_commit_archive_client_id_idx
  on public.offline_commit_archive (client_id);

create index if not exists offline_commit_archive_committed_at_idx
  on public.offline_commit_archive (committed_at desc);

create table if not exists public.auth_vault (
  id integer primary key default 1 check (id = 1),
  vault_ciphertext text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.system_backups (
  id text primary key,
  created_at timestamptz not null,
  created_by text not null,
  label text not null,
  file_name text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);

create index if not exists system_backups_created_at_idx
  on public.system_backups (created_at desc);

create table if not exists public.auth_rate_limits (
  bucket_key text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now()
);

create or replace function public.consume_auth_attempt(
  p_bucket_key text,
  p_max_attempts integer default 5,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempts integer;
begin
  insert into public.auth_rate_limits (bucket_key, attempts, window_started_at)
  values (p_bucket_key, 1, now())
  on conflict (bucket_key) do update
  set attempts = case
        when auth_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
        else auth_rate_limits.attempts + 1
      end,
      window_started_at = case
        when auth_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
        else auth_rate_limits.window_started_at
      end
  returning attempts into current_attempts;

  return current_attempts <= p_max_attempts;
end;
$$;

create or replace function public.save_app_state(
  p_state jsonb,
  p_expected_revision text
)
returns table (state_revision text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  next_revision text := gen_random_uuid()::text;
begin
  if jsonb_typeof(p_state) <> 'object' then
    raise exception 'Application state must be a JSON object' using errcode = '22023';
  end if;

  insert into public.app_state_store as current_state (
    id, state_json, state_revision, updated_at
  )
  values (1, p_state, next_revision, now())
  on conflict (id) do update
  set state_json = excluded.state_json,
      state_revision = excluded.state_revision,
      updated_at = excluded.updated_at
  where current_state.state_revision is not distinct from p_expected_revision
    and current_state.state_json is distinct from excluded.state_json;

  if not found then
    if exists (
      select 1
      from public.app_state_store as current_state
      where current_state.id = 1
        and current_state.state_revision is not distinct from p_expected_revision
        and current_state.state_json is not distinct from p_state
    ) then
      return query
      select current_state.state_revision, current_state.updated_at
      from public.app_state_store as current_state
      where current_state.id = 1;
      return;
    end if;
    raise exception 'Application state changed since it was loaded' using errcode = '40001';
  end if;

  return query
  select current_state.state_revision, current_state.updated_at
  from public.app_state_store as current_state
  where current_state.id = 1;
end;
$$;

create or replace function public.load_app_state()
returns table (state_json jsonb, state_revision text, updated_at timestamptz)
language sql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
  select state_row.state_json, state_row.state_revision, state_row.updated_at
  from public.app_state_store as state_row
  where state_row.id = 1;
$$;

alter table public.app_state_store enable row level security;
alter table public.offline_commit_archive enable row level security;
alter table public.auth_vault enable row level security;
alter table public.system_backups enable row level security;
alter table public.auth_rate_limits enable row level security;

revoke all on table public.app_state_store from anon, authenticated;
revoke all on table public.offline_commit_archive from anon, authenticated;
revoke all on table public.auth_vault from anon, authenticated;
revoke all on table public.system_backups from anon, authenticated;
revoke all on table public.auth_rate_limits from anon, authenticated;
revoke all on function public.consume_auth_attempt(text, integer, integer) from public, anon, authenticated;
revoke all on function public.save_app_state(jsonb, text) from public, anon, authenticated;
revoke all on function public.load_app_state() from public, anon, authenticated;

grant all on table public.app_state_store to service_role;
grant all on table public.offline_commit_archive to service_role;
grant all on table public.auth_vault to service_role;
grant all on table public.system_backups to service_role;
grant all on table public.auth_rate_limits to service_role;
grant execute on function public.consume_auth_attempt(text, integer, integer) to service_role;
grant execute on function public.save_app_state(jsonb, text) to service_role;
grant execute on function public.load_app_state() to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('edugrade-documents', 'edugrade-documents', false, 15728640)
on conflict (id) do update
set public = false,
    file_size_limit = 15728640;
