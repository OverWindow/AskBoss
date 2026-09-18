import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ensureSession } from "./api-client";

describe("ensureSession", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not attach a JSON content type to the empty session creation request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: async () => ({ error: { code: "SESSION_REQUIRED", message: "세션이 없습니다." } }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ session: { id: "session-1", expiresAt: "2026-09-20T00:00:00Z" } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await ensureSession();

    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(secondRequest.method).toBe("POST");
    expect(new Headers(secondRequest.headers).has("content-type")).toBe(false);
  });

  it("aborts a stalled request and returns a timeout error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));

    const expectation = expect(api("/slow", { timeoutMs: 50 })).rejects.toMatchObject({ code: "REQUEST_TIMEOUT", status: 0 });
    await vi.advanceTimersByTimeAsync(51);
    await expectation;
  });
});
