import { evidenceBoundary, jsonOnly, plainTextOnly } from "./shared.js";
export const translatorPrompt = (input: unknown) => `${evidenceBoundary}
${jsonOnly}
JSON 문자열 값은 모두 다음 규칙을 따른다. ${plainTextOnly}
상사 발언을 쉽게 풀고 가능한 의도와 주의점을 확률적 표현으로 설명한다. 서로 다른 스타일의 답장 3개를 추천한다.
반드시 아래 필드명과 구조를 정확히 사용한다. replies의 각 항목은 문자열이 아니라 text, style, reason을 가진 객체여야 한다.
{"plainMeaning":"쉽게 풀어쓴 의미","likelyIntent":["가능한 의도 1","가능한 의도 2"],"tone":"말투 설명","caution":"단정할 수 없는 점","confidence":0.0,"replies":[{"text":"답장 문구","style":"무난하게","reason":"추천 이유"},{"text":"답장 문구","style":"간결하게","reason":"추천 이유"},{"text":"답장 문구","style":"부드럽게","reason":"추천 이유"}]}
confidence는 0 이상 1 이하의 숫자다. 입력: <evidence>${JSON.stringify(input)}</evidence>`;
