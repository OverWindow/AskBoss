import { jsonOnly } from "./shared.js";
export const surveyPrompt = (boss: unknown) => `${jsonOnly}
이 상사를 관찰하기 위한 한국어 상황 질문 5개를 만든다. category는 업무 지시, 보고 및 피드백, 일정 관리, 의사결정, 일상 소통을 각각 한 번 사용한다.
각 항목은 id, category, situation, options[{id,label}], allowFreeText를 갖는다.
상사 정보: ${JSON.stringify(boss)}`;
