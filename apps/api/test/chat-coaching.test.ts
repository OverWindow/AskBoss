import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { store } from "../src/repositories";
import { ai } from "../src/services/ai";
import { FakeAiService } from "../src/services/ai/fake";

const app = buildApp();
const globalBossId = "00000000-0000-4000-8000-000000000001";

afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

async function createSession() {
  const response = await app.inject({ method: "POST", url: "/api/session" });
  return String(response.headers["set-cookie"]).split(";")[0]!;
}

async function sendMessage(cookie: string, message: string) {
  const response = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat`, headers: { cookie, accept: "text/event-stream" }, payload: { message } });
  expect(response.statusCode).toBe(200);
  const history = await app.inject({ method: "GET", url: `/api/bosses/${globalBossId}/chat`, headers: { cookie } });
  return history.json().messages.find((item: any) => item.role === "user" && item.kind === "CHAT");
}

describe("chat message coaching", () => {
  it("stores a structured suggestion and reuses it without another AI call", async () => {
    const cookie = await createSession();
    const message = await sendMessage(cookie, "몰라요. 그냥 알아서 하세요.");
    const review = vi.spyOn(ai, "reviewUserMessage").mockResolvedValue({
      shouldSuggest: true,
      reason: "책임을 피하는 표현으로 들릴 수 있습니다.",
      revisedText: "제가 확인한 범위를 먼저 정리하고 필요한 부분을 다시 여쭙겠습니다.",
    });

    const first = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat/messages/${message.id}/coaching`, headers: { cookie } });
    expect(first.statusCode).toBe(200);
    expect(first.json().coaching).toMatchObject({ shouldSuggest: true, revisedText: expect.stringContaining("확인한 범위") });
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ message: "몰라요. 그냥 알아서 하세요.", messages: expect.any(Array) }), expect.any(AbortSignal));

    const second = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat/messages/${message.id}/coaching`, headers: { cookie } });
    expect(second.json()).toEqual(first.json());
    expect(review).toHaveBeenCalledTimes(1);

    const history = await app.inject({ method: "GET", url: `/api/bosses/${globalBossId}/chat`, headers: { cookie } });
    expect(history.json().messages.find((item: any) => item.id === message.id).coaching).toEqual(first.json().coaching);
  });

  it("keeps no-suggestion results and enforces message ownership", async () => {
    const ownerCookie = await createSession();
    const foreignCookie = await createSession();
    const message = await sendMessage(ownerCookie, "진행 상황을 확인해서 오후에 공유드리겠습니다.");
    const review = vi.spyOn(ai, "reviewUserMessage").mockResolvedValue({ shouldSuggest: false, reason: null, revisedText: null });

    const saved = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat/messages/${message.id}/coaching`, headers: { cookie: ownerCookie } });
    expect(saved.json().coaching).toEqual({ shouldSuggest: false, reason: null, revisedText: null });
    const foreign = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat/messages/${message.id}/coaching`, headers: { cookie: foreignCookie } });
    expect(foreign.statusCode).toBe(404);
    const unauthenticated = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat/messages/${message.id}/coaching` });
    expect(unauthenticated.statusCode).toBe(401);
    expect(review).toHaveBeenCalledTimes(1);
  });

  it("uses the latest admin judgment criteria only for messages without a stored review", async () => {
    const before = await store.getAiPromptSettings();
    const criteria = "기한이나 담당자가 불분명해 실행 오류가 예상될 때만 수정 제안을 표시한다.";
    await store.updateAiPromptSettings({ translation: before.translation, translationReplyStyles: before.translationReplyStyles, coaching: criteria, onboarding: before.onboarding });
    const cookie = await createSession();
    const message = await sendMessage(cookie, "그건 나중에 처리할게요.");
    const review = vi.spyOn(ai, "reviewUserMessage").mockResolvedValue({ shouldSuggest: true, reason: "기한이 불분명합니다.", revisedText: "오늘 오후까지 처리하겠습니다." });
    try {
      const first = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat/messages/${message.id}/coaching`, headers: { cookie } });
      expect(first.statusCode).toBe(200);
      expect(review).toHaveBeenCalledWith(expect.objectContaining({ promptInstruction: criteria }), expect.any(AbortSignal));

      await store.updateAiPromptSettings({ translation: before.translation, translationReplyStyles: before.translationReplyStyles, coaching: "항상 수정 제안을 표시한다.", onboarding: before.onboarding });
      const cached = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat/messages/${message.id}/coaching`, headers: { cookie } });
      expect(cached.json()).toEqual(first.json());
      expect(review).toHaveBeenCalledTimes(1);
    } finally {
      await store.updateAiPromptSettings({ translation: before.translation, translationReplyStyles: before.translationReplyStyles, coaching: before.coaching, onboarding: before.onboarding });
    }
  });

  it("rejects translation simulation replies", async () => {
    const cookie = await createSession();
    const translated = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/translate`, headers: { cookie }, payload: { inputText: "이거 언제 되나?", channel: "사내 메신저" } });
    await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat/simulate`, headers: { cookie }, payload: { translationId: translated.json().translationId, replyIndex: 0 } });
    const history = await app.inject({ method: "GET", url: `/api/bosses/${globalBossId}/chat`, headers: { cookie } });
    const reply = history.json().messages.find((item: any) => item.kind === "SIMULATION_REPLY");
    const review = vi.spyOn(ai, "reviewUserMessage");

    const response = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/chat/messages/${reply.id}/coaching`, headers: { cookie } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("COACHING_UNSUPPORTED_MESSAGE");
    expect(review).not.toHaveBeenCalled();
  });
});

describe("conservative coaching defaults", () => {
  const fake = new FakeAiService();

  it.each(["네, 확인해볼게요.", "오늘 중으로 공유드릴게요!", "ㅋㅋ 알겠습니다", "자료 확인하고 다시 말씀드리겠습니다"])('does not coach a clear ordinary message: "%s"', async (message) => {
    await expect(fake.reviewUserMessage({ message })).resolves.toEqual({ shouldSuggest: false, reason: null, revisedText: null });
  });

  it("coaches only clearly inappropriate or highly ambiguous demo messages", async () => {
    await expect(fake.reviewUserMessage({ message: "그건 내 알 바 아니니까 네가 알아서 해." })).resolves.toMatchObject({ shouldSuggest: true });
    await expect(fake.reviewUserMessage({ message: "그거 나중에 해둘게요." })).resolves.toMatchObject({ shouldSuggest: true });
  });
});
