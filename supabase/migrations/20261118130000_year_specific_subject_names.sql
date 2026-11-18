with current_state as (
  select
    state_json,
    (
      select jsonb_object_agg(section.value->>'id', 'HOME ECONOMICS')
      from jsonb_array_elements(
        case
          when jsonb_typeof(state_json->'classSections') = 'array'
            then state_json->'classSections'
          else '[]'::jsonb
        end
      ) as section(value)
      where upper(coalesce(section.value->>'levelType', '')) = 'JUNIOR'
        and regexp_replace(upper(coalesce(section.value->>'name', '')), '[^A-Z0-9]', '', 'g') like 'YEAR9%'
        and section.value->>'id' ~ '^[0-9]+$'
    ) as year9_overrides,
    (
      select jsonb_object_agg(section.value->>'id', 'CIVIC EDUCATION')
      from jsonb_array_elements(
        case
          when jsonb_typeof(state_json->'classSections') = 'array'
            then state_json->'classSections'
          else '[]'::jsonb
        end
      ) as section(value)
      where upper(coalesce(section.value->>'levelType', '')) = 'SENIOR'
        and regexp_replace(upper(coalesce(section.value->>'name', '')), '[^A-Z0-9]', '', 'g') like 'YEAR12%'
        and section.value->>'id' ~ '^[0-9]+$'
    ) as year12_overrides
  from public.app_state_store
  where id = 1
),
updated_state as (
  select
    state_json,
    coalesce((
      select jsonb_agg(
        case
          when jsonb_typeof(year9_overrides) = 'object'
            and upper(coalesce(subject.value->>'applicableLevel', '')) = 'JUNIOR'
            and (
              upper(coalesce(subject.value->>'code', '')) = 'FASH'
              or regexp_replace(upper(coalesce(subject.value->>'name', '')), '[^A-Z0-9]', '', 'g')
                = 'FASHIONDESIGNANDGARMENTMAKING'
              or upper(coalesce(subject.value->>'name', '')) = 'FDGM'
            )
          then subject.value || jsonb_build_object(
            'sectionNameOverrides',
            (case
              when jsonb_typeof(subject.value->'sectionNameOverrides') = 'object'
                then subject.value->'sectionNameOverrides'
              else '{}'::jsonb
            end) || year9_overrides
          )
          when jsonb_typeof(year12_overrides) = 'object'
            and upper(coalesce(subject.value->>'applicableLevel', '')) = 'SENIOR'
            and (
              upper(coalesce(subject.value->>'code', '')) = 'CITI'
              or regexp_replace(upper(coalesce(subject.value->>'name', '')), '[^A-Z0-9]', '', 'g')
                = 'CITIZENSHIPANDHERITAGESTUDIES'
            )
          then subject.value || jsonb_build_object(
            'sectionNameOverrides',
            (case
              when jsonb_typeof(subject.value->'sectionNameOverrides') = 'object'
                then subject.value->'sectionNameOverrides'
              else '{}'::jsonb
            end) || year12_overrides
          )
          else subject.value
        end
        order by subject.ordinality
      )
      from jsonb_array_elements(
        case
          when jsonb_typeof(state_json->'subjects') = 'array'
            then state_json->'subjects'
          else '[]'::jsonb
        end
      ) with ordinality as subject(value, ordinality)
    ), '[]'::jsonb) as updated_subjects
  from current_state
)
update public.app_state_store as stored_state
set state_json = updated_state.state_json || jsonb_build_object('subjects', updated_state.updated_subjects),
    state_checksum = md5((
      updated_state.state_json || jsonb_build_object('subjects', updated_state.updated_subjects)
    )::text),
    state_revision = gen_random_uuid()::text,
    updated_at = now()
from updated_state
where stored_state.id = 1
  and jsonb_typeof(updated_state.state_json->'subjects') = 'array'
  and updated_state.updated_subjects is distinct from updated_state.state_json->'subjects';
