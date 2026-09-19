import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { store } from "../src/repositories/index.js";
import { ai } from "../src/services/ai/index.js";

const app = buildApp();
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

function responseCookie(response: { headers: Record<string, unknown> }, name: string) {
  const header = response.headers["set-cookie"];
  const values = Array.isArray(header) ? header.map(String) : [String(header ?? "")];
  const value = values.find((item) => item.startsWith(`${name}=`));
  if (!value) throw new Error(`${name} cookie was not set`);
  return value.split(";")[0]!;
}

async function session() {
  const response = await app.inject({ method: "POST", url: "/api/session" });
  return { id: response.json().session.id as string, cookie: responseCookie(response as any, "hr_session") };
}

function cookies(...values: string[]) {
  return values.join("; ");
}

const globalBossId = "00000000-0000-4000-8000-000000000001";

describe("translation archives", () => {
  it("archives only completed translations, isolates device owners, and paginates without gaps", async () => {
    expect((await app.inject({ method: "GET", url: "/api/archives" })).statusCode).toBe(401);
    const firstSession = await session();
    const first = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/translate`, headers: { cookie: firstSession.cookie }, payload: { inputText: "첫 번째 번역", channel: "사내 메신저" } });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ translationId: expect.any(String), archiveId: expect.any(String) });
    const archiveCookie = responseCookie(first as any, "boss_archive");
    const setCookie = String(first.headers["set-cookie"]);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=315360000");

    const rawToken = archiveCookie.slice("boss_archive=".length);
    const storedOwner = (store as any).archives?.get(first.json().archiveId)?.ownerHash;
    if (storedOwner) expect(storedOwner).not.toBe(rawToken);

    const ownerCookies = cookies(firstSession.cookie, archiveCookie);
    const second = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/translate`, headers: { cookie: ownerCookies }, payload: { inputText: "두 번째 번역", channel: "메일" } });
    expect(second.statusCode).toBe(200);

    const pageOne = await app.inject({ method: "GET", url: "/api/archives?limit=1", headers: { cookie: ownerCookies } });
    expect(pageOne.json().items).toHaveLength(1);
    expect(pageOne.json().nextCursor).toEqual(expect.any(String));
    const pageTwo = await app.inject({ method: "GET", url: `/api/archives?limit=1&cursor=${encodeURIComponent(pageOne.json().nextCursor)}`, headers: { cookie: ownerCookies } });
    expect(pageTwo.json().items).toHaveLength(1);
    expect(new Set([...pageOne.json().items, ...pageTwo.json().items].map((item: any) => item.id))).toEqual(new Set([first.json().archiveId, second.json().archiveId]));
    expect(pageOne.json().items[0].result).toBeUndefined();
    expect((await app.inject({ method: "GET", url: "/api/archives?cursor=broken", headers: { cookie: ownerCookies } })).statusCode).toBe(400);

    const otherSession = await session();
    const isolated = await app.inject({ method: "GET", url: "/api/archives", headers: { cookie: otherSession.cookie } });
    expect(isolated.json().items).toEqual([]);

    vi.spyOn(ai, "translateBossMessage").mockRejectedValueOnce(new Error("provider failed"));
    const failed = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/translate`, headers: { cookie: ownerCookies }, payload: { inputText: "실패한 번역", channel: "대면" } });
    expect(failed.statusCode).toBe(500);
    const afterFailure = await app.inject({ method: "GET", url: "/api/archives", headers: { cookie: ownerCookies } });
    expect(afterFailure.json().items).toHaveLength(2);
    expect(afterFailure.json().items.some((item: any) => item.inputText === "실패한 번역")).toBe(false);
  });

  it("freezes the copied reply, preserves predicted history, and survives session reset", async () => {
    const originalSession = await session();
    const createdBoss = await app.inject({ method: "POST", url: "/api/bosses", headers: { cookie: originalSession.cookie }, payload: { alias: "아카이브 상사", avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "팀장", companyName: "테스트", ageBand: 40, hierarchyScore: 70 } });
    const bossId = createdBoss.json().boss.id as string;
    const translated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie: originalSession.cookie }, payload: { inputText: "오늘까지 되나?", channel: "사내 메신저" } });
    const archiveId = translated.json().archiveId as string;
    const ownerCookie = responseCookie(translated as any, "boss_archive");
    const ownerCookies = cookies(originalSession.cookie, ownerCookie);
    const replyText = translated.json().result.replies[1].text as string;

    const selected = await app.inject({ method: "PUT", url: `/api/archives/${archiveId}/selected-reply`, headers: { cookie: ownerCookies }, payload: { replyIndex: 1 } });
    expect(selected.json().archive.lastCopiedReplyIndex).toBe(1);
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie: originalSession.cookie }, payload: { translationId: translated.json().translationId, replyIndex: 1 } });
    const live = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/chat`, headers: { cookie: originalSession.cookie } });
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat`, headers: { cookie: originalSession.cookie }, payload: { threadId: live.json().threadId, message: "네, 변동되면 말씀드리겠습니다." } });

    const actual = await app.inject({ method: "PUT", url: `/api/archives/${archiveId}/actual-response`, headers: { cookie: ownerCookies }, payload: { content: "그럼 세 시에 중간 보고해." } });
    expect(actual.json()).toMatchObject({ archive: { actualResponse: { replyIndex: 1, replyText } }, application: "NEXT_PERSONA_REBUILD" });
    expect(actual.json().activeChat.messages.map((message: any) => message.kind)).toEqual(["SIMULATION_SOURCE", "SIMULATION_REPLY", "ACTUAL_RESPONSE"]);
    const predicted = actual.json().archive.branches.find((branch: any) => branch.kind === "PREDICTED");
    expect(predicted.status).toBe("SUPERSEDED");
    expect(predicted.messages.some((message: any) => message.content === "네, 변동되면 말씀드리겠습니다.")).toBe(true);

    const reactionGenerator = vi.spyOn(ai, "streamSimulatedBossReaction").mockImplementation(async function* () { yield "새 예상 반응"; });
    const knownActual = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie: originalSession.cookie }, payload: { translationId: translated.json().translationId, replyIndex: 1 } });
    expect([...knownActual.body.matchAll(/^event: (\w+)/gm)].map((match) => match[1])).toEqual(["meta", "done"]);
    expect(knownActual.body).toContain("ACTUAL_RESPONSE");
    expect(reactionGenerator).not.toHaveBeenCalled();

    await app.inject({ method: "PUT", url: `/api/archives/${archiveId}/selected-reply`, headers: { cookie: ownerCookies }, payload: { replyIndex: 2 } });
    const unknownActual = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie: originalSession.cookie }, payload: { translationId: translated.json().translationId, replyIndex: 2 } });
    expect(unknownActual.body).toContain("새 예상 반응");
    expect(reactionGenerator).toHaveBeenCalledTimes(1);
    const detail = await app.inject({ method: "GET", url: `/api/archives/${archiveId}`, headers: { cookie: ownerCookies } });
    expect(detail.json().archive.lastCopiedReplyIndex).toBe(2);
    expect(detail.json().archive.actualResponse).toMatchObject({ replyIndex: 1, replyText });
    expect(detail.json().archive).not.toHaveProperty("ownerHash");
    expect(detail.json().archive).not.toHaveProperty("translationId");
    expect(detail.json().archive).not.toHaveProperty("sourceSessionId");

    await app.inject({ method: "DELETE", url: "/api/session", headers: { cookie: originalSession.cookie } });
    const replacementSession = await session();
    const replacementCookies = cookies(replacementSession.cookie, ownerCookie);
    const persisted = await app.inject({ method: "GET", url: `/api/archives/${archiveId}`, headers: { cookie: replacementCookies } });
    expect(persisted.statusCode).toBe(200);
    expect(persisted.json().archive.branches.every((branch: any) => branch.status !== "ACTIVE")).toBe(true);
    const archiveOnly = await app.inject({ method: "PUT", url: `/api/archives/${archiveId}/actual-response`, headers: { cookie: replacementCookies }, payload: { content: "실제로는 네 시에 보자고 했습니다." } });
    expect(archiveOnly.json()).toMatchObject({ application: "ARCHIVE_ONLY", activeChat: null });
  });

  it("accepts an actual response without a copied reply", async () => {
    const currentSession = await session();
    const translated = await app.inject({ method: "POST", url: `/api/bosses/${globalBossId}/translate`, headers: { cookie: currentSession.cookie }, payload: { inputText: "결과 나왔나?", channel: "대면" } });
    const ownerCookie = responseCookie(translated as any, "boss_archive");
    const saved = await app.inject({ method: "PUT", url: `/api/archives/${translated.json().archiveId}/actual-response`, headers: { cookie: cookies(currentSession.cookie, ownerCookie) }, payload: { content: "내일 다시 알려줘." } });
    expect(saved.json().archive.actualResponse).toMatchObject({ content: "내일 다시 알려줘.", replyIndex: null, replyText: null });
  });
});
