create table public.app_ai_settings (
  id text primary key check (id = 'default'),
  personal_boss_base_prompt text not null check (char_length(personal_boss_base_prompt) <= 5000),
  updated_at timestamptz not null default now()
);

insert into public.app_ai_settings (id, personal_boss_base_prompt)
values (
  'default',
  '대한민국 직장의 일반적인 상사처럼 반응한다. 지나치게 다정하거나 상담가처럼 위로하지 말고, 직급 차이와 업무 맥락을 반영해 간결하고 현실적으로 말한다. 일정, 결과, 책임, 다음 행동을 분명히 확인한다. 다만 모욕·비하·위협·직장 내 괴롭힘 표현은 만들지 않는다.'
)
on conflict (id) do nothing;

alter table public.app_ai_settings enable row level security;

alter table public.admin_operations drop constraint admin_operations_type_check;
alter table public.admin_operations add constraint admin_operations_type_check check (
  type in ('JOB_RETRY', 'CLEANUP', 'ANALYTICS_ROLLUP', 'GLOBAL_BOSS_UPDATE', 'GLOBAL_PERSONA_REBUILD', 'PERSONAL_BOSS_DEFAULTS_UPDATE')
);
