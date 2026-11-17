create table if not exists public.push_subscriptions (
  endpoint text primary key,
  username varchar(150) not null,
  teacher_id bigint not null,
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object'),
  last_pending_message_id text,
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions
  add column if not exists last_pending_message_id text;

create index if not exists push_subscriptions_teacher_id_idx
  on public.push_subscriptions (teacher_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant all on table public.push_subscriptions to service_role;
