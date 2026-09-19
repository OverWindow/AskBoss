import { evidenceBoundary, jsonOnly } from "./shared.js";
import { DEFAULT_AI_PROMPT_INSTRUCTIONS } from "../shared.js";
export const personaPrompt = (input: unknown, instruction: string = DEFAULT_AI_PROMPT_INSTRUCTIONS.onboarding.personaGeneration) => `${evidenceBoundary}
${jsonOnly}
다음 관리자 업무 지침을 페르소나 생성에 반영한다.
<admin-instruction>${instruction}</admin-instruction>
근거가 부족한 특성은 uncertainty에 기록하고 단정하지 말라. trait의 evidenceIds에는 실제 근거 ID만 사용하라.
BossPersona 스키마를 정확히 따른다.
<evidence>${JSON.stringify(input)}</evidence>`;
