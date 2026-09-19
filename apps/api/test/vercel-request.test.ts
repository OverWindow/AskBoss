import { describe, expect, it } from "vitest";
import { restoreRewrittenApiUrl } from "../src/utils/vercel-request.js";

describe("restoreRewrittenApiUrl", () => {
  it("restores a deeply nested Fastify API route", () => {
    expect(
      restoreRewrittenApiUrl(
        "/api/entry?_vercel_api_path=bosses%2F00000000-0000-4000-8000-000000000001%2Ftranslate",
      ),
    ).toBe("/api/bosses/00000000-0000-4000-8000-000000000001/translate");
    expect(
      restoreRewrittenApiUrl(
        "/api/entry?_vercel_api_path=bosses/00000000-0000-4000-8000-000000000001/translate",
      ),
    ).toBe("/api/bosses/00000000-0000-4000-8000-000000000001/translate");
  });

  it("preserves user query parameters while removing the internal routing parameter", () => {
    expect(restoreRewrittenApiUrl("/api/entry?cursor=next&_vercel_api_path=admin%2Fsessions&limit=20")).toBe(
      "/api/admin/sessions?cursor=next&limit=20",
    );
  });

  it("leaves local and non-rewritten requests unchanged", () => {
    expect(restoreRewrittenApiUrl("/api/health")).toBe("/api/health");
    expect(restoreRewrittenApiUrl(undefined)).toBeUndefined();
  });
});
