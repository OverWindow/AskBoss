import { evidenceBoundary, jsonOnly } from "./shared";
export const evidencePrompt = (content: string) => `${evidenceBoundary}
${jsonOnly}
다음 대화 자료에서 발신자, 시각, 메시지, 앞뒤 맥락과 독립 관찰을 추출하라.
관찰 category는 업무 지시, 보고 및 피드백, 일정 관리, 의사결정, 일상 소통 중 하나다.
반환: {"observations":[{"category":"","summary":"","observedAt":null,"contextQuality":0.0,"messages":[]}]}
<evidence>${content}</evidence>`;
