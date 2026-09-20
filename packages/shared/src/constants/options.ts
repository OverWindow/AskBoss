export const AGE_BANDS = [20, 30, 40, 50, 60] as const;
export const USER_TENURE_BANDS = ["1년 미만", "1~2년", "3~5년", "6~9년", "10~14년", "15년 이상"] as const;
export const BOSS_TENURE_BANDS = ["1년 미만", "1~2년", "3~5년", "6~9년", "10~14년", "15~19년", "20년 이상", "알 수 없음"] as const;
export const USER_RANKS = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "임원", "기타"] as const;
export const BOSS_RANKS = ["사원", "주임", "대리", "과장", "차장", "부장", "팀장", "실장", "임원", "대표", "기타"] as const;
export const JOB_FUNCTIONS = ["개발", "디자인", "기획", "마케팅", "영업", "인사", "재무·회계", "연구", "생산·제조", "고객지원", "교육", "경영", "기타"] as const;
export const ENTRY_PATHS = ["신입", "경력 이직", "복직", "직무 전환"] as const;
export const WEAKNESSES = ["결론부터 말하기 어렵다", "거절하기 어렵다", "되묻기 어렵다", "실수를 보고하기 어렵다"] as const;
export const CHANNELS = ["카카오톡", "사내 메신저", "대면", "메일", "기타"] as const;
export const AVATARS = ["boss-male-01", "boss-male-bald-01", "boss-female-01", "boss-female-02"] as const;

export const DEFAULT_PERSONAL_BOSS_BASE_PROMPT = "대한민국 직장의 일반적인 상사처럼 반응한다. 지나치게 다정하거나 상담가처럼 위로하지 말고, 직급 차이와 업무 맥락을 반영해 간결하고 현실적으로 말한다. 일정, 결과, 책임, 다음 행동을 분명히 확인한다. 다만 모욕·비하·위협·직장 내 괴롭힘 표현은 만들지 않는다.";
export const DEFAULT_TRANSLATION_EXAMPLES = ["이거 언제 되나?", "한번 검토해 볼게요.", "이 정도는 알아서 해주세요."] as const;
export const DEFAULT_TRANSLATION_REPLY_STYLES = ["수락", "조율", "거절"] as const;
export const DEFAULT_CHAT_COACHING_PROMPT_INSTRUCTION = `기본 판단은 shouldSuggest=false다. 아래 두 조건 중 하나가 높은 확신으로 충족될 때만 true로 한다.
1. 모욕, 위협, 노골적인 무례함, 공격적인 책임 전가처럼 수신자가 심각한 무시나 적대감으로 받아들일 가능성이 매우 높은 발언이다.
2. 주체, 행동, 대상, 기한 또는 약속 중 중요한 요소가 불분명해 문맥상 서로 다른 해석이 실제 업무 오류나 잘못된 행동으로 이어질 가능성이 매우 높다.
단순히 더 매끄럽게 쓸 수 있다는 이유, 짧은 답변, 자연스러운 구어체, 가벼운 농담, 조금 딱딱하거나 덜 세련된 표현, 사소한 오타에는 제안하지 않는다.
맥락을 보아 의미가 충분히 통하거나 판단이 조금이라도 애매하면 반드시 shouldSuggest=false로 한다. 일반적인 문체 교정이나 예의 점검을 수행하지 않는다.`;
export const DEFAULT_AI_PROMPT_INSTRUCTIONS = {
  translation: "상사 발언을 쉽게 풀고 가능한 의도와 주의점을 확률적 표현으로 설명한다. 서로 다른 스타일의 답장 3개를 추천한다.",
  translationReplyStyles: [...DEFAULT_TRANSLATION_REPLY_STYLES] as [string, string, string],
  coaching: DEFAULT_CHAT_COACHING_PROMPT_INSTRUCTION,
  onboarding: {
    companyResearch: "공개적으로 확인 가능한 정보만으로 회사를 조사한다. 기업문화는 관찰 가능한 신호와 추정을 구분하고 특정 상사 개인의 성격으로 일반화하지 않는다.",
    evidenceExtraction: "대화 자료에서 발신자, 시각, 메시지, 앞뒤 맥락과 독립 관찰을 추출한다.",
    surveyGeneration: "이 상사를 관찰하기 위한 한국어 상황 질문 5개를 만든다. 업무 지시, 보고 및 피드백, 일정 관리, 의사결정, 일상 소통을 각각 한 번 다룬다.",
    personaGeneration: "사용자가 제공한 관찰을 기반으로 가상의 상사 행동 Persona를 작성한다. 회사 정보보다 반복된 실제 대화, 설문, 직접 입력 순으로 우선하고 근거가 부족한 특성은 단정하지 않는다.",
  },
} as const;
export const OBSERVATION_CATEGORIES = ["업무 지시", "보고 및 피드백", "일정 관리", "의사결정", "일상 소통"] as const;
export const MAX_IMAGE_EVIDENCE_PER_BOSS = 5;
export const PERSONAL_BOSS_BASE_PROMPT_MAX_CHARS = 10_000;
export const CHAT_CONTEXT_TOTAL_MESSAGE_LIMIT = 50;
export const CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT = CHAT_CONTEXT_TOTAL_MESSAGE_LIMIT - 1;
export const UPLOAD_LIMITS = { text: 2 * 1024 * 1024, image: 8 * 1024 * 1024 } as const;
export const ALLOWED_MIME_TYPES = ["text/plain", "image/png", "image/jpeg", "image/webp"] as const;
