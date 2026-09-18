alter table public.ai_jobs
  add column retry_of uuid references public.ai_jobs(id) on delete set null;

create index ai_jobs_retry_of_idx on public.ai_jobs(retry_of) where retry_of is not null;

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index admin_sessions_expiry_idx on public.admin_sessions(expires_at);

create table public.admin_login_attempts (
  ip_hash text primary key,
  attempts int not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.admin_operations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('JOB_RETRY', 'CLEANUP', 'ANALYTICS_ROLLUP')),
  status text not null check (status in ('SUCCEEDED', 'FAILED')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_operations_created_idx on public.admin_operations(created_at desc);

alter table public.admin_sessions enable row level security;
alter table public.admin_login_attempts enable row level security;
alter table public.admin_operations enable row level security;
