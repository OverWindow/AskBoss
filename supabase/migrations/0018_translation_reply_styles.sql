alter table public.app_ai_settings
  add column translation_reply_styles text[] not null default array[
    '수락',
    '조율',
    '거절'
  ],
  add constraint app_ai_settings_translation_reply_styles_check check (
    cardinality(translation_reply_styles) = 3
    and array_position(translation_reply_styles, null) is null
    and char_length(btrim(translation_reply_styles[1])) between 1 and 40
    and char_length(btrim(translation_reply_styles[2])) between 1 and 40
    and char_length(btrim(translation_reply_styles[3])) between 1 and 40
  );
