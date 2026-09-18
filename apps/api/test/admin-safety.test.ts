import { describe, expect, it } from "vitest";
import { safeJobFailureReason, summarizeJobFailures } from "../src/utils/admin-safety";

describe("admin job error redaction", () => {
  it("returns a safe category instead of the provider error text", () => {
    const raw = "Unauthorized API key sk-secret with evidence: confidential sentence";
    const safe = safeJobFailureReason(raw);
    expect(safe).toBe("AI 인증 또는 권한 오류");
    expect(safe).not.toContain("confidential");
    expect(safe).not.toContain("sk-secret");
  });

  it("groups failure categories without preserving raw messages", () => {
    expect(summarizeJobFailures(["request timeout", "timed out", "HTTP 429 rate limit"]))
      .toEqual([{ reason: "AI 응답 시간 초과", count: 2 }, { reason: "AI 호출 한도 초과", count: 1 }]);
  });
});
