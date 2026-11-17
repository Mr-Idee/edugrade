create or replace function public.save_score_state(
  p_changes jsonb,
  p_deletes jsonb,
  p_audit_logs jsonb,
  p_expected_revision text
)
returns table (state_revision text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  current_revision text;
  current_updated_at timestamptz;
  changed_record_count bigint;
  deleted_record_count bigint;
  inserted_audit_count bigint;
  next_revision text;
begin
  select app_state_store.state_revision, app_state_store.updated_at
  into current_revision, current_updated_at
  from public.app_state_store
  where id = 1
  for update;

  if not found or current_revision is distinct from p_expected_revision then
    raise exception 'Application state changed since it was loaded' using errcode = '40001';
  end if;

  if jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_typeof(p_deletes) is distinct from 'array'
    or jsonb_typeof(p_audit_logs) is distinct from 'array' then
    raise exception 'Score changes, deletions, and audit entries must be JSON arrays'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as item(value)
    where item.value->>'recordType' is null
      or item.value->>'recordType' not in ('scores', 'termSubjectRecords', 'termSummaries')
      or jsonb_typeof(item.value->'recordJson') is distinct from 'object'
      or coalesce(item.value->>'recordKey', '') = ''
  ) then
    raise exception 'Invalid score-state record change' using errcode = '22023';
  end if;

  delete from public.score_state_records as existing
  using jsonb_array_elements(p_deletes) as item(value)
  where existing.record_type = item.value->>'recordType'
    and existing.record_key = item.value->>'recordKey'
    and existing.record_type in ('scores', 'termSubjectRecords', 'termSummaries');
  get diagnostics deleted_record_count = row_count;

  insert into public.score_state_records (record_type, record_key, record_json)
  select
    item.value->>'recordType',
    item.value->>'recordKey',
    item.value->'recordJson'
  from jsonb_array_elements(p_changes) as item(value)
  on conflict (record_type, record_key) do update
  set record_json = excluded.record_json
  where score_state_records.record_json is distinct from excluded.record_json;
  get diagnostics changed_record_count = row_count;

  inserted_audit_count := public.insert_score_audit_logs(p_audit_logs);
  if deleted_record_count = 0 and changed_record_count = 0 and inserted_audit_count = 0 then
    return query
    select current_revision, current_updated_at;
    return;
  end if;

  next_revision := gen_random_uuid()::text;
  update public.app_state_store
  set state_revision = next_revision,
      updated_at = now()
  where id = 1;

  return query
  select state_row.state_revision, state_row.updated_at
  from public.app_state_store as state_row
  where state_row.id = 1;
end;
$$;
