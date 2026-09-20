alter table public.app_ai_settings
  add column chat_coaching_prompt_instruction text not null default E'기본 판단은 shouldSuggest=false다. 아래 두 조건 중 하나가 높은 확신으로 충족될 때만 true로 한다.\n1. 모욕, 위협, 노골적인 무례함, 공격적인 책임 전가처럼 수신자가 심각한 무시나 적대감으로 받아들일 가능성이 매우 높은 발언이다.\n2. 주체, 행동, 대상, 기한 또는 약속 중 중요한 요소가 불분명해 문맥상 서로 다른 해석이 실제 업무 오류나 잘못된 행동으로 이어질 가능성이 매우 높다.\n단순히 더 매끄럽게 쓸 수 있다는 이유, 짧은 답변, 자연스러운 구어체, 가벼운 농담, 조금 딱딱하거나 덜 세련된 표현, 사소한 오타에는 제안하지 않는다.\n맥락을 보아 의미가 충분히 통하거나 판단이 조금이라도 애매하면 반드시 shouldSuggest=false로 한다. 일반적인 문체 교정이나 예의 점검을 수행하지 않는다.',
  add constraint app_ai_settings_chat_coaching_prompt_instruction_check
    check (char_length(btrim(chat_coaching_prompt_instruction)) between 1 and 5000);
