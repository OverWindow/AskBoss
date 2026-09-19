import { jsonOnly } from "./shared.js";
import { DEFAULT_AI_PROMPT_INSTRUCTIONS } from "../shared.js";
export const companyPrompt = (name: string, instruction: string = DEFAULT_AI_PROMPT_INSTRUCTIONS.onboarding.companyResearch) => `${jsonOnly}
다음 관리자 업무 지침을 회사 조사에 반영한다.
<admin-instruction>${instruction}</admin-instruction>
조사 대상 회사: '${name}'
필드: companyName, industry, companySizeHint, businessSummary, organizationHints, workCultureSignals, confidence(0~1), sourceSummary.`;
