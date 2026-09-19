alter table public.admin_operations drop constraint admin_operations_type_check;
alter table public.admin_operations add constraint admin_operations_type_check check (
  type in (
    'JOB_RETRY',
    'CLEANUP',
    'ANALYTICS_ROLLUP',
    'GLOBAL_BOSS_UPDATE',
    'GLOBAL_PERSONA_REBUILD',
    'PERSONAL_BOSS_DEFAULTS_UPDATE',
    'GLOBAL_BOSS_DEFAULTS_UPDATE',
    'TRANSLATION_EXAMPLES_UPDATE',
    'AI_PROMPT_SETTINGS_UPDATE',
    'MEANINGLESS_SESSIONS_PRUNE',
    'PERSONAL_BOSS_PROMPT_VIEW'
  )
);
