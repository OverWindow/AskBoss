alter table public.app_ai_settings
  drop constraint if exists app_ai_settings_personal_boss_base_prompt_check;

alter table public.app_ai_settings
  add constraint app_ai_settings_personal_boss_base_prompt_check
  check (char_length(personal_boss_base_prompt) <= 10000);
