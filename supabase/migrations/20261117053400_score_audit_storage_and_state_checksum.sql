create table if not exists public.score_state_records (
  record_type text not null check (
    record_type in ('scores', 'termSubjectRecords', 'termSummaries')
  ),
  record_key text not null,
  record_json jsonb not null check (jsonb_typeof(record_json) = 'object'),
  primary key (record_type, record_key)
);

create table if not exists public.score_audit_logs (
  id bigint primary key,
  student_id bigint,
  subject_id bigint,
  audit_json jsonb not null check (jsonb_typeof(audit_json) = 'object'),
  created_at timestamptz not null
);

create index if not exists score_audit_logs_created_at_idx
  on public.score_audit_logs (created_at desc, id desc);

alter table public.score_state_records enable row level security;
alter table public.score_audit_logs enable row level security;
revoke all on table public.score_state_records from anon, authenticated;
revoke all on table public.score_audit_logs from anon, authenticated;
grant all on table public.score_state_records to service_role;
grant all on table public.score_audit_logs to service_role;

insert into public.score_state_records (record_type, record_key, record_json)
select
  'scores',
  concat_ws(':', item.value->>'studentId', item.value->>'subjectId', item.value->>'componentId'),
  item.value
from public.app_state_store as state_row
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(state_row.state_json->'scores') = 'array'
      then state_row.state_json->'scores'
    else '[]'::jsonb
  end
) as item(value)
where item.value->>'studentId' ~ '^[0-9]+$'
  and item.value->>'subjectId' ~ '^[0-9]+$'
  and item.value->>'componentId' ~ '^[0-9]+$'
on conflict (record_type, record_key) do nothing;

insert into public.score_state_records (record_type, record_key, record_json)
select
  'termSubjectRecords',
  concat_ws(':', item.value->>'studentId', item.value->>'subjectId', item.value->>'termId'),
  item.value
from public.app_state_store as state_row
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(state_row.state_json->'termSubjectRecords') = 'array'
      then state_row.state_json->'termSubjectRecords'
    else '[]'::jsonb
  end
) as item(value)
where item.value->>'studentId' ~ '^[0-9]+$'
  and item.value->>'subjectId' ~ '^[0-9]+$'
  and item.value->>'termId' ~ '^[0-9]+$'
on conflict (record_type, record_key) do nothing;

insert into public.score_state_records (record_type, record_key, record_json)
select
  'termSummaries',
  concat_ws(':', item.value->>'studentId', item.value->>'sectionId', item.value->>'termId'),
  item.value
from public.app_state_store as state_row
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(state_row.state_json->'termSummaries') = 'array'
      then state_row.state_json->'termSummaries'
    else '[]'::jsonb
  end
) as item(value)
where item.value->>'studentId' ~ '^[0-9]+$'
  and item.value->>'sectionId' ~ '^[0-9]+$'
  and item.value->>'termId' ~ '^[0-9]+$'
on conflict (record_type, record_key) do nothing;

insert into public.score_audit_logs (id, student_id, subject_id, audit_json, created_at)
select
  (entry.value->>'id')::bigint,
  case when entry.value->>'studentId' ~ '^-?[0-9]+$'
    then (entry.value->>'studentId')::bigint end,
  case when entry.value->>'subjectId' ~ '^-?[0-9]+$'
    then (entry.value->>'subjectId')::bigint end,
  entry.value,
  coalesce(nullif(entry.value->>'createdAt', '')::timestamptz, now())
from public.app_state_store as state_row
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(state_row.state_json->'auditLogs') = 'array'
      then state_row.state_json->'auditLogs'
    else '[]'::jsonb
  end
) as entry(value)
where entry.value->>'id' ~ '^[0-9]+$'
on conflict (id) do nothing;

alter table public.app_state_store
  add column if not exists state_checksum text;

update public.app_state_store
set state_json = state_json || jsonb_build_object(
      'scores', '[]'::jsonb,
      'termSubjectRecords', '[]'::jsonb,
      'termSummaries', '[]'::jsonb,
      'auditLogs', '[]'::jsonb
    ),
    state_checksum = md5((
      state_json || jsonb_build_object(
        'scores', '[]'::jsonb,
        'termSubjectRecords', '[]'::jsonb,
        'termSummaries', '[]'::jsonb,
        'auditLogs', '[]'::jsonb
      )
    )::text)
where id = 1;

alter table public.app_state_store
  alter column state_checksum set not null;

create or replace function public.replace_score_state_records(p_state jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count bigint := 0;
  affected_rows bigint;
begin
  insert into public.score_state_records (record_type, record_key, record_json)
  select
    'scores',
    concat_ws(':', item.value->>'studentId', item.value->>'subjectId', item.value->>'componentId'),
    item.value
  from jsonb_array_elements(p_state->'scores') as item(value)
  on conflict (record_type, record_key) do update
  set record_json = excluded.record_json
  where score_state_records.record_json is distinct from excluded.record_json;
  get diagnostics affected_rows = row_count;
  changed_count := changed_count + affected_rows;

  delete from public.score_state_records as existing
  where existing.record_type = 'scores'
    and not exists (
      select 1
      from jsonb_array_elements(p_state->'scores') as item(value)
      where concat_ws(':', item.value->>'studentId', item.value->>'subjectId', item.value->>'componentId')
        = existing.record_key
    );
  get diagnostics affected_rows = row_count;
  changed_count := changed_count + affected_rows;

  insert into public.score_state_records (record_type, record_key, record_json)
  select
    'termSubjectRecords',
    concat_ws(':', item.value->>'studentId', item.value->>'subjectId', item.value->>'termId'),
    item.value
  from jsonb_array_elements(p_state->'termSubjectRecords') as item(value)
  on conflict (record_type, record_key) do update
  set record_json = excluded.record_json
  where score_state_records.record_json is distinct from excluded.record_json;
  get diagnostics affected_rows = row_count;
  changed_count := changed_count + affected_rows;

  delete from public.score_state_records as existing
  where existing.record_type = 'termSubjectRecords'
    and not exists (
      select 1
      from jsonb_array_elements(p_state->'termSubjectRecords') as item(value)
      where concat_ws(':', item.value->>'studentId', item.value->>'subjectId', item.value->>'termId')
        = existing.record_key
    );
  get diagnostics affected_rows = row_count;
  changed_count := changed_count + affected_rows;

  insert into public.score_state_records (record_type, record_key, record_json)
  select
    'termSummaries',
    concat_ws(':', item.value->>'studentId', item.value->>'sectionId', item.value->>'termId'),
    item.value
  from jsonb_array_elements(p_state->'termSummaries') as item(value)
  on conflict (record_type, record_key) do update
  set record_json = excluded.record_json
  where score_state_records.record_json is distinct from excluded.record_json;
  get diagnostics affected_rows = row_count;
  changed_count := changed_count + affected_rows;

  delete from public.score_state_records as existing
  where existing.record_type = 'termSummaries'
    and not exists (
      select 1
      from jsonb_array_elements(p_state->'termSummaries') as item(value)
      where concat_ws(':', item.value->>'studentId', item.value->>'sectionId', item.value->>'termId')
        = existing.record_key
    );
  get diagnostics affected_rows = row_count;
  changed_count := changed_count + affected_rows;

  return changed_count;
end;
$$;

create or replace function public.insert_score_audit_logs(p_entries jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count bigint;
begin
  insert into public.score_audit_logs (id, student_id, subject_id, audit_json, created_at)
  select
    (entry.value->>'id')::bigint,
    case when entry.value->>'studentId' ~ '^-?[0-9]+$'
      then (entry.value->>'studentId')::bigint end,
    case when entry.value->>'subjectId' ~ '^-?[0-9]+$'
      then (entry.value->>'subjectId')::bigint end,
    entry.value,
    coalesce(nullif(entry.value->>'createdAt', '')::timestamptz, now())
  from jsonb_array_elements(p_entries) as entry(value)
  on conflict (id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

drop function if exists public.save_app_state(jsonb, text);

create or replace function public.save_app_state(
  p_state jsonb,
  p_expected_revision text,
  p_audit_logs jsonb
)
returns table (state_revision text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  persisted_state jsonb;
  next_checksum text;
  next_revision text;
  current_row public.app_state_store%rowtype;
  state_exists boolean;
  changed_record_count bigint;
  inserted_audit_count bigint;
begin
  if jsonb_typeof(p_state) is distinct from 'object' then
    raise exception 'Application state must be a JSON object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_audit_logs) is distinct from 'array' then
    raise exception 'Score audit entries must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_typeof(p_state->'scores') is distinct from 'array'
    or jsonb_typeof(p_state->'termSubjectRecords') is distinct from 'array'
    or jsonb_typeof(p_state->'termSummaries') is distinct from 'array' then
    raise exception 'Score state collections must be JSON arrays' using errcode = '22023';
  end if;

  persisted_state := p_state || jsonb_build_object(
    'scores', '[]'::jsonb,
    'termSubjectRecords', '[]'::jsonb,
    'termSummaries', '[]'::jsonb,
    'auditLogs', '[]'::jsonb
  );
  next_checksum := md5(persisted_state::text);

  select *
  into current_row
  from public.app_state_store
  where id = 1
  for update;
  state_exists := found;

  if state_exists and current_row.state_revision is distinct from p_expected_revision then
    raise exception 'Application state changed since it was loaded' using errcode = '40001';
  end if;
  if not state_exists and p_expected_revision is not null then
    raise exception 'Application state changed since it was loaded' using errcode = '40001';
  end if;

  changed_record_count := public.replace_score_state_records(p_state);
  inserted_audit_count := public.insert_score_audit_logs(p_audit_logs);

  if state_exists
    and current_row.state_checksum = next_checksum
    and changed_record_count = 0
    and inserted_audit_count = 0 then
    return query
    select current_row.state_revision, current_row.updated_at;
    return;
  end if;

  next_revision := gen_random_uuid()::text;
  if state_exists then
    if current_row.state_checksum is distinct from next_checksum then
      update public.app_state_store
      set state_json = persisted_state,
          state_checksum = next_checksum,
          state_revision = next_revision,
          updated_at = now()
      where id = 1;
    else
      update public.app_state_store
      set state_revision = next_revision,
          updated_at = now()
      where id = 1;
    end if;
  else
    insert into public.app_state_store (
      id, state_json, state_checksum, state_revision, updated_at
    )
    values (1, persisted_state, next_checksum, next_revision, now());
  end if;

  return query
  select state_row.state_revision, state_row.updated_at
  from public.app_state_store as state_row
  where state_row.id = 1;
end;
$$;

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
  current_row public.app_state_store%rowtype;
  changed_record_count bigint;
  deleted_record_count bigint;
  inserted_audit_count bigint;
  next_revision text;
begin
  if jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_typeof(p_deletes) is distinct from 'array'
    or jsonb_typeof(p_audit_logs) is distinct from 'array' then
    raise exception 'Score changes, deletions, and audit entries must be JSON arrays'
      using errcode = '22023';
  end if;

  select *
  into current_row
  from public.app_state_store
  where id = 1
  for update;
  if not found or current_row.state_revision is distinct from p_expected_revision then
    raise exception 'Application state changed since it was loaded' using errcode = '40001';
  end if;

  delete from public.score_state_records as existing
  using jsonb_array_elements(p_deletes) as item(value)
  where existing.record_type = item.value->>'recordType'
    and existing.record_key = item.value->>'recordKey'
    and existing.record_type in ('scores', 'termSubjectRecords', 'termSummaries');
  get diagnostics deleted_record_count = row_count;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) as item(value)
    where item.value->>'recordType' not in ('scores', 'termSubjectRecords', 'termSummaries')
      or jsonb_typeof(item.value->'recordJson') is distinct from 'object'
      or coalesce(item.value->>'recordKey', '') = ''
  ) then
    raise exception 'Invalid score-state record change' using errcode = '22023';
  end if;

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
    select current_row.state_revision, current_row.updated_at;
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

create or replace function public.save_app_state(
  p_state jsonb,
  p_expected_revision text
)
returns table (state_revision text, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select *
  from public.save_app_state(
    p_state,
    p_expected_revision,
    coalesce(p_state->'auditLogs', '[]'::jsonb)
  );
$$;

create or replace function public.load_app_state()
returns table (state_json jsonb, state_revision text, updated_at timestamptz)
language sql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
  select
    state_row.state_json || jsonb_build_object(
      'scores',
      coalesce((
        select jsonb_agg(record_json)
        from public.score_state_records
        where record_type = 'scores'
      ), '[]'::jsonb),
      'termSubjectRecords',
      coalesce((
        select jsonb_agg(record_json)
        from public.score_state_records
        where record_type = 'termSubjectRecords'
      ), '[]'::jsonb),
      'termSummaries',
      coalesce((
        select jsonb_agg(record_json)
        from public.score_state_records
        where record_type = 'termSummaries'
      ), '[]'::jsonb),
      'auditLogs',
      coalesce((
        select jsonb_agg(audit_entry.audit_json)
        from (
          select audit_json
          from public.score_audit_logs
          order by created_at desc, id desc
        ) as audit_entry
      ), '[]'::jsonb)
    ),
    state_row.state_revision,
    state_row.updated_at
  from public.app_state_store as state_row
  where state_row.id = 1;
$$;

revoke all on function public.replace_score_state_records(jsonb) from public, anon, authenticated;
revoke all on function public.insert_score_audit_logs(jsonb) from public, anon, authenticated;
revoke all on function public.save_app_state(jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_app_state(jsonb, text) from public, anon, authenticated;
revoke all on function public.save_score_state(jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.load_app_state() from public, anon, authenticated;
grant execute on function public.save_app_state(jsonb, text, jsonb) to service_role;
grant execute on function public.save_app_state(jsonb, text) to service_role;
grant execute on function public.save_score_state(jsonb, jsonb, jsonb, text) to service_role;
grant execute on function public.load_app_state() to service_role;
