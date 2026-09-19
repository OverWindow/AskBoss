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

  return { messages: [...messages], usesMockUserData: true };
}
