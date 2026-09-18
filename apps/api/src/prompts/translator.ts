import { evidenceBoundary, jsonOnly } from "./shared";
export const translatorPrompt = (input: unknown) => `${evidenceBoundary}
${jsonOnly}
상사 발언을 쉽게 풀고 가능한 의도와 주의점을 확률적 표현으로 설명한다. 서로 다른 스타일의 답장 3개를 추천한다.
TranslationResult 스키마를 정확히 따른다. 입력: <evidence>${JSON.stringify(input)}</evidence>`;
