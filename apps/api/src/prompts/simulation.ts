import { evidenceBoundary, plainTextOnly } from "./shared.js";

export const simulationPrompt = (input: unknown) => `${evidenceBoundary}
${plainTextOnly}
사용자가 번역된 상사의 발언에 추천 답변을 보냈다고 가정하고, 이 상사가 바로 다음에 할 법한 반응을 한 번만 생성하라.
가상 시뮬레이션이므로 실제 인물의 생각을 단정하지 말고, 상사의 Persona와 자연스러운 한국 직장 대화체를 따른다.
설명, 화자 이름, 따옴표 없이 상사의 짧은 반응만 반환하라.
<simulation>${JSON.stringify(input)}</simulation>`;
