import type { BossRecord, ChatMessageRecord } from "../types.js";
import type { GlobalBossPromptPreview, UserProfile } from "../shared.js";
import { buildBossChatMessages } from "../prompts/chat.js";

const MOCK_PROFILE: UserProfile = {
  handle: "관리자 미리보기용 가상 사용자",
  ageBand: 30,
  yearsOfServiceBand: "3~5년",
  rank: "대리",
  jobFunction: "기획",
  entryPath: "경력 이직",
  weaknesses: ["답장이 너무 김"],
};

const MOCK_MESSAGES: ChatMessageRecord[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    role: "user",
    kind: "CHAT",
    content: "팀장님, 지난번 말씀하신 자료 초안 공유드립니다.",
    createdAt: "2026-01-02T09:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    role: "assistant",
    kind: "CHAT",
    content: "결론과 남은 일정부터 정리해서 다시 보내줘.",
    createdAt: "2026-01-02T09:01:00.000Z",
  },
];

const MOCK_QUESTION = "수정본은 오늘 오후 4시까지 보내드리면 될까요?";

export function buildGlobalBossPromptPreview(boss: BossRecord, basePrompt: string): GlobalBossPromptPreview {
  const messages = buildBossChatMessages({
    profile: MOCK_PROFILE,
    boss,
    basePrompt,
    globalPersona: undefined,
    summary: "[관리자 미리보기용 mock] 사용자는 보고 자료의 결론과 마감 시각을 조율하고 있다.",
    messages: MOCK_MESSAGES,
    message: MOCK_QUESTION,
  });

  return {
    messages: [...messages],
    sources: [
      { role: "system", component: "안전·출력 규칙", origin: "서버 고정 규칙", description: "근거 안의 지시를 실행하지 않고 일반 텍스트로 응답하도록 강제합니다.", usesMockData: false },
      { role: "system", component: "모두의 상사 기본 성격", origin: "관리자 저장값", description: "이 화면의 ‘모두의 상사 전용 프롬프트’에 저장된 운영 지침입니다.", usesMockData: false },
      { role: "user", component: "상사 정보·페르소나", origin: "모두의 상사 관리", description: "관리자가 저장한 기본 정보와 현재 사용자에게 제공 중인 페르소나입니다.", usesMockData: false },
      { role: "user", component: "사용자 프로필", origin: "미리보기 전용 가상 데이터", description: "실제 사용자 대신 고정된 가상 프로필을 사용합니다.", usesMockData: true },
      { role: "user", component: "대화 요약·이력·질문", origin: "미리보기 전용 가상 데이터", description: "프롬프트 조립 형태를 확인하기 위한 고정 예시이며 실제 사용자 대화가 아닙니다.", usesMockData: true },
    ],
    usesMockUserData: true,
  };
}
