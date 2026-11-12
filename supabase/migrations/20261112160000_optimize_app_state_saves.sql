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

revoke all on function public.load_app_state() from public, anon, authenticated;
grant execute on function public.load_app_state() to service_role;
