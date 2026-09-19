create table public.translation_archives (
  id uuid primary key default gen_random_uuid(),
  owner_hash text not null,
  translation_request_id uuid unique references public.translation_requests(id) on delete set null,
  source_session_id uuid references public.sessions(id) on delete set null,
  source_boss_id uuid not null,
  boss_snapshot jsonb not null,
  input_text text not null,
  channel text not null,
  result jsonb not null,
  last_copied_reply_index smallint check (last_copied_reply_index between 0 and 2),
  actual_response text,
  actual_reply_index smallint check (actual_reply_index between 0 and 2),
  actual_reply_text text,
  actual_response_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index translation_archives_owner_created_idx on public.translation_archives(owner_hash, created_at desc);
create index translation_archives_boss_idx on public.translation_archives(source_boss_id);

create table public.translation_archive_branches (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.translation_archives(id) on delete cascade,
  kind text not null check (kind in ('PREDICTED', 'ACTUAL')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUPERSEDED', 'FAILED')),
  reply_index smallint not null check (reply_index between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index translation_archive_branches_archive_idx on public.translation_archive_branches(archive_id, created_at desc);

create table public.translation_archive_messages (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.translation_archive_branches(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  kind text not null check (kind in ('CHAT', 'SIMULATION_SOURCE', 'SIMULATION_REPLY', 'SIMULATION_REACTION', 'ACTUAL_RESPONSE')),
  content text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  unique (branch_id, position)
);

alter table public.chat_messages add column if not exists kind text not null default 'CHAT';
alter table public.chat_messages drop constraint if exists chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check
  check (kind in ('CHAT', 'SIMULATION_SOURCE', 'SIMULATION_REPLY', 'SIMULATION_REACTION', 'ACTUAL_RESPONSE'));

with ranked_threads as (
  select id, row_number() over (partition by session_id, boss_id order by created_at desc, id desc) as position
  from public.chat_threads
)
delete from public.chat_threads where id in (select id from ranked_threads where position > 1);

create unique index if not exists chat_threads_session_boss_unique on public.chat_threads(session_id, boss_id);
alter table public.chat_threads
  add column if not exists archive_id uuid references public.translation_archives(id) on delete set null,
  add column if not exists archive_branch_id uuid references public.translation_archive_branches(id) on delete set null;

alter table public.boss_evidence
  add column if not exists source_archive_id uuid references public.translation_archives(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists boss_evidence_feedback_archive_unique
  on public.boss_evidence(session_id, source_archive_id)
  where type = 'FEEDBACK' and source_archive_id is not null;

alter table public.translation_archives enable row level security;
alter table public.translation_archive_branches enable row level security;
alter table public.translation_archive_messages enable row level security;
