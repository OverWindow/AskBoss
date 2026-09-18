insert into public.bosses (
  id, scope, status, session_id, alias, avatar_key, job_function, years_of_service_band,
  rank, company_name, age_band, hierarchy_score, gender_balance_score, company_research,
  persona_profile, persona_version, persona_built_at, pki_score, pki_breakdown, expires_at
) values (
  '00000000-0000-4000-8000-000000000001', 'GLOBAL', 'READY', null, '모두의 상사', 'boss-male-01',
  null, null, '팀장', null, 40, 55, 0, null,
  '{
    "summary":"한국 회사에서 흔히 볼 수 있는 중간관리자형의 가상 공통 페르소나입니다.",
    "communication":{"tone":"약간 무뚝뚝하지만 악의적이지 않음","messageLength":"짧음","directness":68,"formality":62},
    "reporting":{"preferredLength":"결론부터 간결하게","preferredStructure":["결론","현재 상태","다음 행동"],"frequentChecks":["일정","진행률"]},
    "decisionMaking":{"speed":"보통","riskTolerance":"낮음","autonomyPreference":"중간"},
    "management":{"hierarchyPreference":"중간","feedbackStyle":"실무 중심","deadlineSensitivity":"높음"},
    "recurringPatterns":["결론을 먼저 확인함","진행 상황을 중간에 점검함"],
    "recurringPhrases":["그래서 결론이 뭐지?","이거 언제 되나?"],
    "humorStyle":"가끔 아재개그",
    "uncertainty":["특정 실제 인물을 모델링하지 않은 기본값"],
    "traits":[]
  }'::jsonb,
  1, now(), null, null, null
)
on conflict (id) do update set persona_profile = excluded.persona_profile, updated_at = now();
