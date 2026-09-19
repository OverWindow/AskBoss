import { jsonOnly } from "./shared.js";
import { DEFAULT_AI_PROMPT_INSTRUCTIONS } from "../shared.js";
export const surveyPrompt = (boss: unknown, instruction: string = DEFAULT_AI_PROMPT_INSTRUCTIONS.onboarding.surveyGeneration) => `${jsonOnly}
다음 관리자 업무 지침을 상황 질문 생성에 반영한다.
<admin-instruction>${instruction}</admin-instruction>
질문은 정확히 5개이며 category는 업무 지시, 보고 및 피드백, 일정 관리, 의사결정, 일상 소통을 각각 한 번 사용한다.
각 항목은 id, category, situation, options[{id,label}], allowFreeText를 갖는다.
상사 정보: ${JSON.stringify(boss)}`;
