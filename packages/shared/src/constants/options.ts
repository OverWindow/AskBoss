export const AGE_BANDS = [20, 30, 40, 50, 60] as const;
export const USER_TENURE_BANDS = ["1년 미만", "1~2년", "3~5년", "6~9년", "10~14년", "15년 이상"] as const;
export const BOSS_TENURE_BANDS = ["1년 미만", "1~2년", "3~5년", "6~9년", "10~14년", "15~19년", "20년 이상", "알 수 없음"] as const;
export const USER_RANKS = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "임원", "기타"] as const;
export const BOSS_RANKS = ["사원", "주임", "대리", "과장", "차장", "부장", "팀장", "실장", "임원", "대표", "기타"] as const;
export const JOB_FUNCTIONS = ["개발", "디자인", "기획", "마케팅", "영업", "인사", "재무·회계", "연구", "생산·제조", "고객지원", "교육", "경영", "기타"] as const;
export const ENTRY_PATHS = ["신입", "경력 이직", "복직", "직무 전환"] as const;
export const WEAKNESSES = ["거절을 잘 못함", "답장이 너무 김", "답장이 너무 짧음", "답장을 미룸"] as const;
export const CHANNELS = ["카카오톡", "사내 메신저", "대면", "메일", "기타"] as const;
export const AVATARS = ["boss-male-01", "boss-male-bald-01", "boss-female-01", "boss-female-02"] as const;

export const DEFAULT_PERSONAL_BOSS_BASE_PROMPT = "대한민국 직장의 일반적인 상사처럼 반응한다. 지나치게 다정하거나 상담가처럼 위로하지 말고, 직급 차이와 업무 맥락을 반영해 간결하고 현실적으로 말한다. 일정, 결과, 책임, 다음 행동을 분명히 확인한다. 다만 모욕·비하·위협·직장 내 괴롭힘 표현은 만들지 않는다.";
export const DEFAULT_TRANSLATION_EXAMPLES = ["이거 언제 되나?", "한번 검토해 볼게요.", "이 정도는 알아서 해주세요."] as const;
export const DEFAULT_AI_PROMPT_INSTRUCTIONS = {
  translation: "상사 발언을 쉽게 풀고 가능한 의도와 주의점을 확률적 표현으로 설명한다. 서로 다른 스타일의 답장 3개를 추천한다.",
  onboarding: {
    companyResearch: "공개적으로 확인 가능한 정보만으로 회사를 조사한다. 기업문화는 관찰 가능한 신호와 추정을 구분하고 특정 상사 개인의 성격으로 일반화하지 않는다.",
    evidenceExtraction: "대화 자료에서 발신자, 시각, 메시지, 앞뒤 맥락과 독립 관찰을 추출한다.",
    surveyGeneration: "이 상사를 관찰하기 위한 한국어 상황 질문 5개를 만든다. 업무 지시, 보고 및 피드백, 일정 관리, 의사결정, 일상 소통을 각각 한 번 다룬다.",
    personaGeneration: "사용자가 제공한 관찰을 기반으로 가상의 상사 행동 Persona를 작성한다. 회사 정보보다 반복된 실제 대화, 설문, 직접 입력 순으로 우선하고 근거가 부족한 특성은 단정하지 않는다.",
  },
} as const;
export const OBSERVATION_CATEGORIES = ["업무 지시", "보고 및 피드백", "일정 관리", "의사결정", "일상 소통"] as const;
export const UPLOAD_LIMITS = { text: 2 * 1024 * 1024, image: 8 * 1024 * 1024 } as const;
export const ALLOWED_MIME_TYPES = ["text/plain", "image/png", "image/jpeg", "image/webp"] as const;
