import type { HrDashboard } from "../shared.js";

const MOCK_HR_DASHBOARD: HrDashboard = {
  dataSource: "MOCK",
  includesDemo: true,
  overview: {
    totalUses: 4_872,
    activeSubjects: 326,
    topFeature: "TRANSLATE",
    summary: "",
  },
  topics: [
    { text: "보고", value: 94 }, { text: "일정", value: 88 }, { text: "피드백", value: 81 },
    { text: "마감", value: 76 }, { text: "회의", value: 69 }, { text: "메신저", value: 64 },
    { text: "우선순위", value: 59 }, { text: "협업", value: 55 }, { text: "성과", value: 51 },
    { text: "리소스", value: 47 }, { text: "야근", value: 43 }, { text: "실수", value: 39 },
    { text: "승인", value: 35 }, { text: "인수인계", value: 31 }, { text: "휴가", value: 27 },
  ],
  topicFeature: [
    { topic: "보고", feature: "TRANSLATE", value: 42 }, { topic: "보고", feature: "CHAT", value: 34 }, { topic: "보고", feature: "SIMULATE", value: 18 },
    { topic: "일정", feature: "TRANSLATE", value: 35 }, { topic: "일정", feature: "CHAT", value: 29 }, { topic: "일정", feature: "SIMULATE", value: 24 },
    { topic: "피드백", feature: "TRANSLATE", value: 38 }, { topic: "피드백", feature: "CHAT", value: 27 }, { topic: "피드백", feature: "SIMULATE", value: 16 },
    { topic: "마감", feature: "TRANSLATE", value: 31 }, { topic: "마감", feature: "CHAT", value: 20 }, { topic: "마감", feature: "SIMULATE", value: 25 },
    { topic: "회의", feature: "TRANSLATE", value: 26 }, { topic: "회의", feature: "CHAT", value: 31 }, { topic: "회의", feature: "SIMULATE", value: 12 },
    { topic: "메신저", feature: "TRANSLATE", value: 29 }, { topic: "메신저", feature: "CHAT", value: 23 }, { topic: "메신저", feature: "SIMULATE", value: 12 },
    { topic: "우선순위", feature: "TRANSLATE", value: 21 }, { topic: "우선순위", feature: "CHAT", value: 26 }, { topic: "우선순위", feature: "SIMULATE", value: 12 },
    { topic: "협업", feature: "TRANSLATE", value: 19 }, { topic: "협업", feature: "CHAT", value: 25 }, { topic: "협업", feature: "SIMULATE", value: 11 },
  ],
  rankGap: [
    { label: "0", value: 318 }, { label: "1단계", value: 914 },
    { label: "2단계", value: 1_486 }, { label: "3단계+", value: 2_154 },
  ],
  ageGap: [
    { label: "0~5년", value: 642 }, { label: "6~10년", value: 1_108 },
    { label: "11~20년", value: 1_826 }, { label: "20년+", value: 1_296 },
  ],
  sameJobFunctionDistribution: [
    { bucket: "SAME", count: 1_934 }, { bucket: "DIFF", count: 2_938 },
  ],
  surfaceActualGapRate: 37.6,
  repeatedSimulationTypes: [
    { type: "일정·마감 압박", count: 302 },
    { type: "업무 위임·책임 요구", count: 161 },
    { type: "수정·품질 피드백", count: 139 },
    { type: "질책·성과 압박", count: 96 },
    { type: "의사결정·승인", count: 83 },
  ],
};

export function getMockHrDashboard(): HrDashboard {
  return structuredClone(MOCK_HR_DASHBOARD);
}
