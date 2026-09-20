import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/repositories/memory-store";

describe("HR small samples", () => {
  it("shows a job-function pair from its first anonymous event without a minimum sample threshold", async () => {
    const store = new MemoryStore();
    await store.trackAnalytics("one-subject", { eventType: "AI_REQUEST", feature: "CHAT", rankGapBucket: "1단계", ageGapBucket: "6~10년", userJobFunction: "개발", bossJobFunction: "기획", topicKeywords: ["보고"] });
    const dashboard = await store.getHrDashboard();
    expect(dashboard.dataSource).toBe("ACTUAL");
    expect(dashboard.overview).toMatchObject({ totalUses: 1, activeSubjects: 1, topFeature: "CHAT" });
    expect(dashboard.rankGap).toContainEqual({ label: "1단계", value: 1 });
    expect(dashboard.ageGap).toContainEqual({ label: "6~10년", value: 1 });
    expect(dashboard.topics).toContainEqual({ text: "보고", value: 1 });
    expect(dashboard.topicFeature).toEqual([{ topic: "보고", feature: "CHAT", value: 1 }]);
    expect(dashboard.sameJobFunctionDistribution).toEqual([]);
    expect(dashboard.jobFunctionPairs).toEqual([{ userJobFunction: "개발", bossJobFunction: "기획", count: 1 }]);
  });

  it("keeps actual, demo-seeded, and mock datasets completely separate", async () => {
    const store = new MemoryStore();
    await store.trackAnalytics("demo-subject", { eventType: "AI_REQUEST", feature: "TRANSLATE", rankGapBucket: "3+", topicKeywords: ["데모 주제"], isDemo: true });
    const actual = await store.getHrDashboard();
    expect(actual).toMatchObject({ dataSource: "ACTUAL", includesDemo: false, overview: { totalUses: 0, activeSubjects: 0 } });
    expect(actual.topics).toEqual([]);
    expect(actual.topicFeature).toEqual([]);
    expect(actual.jobFunctionPairs).toEqual([]);

    const mock = await store.getMockHrDashboard();
    expect(mock).toMatchObject({ dataSource: "MOCK", includesDemo: true });
    expect(mock.overview.totalUses).toBeGreaterThan(100);
    expect(mock.topics.length).toBeGreaterThan(10);
    expect(mock.topicFeature.length).toBeGreaterThan(10);
    expect(mock.jobFunctionPairs.length).toBeGreaterThan(10);
    expect(mock.rankGap.map((item) => item.label)).toEqual(["0단계", "1단계", "2단계", "3단계", "4단계", "5단계+"]);
    expect(mock.ageGap.length).toBeGreaterThan(3);
    expect(mock.repeatedSimulationTypes.length).toBeGreaterThan(3);
    expect(JSON.stringify(mock)).not.toContain("이거 언제까지 가능해?");
    expect((await store.getHrDashboard()).overview.totalUses).toBe(0);
  });
});
