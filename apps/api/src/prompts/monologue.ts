import { evidenceBoundary, plainTextOnly } from "./shared.js";

export const monologuePrompt = (input: unknown) => `${evidenceBoundary}
${plainTextOnly} 상사가 혼잣말처럼 할 자연스러운 한국어 한 문장만 생성하라. 업무 이야기가 아니어도 된다. 30자 안팎이며 이전 문장과 중복하지 않는다. 따옴표나 설명을 붙이지 않는다.
<evidence>${JSON.stringify(input)}</evidence>`;
