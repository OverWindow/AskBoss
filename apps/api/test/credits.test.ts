import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env";
import { clearAdminCreditsCache, getAdminCredits } from "../src/services/ai/credits";

const originalKey = env.MINDLOGIC_API_KEY;

afterEach(() => {
  env.MINDLOGIC_API_KEY = originalKey;
  clearAdminCreditsCache();
  vi.unstubAllGlobals();
});

describe("Mindlogic credits", () => {
  it("normalizes the monthly, purchased and total credit buckets", async () => {
    env.MINDLOGIC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ monthly_allocated: { quota: 100, used: 25, remaining: 75, renewal_date: "2026-10-01T00:00:00Z" }, purchased: { quota: 50, used: 5, remaining: 45 }, total: { quota: 150, used: 30, remaining: 120 } }) }));
    const result = await getAdminCredits(true);
    expect(result.available).toBe(true);
    expect(result.total?.remaining).toBe(120);
    expect(result.monthly?.renewalDate).toBe("2026-10-01T00:00:00Z");
  });

  it.each([401, 429])("returns an unavailable state for HTTP %s", async (status) => {
    env.MINDLOGIC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) }));
    const result = await getAdminCredits(true);
    expect(result.available).toBe(false);
    expect(result.error).toContain(String(status));
  });

  it("returns an unavailable state when the provider times out", async () => {
    env.MINDLOGIC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    const result = await getAdminCredits(true);
    expect(result.available).toBe(false);
    expect(result.monthly).toBeNull();
  });
});
