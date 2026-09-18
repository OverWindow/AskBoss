import { afterEach, describe, expect, it, vi } from "vitest";
import { streamBossChat } from "./sse-client";

describe("streamBossChat", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts when meta arrives but the first answer delta never does", async () => {
    vi.useFakeTimers();
    const onEvent = vi.fn();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: meta\ndata: {"threadId":"thread-1"}\n\n'));
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
    }));

    const expectation = expect(streamBossChat("boss-1", { message: "test" }, onEvent, {
      firstDeltaTimeoutMs: 50,
      idleTimeoutMs: 50,
      totalTimeoutMs: 500,
    })).rejects.toMatchObject({ code: "AI_FIRST_DELTA_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(51);
    await expectation;
    expect(onEvent).toHaveBeenCalledWith("meta", { threadId: "thread-1" });
  });
});
