alter table public.analytics_events
  add column if not exists user_job_function text,
  add column if not exists boss_job_function text;

create index if not exists analytics_events_job_function_pair_idx
  on public.analytics_events(user_job_function, boss_job_function, occurred_at);
