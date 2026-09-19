import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { ai } from "../src/services/ai";
import { store } from "../src/repositories";

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

  it("replaces chat history with a persisted simulation that can continue as a conversation", async () => {
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const bossId = "00000000-0000-4000-8000-000000000001";
    const translated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie }, payload: { inputText: "이거 언제 되나?", channel: "사내 메신저" } });
    const { translationId, result } = translated.json();
    const incrementSimulation = vi.spyOn(store,"incrementTranslationSimulation");

    const stream = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie, accept: "text/event-stream" }, payload: { translationId, replyIndex: 1 } });
    expect(stream.statusCode).toBe(200);
    expect([...stream.body.matchAll(/^event: (\w+)/gm)].map((match) => match[1])).toEqual(expect.arrayContaining(["meta", "delta", "done"]));
    expect(stream.body).toContain("SIMULATION_SOURCE");
    expect(stream.body).toContain("SIMULATION_REPLY");
    expect(stream.body).toContain("SIMULATION_REACTION");
    expect(incrementSimulation).toHaveBeenCalledWith(expect.any(String),translationId);

    const history = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(history.json().messages.map((message: any) => ({ role: message.role, kind: message.kind }))).toEqual([
      { role: "assistant", kind: "SIMULATION_SOURCE" },
      { role: "user", kind: "SIMULATION_REPLY" },
      { role: "assistant", kind: "SIMULATION_REACTION" },
    ]);
    expect(history.json().messages[0].content).toBe("이거 언제 되나?");
    expect(history.json().messages[1].content).toBe(result.replies[1].text);

    const chatInputs: any[] = [];
    vi.spyOn(ai, "streamChatWithBoss").mockImplementation(async function* (input: any, _signal?: AbortSignal) { chatInputs.push(input); yield "후속 답변입니다."; });
    const followUp = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat`, headers: { cookie }, payload: { threadId: history.json().threadId, message: "그 다음에는요?" } });
    expect(followUp.statusCode).toBe(200);
    expect(chatInputs[0].messages.map((message: any) => message.kind)).toEqual(["SIMULATION_SOURCE", "SIMULATION_REPLY", "SIMULATION_REACTION"]);

    const replacement = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie }, payload: { translationId, replyIndex: 0 } });
    expect(replacement.statusCode).toBe(200);
    const replacedHistory = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(replacedHistory.json().threadId).not.toBe(history.json().threadId);
    expect(replacedHistory.json().messages).toHaveLength(3);
    expect(replacedHistory.json().messages.some((message: any) => message.content === "그 다음에는요?")).toBe(false);
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
    expect(history.json().messages.map((message: any) => message.kind)).toEqual(["SIMULATION_SOURCE", "SIMULATION_REPLY"]);
    expect(history.json().messages.some((message: any) => message.content.includes("부분 반응"))).toBe(false);
  });

  it("replaces the predicted branch with an actual response and keeps the archived evidence after chat reset", async () => {
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const sessionId = session.json().session.id as string;
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const bossId = "00000000-0000-4000-8000-000000000001";
    const translated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie }, payload: { inputText: "오늘까지 되나?", channel: "사내 메신저" } });
    const archiveCookie = String(translated.headers["set-cookie"]).split(";")[0]!;
    const cookies = `${cookie}; ${archiveCookie}`;
    const archiveId = translated.json().archiveId as string;
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie }, payload: { translationId: translated.json().translationId, replyIndex: 0 } });
    const history = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat`, headers: { cookie }, payload: { threadId: history.json().threadId, message: "그럼 네 시까지 드리겠습니다." } });
    const tooLong = await app.inject({ method: "PUT", url: `/api/archives/${archiveId}/actual-response`, headers: { cookie: cookies }, payload: { content: "가".repeat(2_001) } });
    expect(tooLong.statusCode).toBe(400);

    const saved = await app.inject({ method: "PUT", url: `/api/archives/${archiveId}/actual-response`, headers: { cookie: cookies }, payload: { content: "좋아, 그럼 세 시에 다시 보자." } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ archive: { actualResponse: { content: "좋아, 그럼 세 시에 다시 보자." } }, activeChat: { archiveId }, application: "SESSION_CALIBRATION" });
    expect(saved.json().activeChat.threadId).not.toBe(history.json().threadId);
    expect(saved.json().activeChat.messages.map((message: any) => message.kind)).toEqual(["SIMULATION_SOURCE", "SIMULATION_REPLY", "ACTUAL_RESPONSE"]);
    expect(saved.json().activeChat.messages.some((message: any) => message.content === "그럼 네 시까지 드리겠습니다.")).toBe(false);
    expect(saved.json().archive.branches.some((branch: any) => branch.kind === "PREDICTED" && branch.messages.some((message: any) => message.content === "그럼 네 시까지 드리겠습니다."))).toBe(true);

    const updated = await app.inject({ method: "PUT", url: `/api/archives/${archiveId}/actual-response`, headers: { cookie: cookies }, payload: { content: "좋아, 네 시에 다시 보자." } });
    expect(updated.json().archive.actualResponse.content).toBe("좋아, 네 시에 다시 보자.");

    const otherSession = await app.inject({ method: "POST", url: "/api/session" });
    const otherCookie = String(otherSession.headers["set-cookie"]).split(";")[0]!;
    const crossSession = await app.inject({ method: "PUT", url: `/api/archives/${archiveId}/actual-response`, headers: { cookie: otherCookie }, payload: { content: "다른 기기의 변조" } });
    expect(crossSession.statusCode).toBe(404);

    const restored = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(restored.json().messages.find((message: any) => message.kind === "ACTUAL_RESPONSE").content).toBe("좋아, 네 시에 다시 보자.");
    expect((await store.listGlobalEvidence()).some((item) => item.rawText?.includes("네 시"))).toBe(false);

    const reset = await app.inject({ method: "DELETE", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(reset.statusCode).toBe(204);
    const empty = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie } });
    expect(empty.json()).toMatchObject({ threadId: null, messages: [] });
    const archived = await app.inject({ method: "GET", url: `/api/archives/${archiveId}`, headers: { cookie: cookies } });
    expect(archived.json().archive.actualResponse.content).toBe("좋아, 네 시에 다시 보자.");
    expect(archived.json().archive.branches.length).toBeGreaterThanOrEqual(3);
    const evidence = (await store.listEvidence(sessionId, bossId)).filter((item) => item.type === "FEEDBACK");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ status: "READY", sourceArchiveId: archiveId });
    expect(evidence[0]?.rawText).toContain("좋아, 네 시에 다시 보자.");
  });

  it("keeps personal-boss feedback for the next manual persona rebuild", async () => {
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const created = await app.inject({ method: "POST", url: "/api/bosses", headers: { cookie }, payload: { alias: "김부장", avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "부장", companyName: "테스트", ageBand: 40, hierarchyScore: 70 } });
    const bossId = created.json().boss.id as string;
    const translated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie }, payload: { inputText: "언제 끝나나?", channel: "대면" } });
    const archiveCookie = String(translated.headers["set-cookie"]).split(";")[0]!;
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie }, payload: { translationId: translated.json().translationId, replyIndex: 0 } });
    const feedback = await app.inject({ method: "PUT", url: `/api/archives/${translated.json().archiveId}/actual-response`, headers: { cookie: `${cookie}; ${archiveCookie}` }, payload: { content: "실제로는 오전 중간 보고부터 달라고 했습니다." } });
    expect(feedback.json().application).toBe("NEXT_PERSONA_REBUILD");

    const builds: any[] = [];
    const originalBuild = ai.buildPersona.bind(ai);
    vi.spyOn(ai, "buildPersona").mockImplementation(async (input: any) => { builds.push(input); return originalBuild(input); });
    const rebuild = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/persona/rebuild`, headers: { cookie } });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const status = await app.inject({ method: "GET", url: `/api/jobs/${rebuild.json().jobId}`, headers: { cookie } });
      if (status.json().job.status === "SUCCEEDED") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const feedbackEvidence = builds.at(-1)?.evidence.filter((item: any) => item.type === "FEEDBACK");
    expect(feedbackEvidence).toHaveLength(1);
    expect(feedbackEvidence[0].rawText).toContain("오전 중간 보고부터");
  });
});
