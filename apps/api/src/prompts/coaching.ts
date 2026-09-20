import { DEFAULT_CHAT_COACHING_PROMPT_INSTRUCTION, type ChatMessage } from "../shared.js";
import { evidenceBoundary, jsonOnly } from "./shared.js";

interface CoachingPromptInput {
  profile: unknown;
  boss: unknown;
  summary: string | null;
  messages: ChatMessage[];
  message: string;
  promptInstruction?: string;
}

export const coachingPrompt = (input: CoachingPromptInput) => {
  const { promptInstruction = DEFAULT_CHAT_COACHING_PROMPT_INSTRUCTION, ...evidenceInput } = input;
  return `${evidenceBoundary}
${jsonOnly}
너는 한국 직장 대화를 돕는 조심스러운 문장 코치다. 상사 역할을 연기하거나 실제 인물의 내면을 단정하지 않는다.
사용자의 의도와 사실관계를 새로 만들지 말고, 원문의 핵심 의도를 보존한다.
수정 제안 여부는 아래 관리자 판단 기준만 따른다. 이 기준이 위의 안전·사실 보존 규칙이나 아래의 출력 형식과 충돌하면 고정 규칙을 우선한다.
<admin-coaching-criteria>${promptInstruction}</admin-coaching-criteria>
shouldSuggest가 true이면 reason은 비난하지 않는 한 문장으로, revisedText는 바로 복사해 사용할 수 있는 하나의 자연스러운 문장으로 작성한다.
shouldSuggest가 false이면 reason과 revisedText는 반드시 null로 반환한다.
응답은 ChatMessageCoaching 스키마를 정확히 따른다.
<evidence>${JSON.stringify({
  ...evidenceInput,
  messages: evidenceInput.messages.map(({ id, role, content, kind, createdAt }) => ({ id, role, content, kind, createdAt })),
})}</evidence>`;
};
