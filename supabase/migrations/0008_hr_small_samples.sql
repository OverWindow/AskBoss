alter table public.analytics_daily_aggregates
  drop constraint if exists analytics_daily_aggregates_distinct_subject_count_check;

alter table public.analytics_daily_aggregates
  add constraint analytics_daily_aggregates_distinct_subject_count_check
  check (distinct_subject_count >= 1);
