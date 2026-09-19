alter table public.app_ai_settings
  add column global_boss_base_prompt text not null default '',
  add column global_boss_prompt_updated_at timestamptz,
  add constraint app_ai_settings_global_boss_base_prompt_check
    check (char_length(global_boss_base_prompt) <= 5000);

alter table public.admin_operations drop constraint admin_operations_type_check;
alter table public.admin_operations add constraint admin_operations_type_check check (
  type in ('JOB_RETRY', 'CLEANUP', 'ANALYTICS_ROLLUP', 'GLOBAL_BOSS_UPDATE', 'GLOBAL_PERSONA_REBUILD', 'PERSONAL_BOSS_DEFAULTS_UPDATE', 'GLOBAL_BOSS_DEFAULTS_UPDATE', 'MEANINGLESS_SESSIONS_PRUNE')
);
