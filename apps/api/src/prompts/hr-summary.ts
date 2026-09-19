import { plainTextOnly } from "./shared.js";
export const hrSummaryPrompt = (aggregates: unknown) => `${plainTextOnly} 다음 익명 집계만 이용해 2~3문장의 HR 사용 경향 요약을 한국어로 작성하라. 개인을 추정하거나 원문이 있다고 암시하지 말라. ${JSON.stringify(aggregates)}`;
