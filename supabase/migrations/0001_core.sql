create extension if not exists pgcrypto;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.user_profiles (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  handle text not null check (char_length(handle) between 3 and 20 and handle ~ '^[a-zA-Z0-9_\-가-힣]+$'),
  age_band smallint not null check (age_band in (20, 30, 40, 50, 60)),
  years_of_service_band text not null,
  rank text not null,
  entry_path text not null,
  weaknesses text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index user_profiles_handle_lower_idx on public.user_profiles (lower(handle));

create table public.bosses (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('GLOBAL', 'SESSION')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'BUILDING', 'READY', 'FAILED')),
  session_id uuid references public.sessions(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 40),
  avatar_key text not null,
  job_function text,
  years_of_service_band text,
  rank text,
  company_name text,
  age_band smallint check (age_band is null or age_band in (20, 30, 40, 50, 60)),
  hierarchy_score int check (hierarchy_score between 0 and 100),
  gender_balance_score int check (gender_balance_score between -100 and 100),
  company_research jsonb,
  persona_profile jsonb,
  persona_version int not null default 0,
  persona_error text,
  persona_built_at timestamptz,
  pki_score numeric(5,2),
  pki_breakdown jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint bosses_scope_session_ck check ((scope = 'GLOBAL' and session_id is null and expires_at is null) or (scope = 'SESSION' and session_id is not null and expires_at is not null))
);
create index bosses_session_idx on public.bosses(session_id, status);

create table public.boss_evidence (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references public.bosses(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  type text not null check (type in ('TEXT', 'TXT', 'IMAGE', 'SURVEY', 'CHAT', 'FEEDBACK')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
  raw_text text,
  storage_path text,
  parsed_data jsonb,
  observation_categories text[] not null default '{}',
  context_quality numeric(4,3),
  error_message text,
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index boss_evidence_owner_idx on public.boss_evidence(session_id, boss_id);
create index boss_evidence_expiry_idx on public.boss_evidence(expires_at);

create table public.boss_survey_answers (
  id uuid primary key default gen_random_uuid(),
  boss_id uuid not null references public.bosses(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id text not null,
  question_snapshot jsonb not null,
  selected_option text,
  free_text text,
  created_at timestamptz not null default now(),
  unique (boss_id, question_id)
);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  boss_id uuid not null references public.bosses(id) on delete cascade,
  conversation_summary text,
  summarized_through timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index chat_threads_owner_idx on public.chat_threads(session_id, boss_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages(thread_id, created_at desc);

create table public.translation_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  boss_id uuid not null references public.bosses(id) on delete cascade,
  input_text text not null,
  channel text not null,
  result jsonb not null,
  feedback text check (feedback is null or feedback in ('GOOD', 'BAD')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index translation_owner_idx on public.translation_requests(session_id, boss_id);

alter table public.sessions enable row level security;
alter table public.user_profiles enable row level security;
alter table public.bosses enable row level security;
alter table public.boss_evidence enable row level security;
alter table public.boss_survey_answers enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.translation_requests enable row level security;
