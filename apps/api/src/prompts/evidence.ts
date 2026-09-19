import { evidenceBoundary, jsonOnly } from "./shared.js";
import { DEFAULT_AI_PROMPT_INSTRUCTIONS } from "../shared.js";
export const evidencePrompt = (content: string, instruction: string = DEFAULT_AI_PROMPT_INSTRUCTIONS.onboarding.evidenceExtraction) => `${evidenceBoundary}
${jsonOnly}
다음 관리자 업무 지침을 자료 분석에 반영한다.
<admin-instruction>${instruction}</admin-instruction>
관찰 category는 업무 지시, 보고 및 피드백, 일정 관리, 의사결정, 일상 소통 중 하나다.
반환: {"observations":[{"category":"","summary":"","observedAt":null,"contextQuality":0.0,"messages":[]}]}
<evidence>${content}</evidence>`;
