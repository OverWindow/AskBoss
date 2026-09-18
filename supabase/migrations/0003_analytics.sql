create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_subject_hash text not null,
  event_type text not null,
  feature text not null,
  occurred_at timestamptz not null default now(),
  user_age_band smallint,
  boss_age_band smallint,
  rank_gap_bucket text,
  age_gap_bucket text,
  topic_keywords text[] not null default '{}',
  persona_confidence_bucket text,
  is_demo boolean not null default false,
  expires_at timestamptz not null
);
create index analytics_events_time_idx on public.analytics_events(occurred_at, feature);
create index analytics_events_expiry_idx on public.analytics_events(expires_at);

create table public.analytics_daily_aggregates (
  id uuid primary key default gen_random_uuid(),
  aggregate_date date not null,
  dimension text not null,
  dimension_value text not null,
  feature text not null,
  event_count int not null,
  distinct_subject_count int not null check (distinct_subject_count >= 5),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (aggregate_date, dimension, dimension_value, feature, is_demo)
);

alter table public.analytics_events enable row level security;
alter table public.analytics_daily_aggregates enable row level security;
