import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { ai } from "../src/services/ai";

const app = buildApp();
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

describe("chat SSE", () => {
  it("emits meta, delta, done and persists only the completed assistant reply", async () => {
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const bosses = await app.inject({ method: "GET", url: "/api/bosses", headers: { cookie } });
    const bossId = bosses.json().bosses[0].id as string;

    const stream = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat`, headers: { cookie, accept: "text/event-stream" }, payload: { message: "일정이 조금 늦어질 것 같습니다." } });
    expect(stream.statusCode).toBe(200);
    const events = [...stream.body.matchAll(/^event: (\w+)/gm)].map((match) => match[1]);
    expect(events[0]).toBe("meta");
    expect(events.at(-1)).toBe("done");
    expect(events).toContain("delta");

    const history = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(history.statusCode).toBe(200);
    expect(history.json().messages.map((message: any) => message.role)).toEqual(["user", "assistant"]);
  });

  it("emits an error and does not persist a partial assistant reply", async () => {
    vi.spyOn(ai, "streamChatWithBoss").mockImplementation(async function* () {
      yield "작성 중인 답변";
      throw new Error("provider disconnected");
    });
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const bosses = await app.inject({ method: "GET", url: "/api/bosses", headers: { cookie } });
    const bossId = bosses.json().bosses[0].id as string;

    const stream = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat`, headers: { cookie, accept: "text/event-stream" }, payload: { message: "진행 상황을 알려주세요." } });
    const events = [...stream.body.matchAll(/^event: (\w+)/gm)].map((match) => match[1]);
    expect(events).toEqual(["meta", "delta", "error"]);

    const history = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(history.json().messages.map((message: any) => message.role)).toEqual(["user"]);
  });
});
