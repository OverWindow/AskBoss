alter table public.translation_requests
  add column if not exists simulation_count integer not null default 0
  check (simulation_count >= 0);
