create table public.global_boss_upload_intents (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references public.bosses(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null check (content_type in ('text/plain', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 8388608),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint global_upload_boss_ck check (boss_id = '00000000-0000-4000-8000-000000000001')
);
create index global_boss_upload_expiry_idx on public.global_boss_upload_intents(expires_at);

create table public.global_boss_evidence (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references public.bosses(id) on delete cascade,
  type text not null check (type in ('TEXT', 'TXT', 'IMAGE', 'SURVEY')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
  source_name text,
  raw_text text,
  storage_path text,
  parsed_data jsonb,
  error_message text,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint global_evidence_boss_ck check (boss_id = '00000000-0000-4000-8000-000000000001')
);
create index global_boss_evidence_created_idx on public.global_boss_evidence(created_at desc);

create table public.global_boss_survey_answers (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references public.bosses(id) on delete cascade,
  question_id text not null,
  question_snapshot jsonb not null,
  selected_option text,
  free_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (boss_id, question_id),
  constraint global_survey_boss_ck check (boss_id = '00000000-0000-4000-8000-000000000001')
);

alter table public.global_boss_upload_intents enable row level security;
alter table public.global_boss_evidence enable row level security;
alter table public.global_boss_survey_answers enable row level security;

alter table public.admin_operations drop constraint admin_operations_type_check;
alter table public.admin_operations add constraint admin_operations_type_check check (
  type in ('JOB_RETRY', 'CLEANUP', 'ANALYTICS_ROLLUP', 'GLOBAL_BOSS_UPDATE', 'GLOBAL_PERSONA_REBUILD')
);
