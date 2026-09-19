alter table public.app_ai_settings
  add column translation_examples text[] not null default array[
    '이거 언제 되나?',
    '한번 검토해 볼게요.',
    '이 정도는 알아서 해주세요.'
  ],
  add column translation_examples_updated_at timestamptz,
  add constraint app_ai_settings_translation_examples_check check (
    cardinality(translation_examples) = 3
    and array_position(translation_examples, null) is null
    and char_length(btrim(translation_examples[1])) between 1 and 200
    and char_length(btrim(translation_examples[2])) between 1 and 200
    and char_length(btrim(translation_examples[3])) between 1 and 200
  );

alter table public.admin_operations drop constraint admin_operations_type_check;
alter table public.admin_operations add constraint admin_operations_type_check check (
  type in ('JOB_RETRY', 'CLEANUP', 'ANALYTICS_ROLLUP', 'GLOBAL_BOSS_UPDATE', 'GLOBAL_PERSONA_REBUILD', 'PERSONAL_BOSS_DEFAULTS_UPDATE', 'GLOBAL_BOSS_DEFAULTS_UPDATE', 'TRANSLATION_EXAMPLES_UPDATE', 'MEANINGLESS_SESSIONS_PRUNE')
);
