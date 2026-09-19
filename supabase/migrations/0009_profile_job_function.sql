alter table public.user_profiles add column if not exists job_function text;

alter table public.analytics_events add column if not exists same_job_function_bucket text;
