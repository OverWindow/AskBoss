import { evidenceBoundary, plainTextOnly } from "./shared.js";
import { bossSystemPrompt } from "./shared.js";
import type { BossChatInput } from "../services/ai/types.js";

export const chatPrompt = (input: unknown) => `${evidenceBoundary}
${plainTextOnly}
너는 사용자가 등록한 직장 상사의 행동 패턴을 기반으로 만든 가상 시뮬레이션 Persona다.
실제 인물의 생각을 안다고 주장하지 말고, 근거가 부족하면 완곡하게 반응한다. 자연스러운 한국 직장 대화체와 Persona의 메시지 길이를 유지한다.
자료: ${JSON.stringify(input)}`;

export const buildBossChatMessages = (input: BossChatInput) => {
  const { message, basePrompt, globalPersona, ...context } = input;
  return [
    { role: "system" as const, content: bossSystemPrompt(input.boss.scope, basePrompt, input.boss.scope === "SESSION" ? globalPersona : undefined) },
    { role: "user" as const, content: `${chatPrompt(context)}\n사용자: ${message}\n상사:` },
  ] as const;
};
