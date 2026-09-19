import { afterAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { store } from "../src/repositories";
import { storage } from "../src/services/storage";

const app = buildApp();
afterAll(() => app.close());

async function sessionCookie() {
  const response = await app.inject({ method: "POST", url: "/api/session" });
  return String(response.headers["set-cookie"]).split(";")[0]!;
}

async function personalBoss(cookie: string, alias = "삭제 테스트 상사") {
  const response = await app.inject({ method: "POST", url: "/api/bosses", headers: { cookie }, payload: { alias, avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "팀장", companyName: "테스트", ageBand: 40, hierarchyScore: 60, genderBalanceScore: 0 } });
  return response.json().boss as { id: string; sessionId: string };
}

describe("personal boss deletion", () => {
  it("removes every boss-owned record and every uploaded storage object", async () => {
    const cookie = await sessionCookie();
    const boss = await personalBoss(cookie);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const upload = await store.createUploadIntent({ sessionId: boss.sessionId, bossId: boss.id, storagePath: `${boss.sessionId}/${boss.id}/pending.png`, originalName: "pending.png", contentType: "image/png", sizeBytes: 12, expiresAt });
    await store.createEvidence({ bossId: boss.id, sessionId: boss.sessionId, type: "IMAGE", status: "READY", rawText: null, storagePath: `${boss.sessionId}/${boss.id}/ready.png`, parsedData: {}, observedAt: null, expiresAt });
    await store.upsertSurveyAnswers(boss.sessionId, boss.id, [{ questionId: "q1", questionSnapshot: {}, selectedOption: "A", freeText: null }]);
    const thread = await store.getOrCreateThread(boss.sessionId, boss.id, undefined, expiresAt);
    await store.addChatMessage(thread.id, "user", "테스트 대화");
    const translation = await store.createTranslation({
      sessionId: boss.sessionId,
      bossId: boss.id,
      inputText: "확인했나?",
      channel: "사내 메신저",
      result: {
        plainMeaning: "확인 요청",
        likelyIntent: [],
        tone: "간결",
        caution: "",
        confidence: 0.5,
        surfaceActualGapScore: 10,
        replies: [
          { text: "확인하겠습니다.", style: "기본", reason: "확인 의사를 전합니다." },
          { text: "바로 확인하겠습니다.", style: "간결", reason: "즉시 대응을 알립니다." },
          { text: "확인 후 공유드리겠습니다.", style: "보고", reason: "후속 보고를 약속합니다." },
        ],
      },
      expiresAt,
    });
    await store.addMonologue(boss.sessionId, boss.id, "진행 상황은 어떤가?");
    const job = await store.createJob({ sessionId: boss.sessionId, bossId: boss.id, type: "CHAT_SUMMARIZE", payload: {} });
    const remove = vi.spyOn(storage, "remove").mockResolvedValueOnce();

    const response = await app.inject({ method: "DELETE", url: `/api/bosses/${boss.id}`, headers: { cookie } });
    expect(response.statusCode).toBe(204);
    expect(remove).toHaveBeenCalledWith(expect.arrayContaining([upload.storagePath, `${boss.sessionId}/${boss.id}/ready.png`]));
    expect(await store.getBoss(boss.sessionId, boss.id)).toBeNull();
    expect(await store.listBossStoragePaths(boss.sessionId, boss.id)).toEqual([]);
    expect(await store.listEvidence(boss.sessionId, boss.id)).toEqual([]);
    expect(await store.listSurveyAnswers(boss.sessionId, boss.id)).toEqual([]);
    expect(await store.listChatMessages(boss.sessionId, boss.id)).toMatchObject({ threadId: null, messages: [] });
    expect(await store.getTranslation(boss.sessionId, translation.id)).toBeNull();
    expect(await store.listMonologues(boss.sessionId, boss.id, 10)).toEqual([]);
    expect(await store.getJobById(job.id)).toBeNull();
  });

  it("does not delete the global boss or another session's boss", async () => {
    const first = await sessionCookie();
    const second = await sessionCookie();
    const boss = await personalBoss(first, "소유권 테스트");
    const global = await app.inject({ method: "DELETE", url: "/api/bosses/00000000-0000-4000-8000-000000000001", headers: { cookie: first } });
    const foreign = await app.inject({ method: "DELETE", url: `/api/bosses/${boss.id}`, headers: { cookie: second } });
    expect(global.statusCode).toBe(404);
    expect(foreign.statusCode).toBe(404);
    expect(await store.getBoss(boss.sessionId, boss.id)).not.toBeNull();
  });
});
