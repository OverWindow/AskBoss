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

  it("streams and stores AI replies as plain text even when the provider returns Markdown", async () => {
    vi.spyOn(ai, "streamChatWithBoss").mockImplementation(async function* () {
      yield "## 결론\n";
      yield "- **오늘 오후**까지 공유해요.";
    });
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const bossId = "00000000-0000-4000-8000-000000000001";

    const stream = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat`, headers: { cookie, accept: "text/event-stream" }, payload: { message: "언제 공유할까요?" } });
    expect(stream.body).toContain("결론");
    expect(stream.body).toContain("오늘 오후까지 공유해요.");
    expect(stream.body).not.toMatch(/##|\*\*|^- /m);

    const history = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(history.json().messages.at(-1).content).toBe("결론\n오늘 오후까지 공유해요.");
  });

  it("streams a translated reply simulation without creating chat history", async () => {
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const bossId = "00000000-0000-4000-8000-000000000001";
    const translated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie }, payload: { inputText: "이거 언제 되나?", channel: "사내 메신저" } });
    const { translationId, result } = translated.json();

    const stream = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie, accept: "text/event-stream" }, payload: { translationId, replyIndex: 1 } });
    expect(stream.statusCode).toBe(200);
    expect([...stream.body.matchAll(/^event: (\w+)/gm)].map((match) => match[1])).toEqual(expect.arrayContaining(["meta", "delta", "done"]));
    expect(stream.body).toContain("이거 언제 되나?");
    expect(stream.body).toContain(result.replies[1].text);

    const history = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(history.json()).toMatchObject({ threadId: null, messages: [] });
  });

  it("does not persist partial simulation content when the provider fails", async () => {
    vi.spyOn(ai, "streamSimulatedBossReaction").mockImplementation(async function* () {
      yield "부분 반응";
      throw new Error("provider disconnected");
    });
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const bossId = "00000000-0000-4000-8000-000000000001";
    const translated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie }, payload: { inputText: "확인했나?", channel: "사내 메신저" } });

    const stream = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie, accept: "text/event-stream" }, payload: { translationId: translated.json().translationId, replyIndex: 0 } });
    expect([...stream.body.matchAll(/^event: (\w+)/gm)].map((match) => match[1])).toEqual(["meta", "delta", "error"]);
    const history = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(history.json()).toMatchObject({ threadId: null, messages: [] });
  });
});
