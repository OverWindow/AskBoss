import { describe, expect, it } from "vitest";
import { toIsoTimestamp } from "../src/utils/database";

describe("database timestamp normalization", () => {
  it("accepts Date objects and ISO strings", () => {
    const expected = "2026-09-19T03:30:00.000Z";
    expect(toIsoTimestamp(new Date(expected), "created_at")).toBe(expected);
    expect(toIsoTimestamp(expected, "created_at")).toBe(expected);
  });

  it("reports the affected field for missing timestamps", () => {
    expect(() => toIsoTimestamp(undefined, "sessions.created_at"))
      .toThrow("Database timestamp is missing or invalid: sessions.created_at");
  });
});
