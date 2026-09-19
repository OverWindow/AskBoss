import type { HrDashboard } from "../shared.js";

const MOCK_HR_DASHBOARD: HrDashboard = {
  dataSource: "MOCK",
  includesDemo: true,
  overview: {
    totalUses: 4_872,
    activeSubjects: 326,
    topFeature: "TRANSLATE",
    summary: "시연용 가상 조직에서는 일정 조율, 보고 방식, 피드백 해석이 가장 자주 다뤄졌습니다. 직급과 나이 차이가 큰 상황일수록 번역과 시뮬레이션 사용 비중이 높게 나타납니다.",
  },
  topics: [
    { text: "보고", value: 94 }, { text: "일정", value: 88 }, { text: "피드백", value: 81 },
    { text: "마감", value: 76 }, { text: "회의", value: 69 }, { text: "메신저", value: 64 },
    { text: "우선순위", value: 59 }, { text: "협업", value: 55 }, { text: "성과", value: 51 },
    { text: "리소스", value: 47 }, { text: "야근", value: 43 }, { text: "실수", value: 39 },
    { text: "승인", value: 35 }, { text: "인수인계", value: 31 }, { text: "휴가", value: 27 },
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
  topRepeatedPhrases: [
    { phrase: "이거 언제까지 가능해?", count: 184 },
    { phrase: "알아서 정리해서 공유해 줘.", count: 161 },
    { phrase: "전에 말한 방향이랑 조금 다른데?", count: 139 },
    { phrase: "일단 초안부터 빨리 보여 줘.", count: 118 },
    { phrase: "이 정도는 기본 아닌가?", count: 96 },
    { phrase: "회의 전에 결론만 정리해 둬.", count: 83 },
  ],
};

export function getMockHrDashboard(): HrDashboard {
  return structuredClone(MOCK_HR_DASHBOARD);
}
