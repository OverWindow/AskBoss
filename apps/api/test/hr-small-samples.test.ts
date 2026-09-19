import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/repositories/memory-store";

describe("HR small samples", () => {
  it("keeps a single anonymous subject visible", async () => {
    const store = new MemoryStore();
    await store.trackAnalytics("one-subject", { eventType: "AI_REQUEST", feature: "CHAT", rankGapBucket: "1", ageGapBucket: "6~10년", topicKeywords: ["보고"] });
    const dashboard = await store.getHrDashboard();
    expect(dashboard.dataSource).toBe("ACTUAL");
    expect(dashboard.overview).toMatchObject({ totalUses: 1, activeSubjects: 1, topFeature: "CHAT" });
    expect(dashboard.rankGap).toContainEqual({ label: "1", value: 1 });
    expect(dashboard.ageGap).toContainEqual({ label: "6~10년", value: 1 });
    expect(dashboard.topics).toContainEqual({ text: "보고", value: 1 });
    expect(dashboard.sameJobFunctionDistribution).toEqual([]);
  });

  it("keeps actual, demo-seeded, and mock datasets completely separate", async () => {
    const store = new MemoryStore();
    await store.trackAnalytics("demo-subject", { eventType: "AI_REQUEST", feature: "TRANSLATE", rankGapBucket: "3+", topicKeywords: ["데모 주제"], isDemo: true });
    const actual = await store.getHrDashboard();
    expect(actual).toMatchObject({ dataSource: "ACTUAL", includesDemo: false, overview: { totalUses: 0, activeSubjects: 0 } });
    expect(actual.topics).toEqual([]);

    const mock = await store.getMockHrDashboard();
    expect(mock).toMatchObject({ dataSource: "MOCK", includesDemo: true });
    expect(mock.overview.totalUses).toBeGreaterThan(100);
    expect(mock.topics.length).toBeGreaterThan(10);
    expect(mock.rankGap.length).toBeGreaterThan(3);
    expect(mock.ageGap.length).toBeGreaterThan(3);
    expect(mock.topRepeatedPhrases.length).toBeGreaterThan(3);
    expect((await store.getHrDashboard()).overview.totalUses).toBe(0);
  });
});
