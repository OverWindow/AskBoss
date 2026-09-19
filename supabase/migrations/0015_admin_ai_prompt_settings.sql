alter table public.app_ai_settings
  add column translation_prompt_instruction text not null default '상사 발언을 쉽게 풀고 가능한 의도와 주의점을 확률적 표현으로 설명한다. 서로 다른 스타일의 답장 3개를 추천한다.',
  add column onboarding_company_prompt_instruction text not null default '공개적으로 확인 가능한 정보만으로 회사를 조사한다. 기업문화는 관찰 가능한 신호와 추정을 구분하고 특정 상사 개인의 성격으로 일반화하지 않는다.',
  add column onboarding_evidence_prompt_instruction text not null default '대화 자료에서 발신자, 시각, 메시지, 앞뒤 맥락과 독립 관찰을 추출한다.',
  add column onboarding_survey_prompt_instruction text not null default '이 상사를 관찰하기 위한 한국어 상황 질문 5개를 만든다. 업무 지시, 보고 및 피드백, 일정 관리, 의사결정, 일상 소통을 각각 한 번 다룬다.',
  add column onboarding_persona_prompt_instruction text not null default '사용자가 제공한 관찰을 기반으로 가상의 상사 행동 Persona를 작성한다. 회사 정보보다 반복된 실제 대화, 설문, 직접 입력 순으로 우선하고 근거가 부족한 특성은 단정하지 않는다.',
  add column ai_prompt_settings_updated_at timestamptz,
  add constraint app_ai_settings_translation_prompt_instruction_check check (char_length(btrim(translation_prompt_instruction)) between 1 and 5000),
  add constraint app_ai_settings_onboarding_company_prompt_instruction_check check (char_length(btrim(onboarding_company_prompt_instruction)) between 1 and 5000),
  add constraint app_ai_settings_onboarding_evidence_prompt_instruction_check check (char_length(btrim(onboarding_evidence_prompt_instruction)) between 1 and 5000),
  add constraint app_ai_settings_onboarding_survey_prompt_instruction_check check (char_length(btrim(onboarding_survey_prompt_instruction)) between 1 and 5000),
  add constraint app_ai_settings_onboarding_persona_prompt_instruction_check check (char_length(btrim(onboarding_persona_prompt_instruction)) between 1 and 5000);

alter table public.admin_operations drop constraint admin_operations_type_check;
alter table public.admin_operations add constraint admin_operations_type_check check (
  type in ('JOB_RETRY', 'CLEANUP', 'ANALYTICS_ROLLUP', 'GLOBAL_BOSS_UPDATE', 'GLOBAL_PERSONA_REBUILD', 'PERSONAL_BOSS_DEFAULTS_UPDATE', 'GLOBAL_BOSS_DEFAULTS_UPDATE', 'TRANSLATION_EXAMPLES_UPDATE', 'AI_PROMPT_SETTINGS_UPDATE', 'MEANINGLESS_SESSIONS_PRUNE')
);
