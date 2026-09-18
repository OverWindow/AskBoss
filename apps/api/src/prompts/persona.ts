import { evidenceBoundary, jsonOnly } from "./shared.js";
export const personaPrompt = (input: unknown) => `${evidenceBoundary}
${jsonOnly}
사용자가 제공한 관찰을 기반으로 가상의 상사 행동 Persona를 작성하라. 회사 정보보다 반복된 실제 대화, 설문, 직접 입력 순으로 우선한다.
근거가 부족한 특성은 uncertainty에 기록하고 단정하지 말라. trait의 evidenceIds에는 실제 근거 ID만 사용하라.
BossPersona 스키마를 정확히 따른다.
<evidence>${JSON.stringify(input)}</evidence>`;
