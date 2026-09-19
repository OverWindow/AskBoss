import { evidenceBoundary, jsonOnly, plainTextOnly } from "./shared.js";
import { DEFAULT_AI_PROMPT_INSTRUCTIONS } from "../shared.js";
export const translatorPrompt = (input: unknown, instruction: string = DEFAULT_AI_PROMPT_INSTRUCTIONS.translation) => `${evidenceBoundary}
${jsonOnly}
JSON 문자열 값은 모두 다음 규칙을 따른다. ${plainTextOnly}
다음 관리자 업무 지침을 번역 결과에 반영한다.
<admin-instruction>${instruction}</admin-instruction>
반드시 아래 필드명과 구조를 정확히 사용한다. replies의 각 항목은 문자열이 아니라 text, style, reason을 가진 객체여야 한다.
{"plainMeaning":"쉽게 풀어쓴 의미","likelyIntent":["가능한 의도 1","가능한 의도 2"],"tone":"말투 설명","caution":"단정할 수 없는 점","confidence":0.0,"surfaceActualGapScore":0,"replies":[{"text":"답장 문구","style":"무난하게","reason":"추천 이유"},{"text":"답장 문구","style":"간결하게","reason":"추천 이유"},{"text":"답장 문구","style":"부드럽게","reason":"추천 이유"}]}
confidence는 0 이상 1 이하의 숫자다. surfaceActualGapScore는 상사 발언의 표면적 표현과 해석된 실제 메시지가 다른 정도를 나타내는 0~100의 숫자이며, 직접적이고 일치하면 0에 가깝고 완곡하거나 반어적이어서 차이가 크면 100에 가깝다. 입력: <evidence>${JSON.stringify(input)}</evidence>`;
