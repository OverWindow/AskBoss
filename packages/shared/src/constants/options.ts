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
export const OBSERVATION_CATEGORIES = ["업무 지시", "보고 및 피드백", "일정 관리", "의사결정", "일상 소통"] as const;
export const UPLOAD_LIMITS = { text: 2 * 1024 * 1024, image: 8 * 1024 * 1024 } as const;
export const ALLOWED_MIME_TYPES = ["text/plain", "image/png", "image/jpeg", "image/webp"] as const;
