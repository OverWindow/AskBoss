import { describe, expect, it } from "vitest";
import { store } from "../src/repositories";

describe("HR small samples", () => {
  it("keeps a single anonymous subject visible", async () => {
    await store.trackAnalytics("one-subject", { eventType: "AI_REQUEST", feature: "CHAT", rankGapBucket: "1", ageGapBucket: "6~10년", topicKeywords: ["보고"] });
    const dashboard = await store.getHrDashboard();
    expect(dashboard.overview).toMatchObject({ totalUses: 1, activeSubjects: 1, topFeature: "CHAT" });
    expect(dashboard.rankGap).toContainEqual({ label: "1", value: 1 });
    expect(dashboard.ageGap).toContainEqual({ label: "6~10년", value: 1 });
    expect(dashboard.topics).toContainEqual({ text: "보고", value: 1 });
    expect(dashboard.sameJobFunctionDistribution).toEqual([]);
  });
});
