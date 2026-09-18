create table public.company_research_cache (
  normalized_name text primary key,
  company_name text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index company_research_expiry_idx on public.company_research_cache(expires_at);

create table public.upload_intents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  boss_id uuid not null references public.bosses(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null check (content_type in ('text/plain', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 8388608),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index upload_intents_owner_idx on public.upload_intents(session_id, boss_id);
create index upload_intents_expiry_idx on public.upload_intents(expires_at);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions(id) on delete cascade,
  boss_id uuid references public.bosses(id) on delete cascade,
  type text not null check (type in ('EVIDENCE_EXTRACT', 'PERSONA_REBUILD', 'CHAT_SUMMARIZE')),
  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  payload jsonb not null default '{}',
  result jsonb,
  error_message text,
  attempts int not null default 0,
  max_attempts int not null default 3,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_jobs_queue_idx on public.ai_jobs(status, lease_until, created_at);
create index ai_jobs_owner_idx on public.ai_jobs(session_id, id);

create table public.monologue_history (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  boss_id uuid not null references public.bosses(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index monologue_history_idx on public.monologue_history(session_id, boss_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boss-evidence', 'boss-evidence', false, 8388608, array['text/plain', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.company_research_cache enable row level security;
alter table public.upload_intents enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.monologue_history enable row level security;
