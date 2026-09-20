import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { ai } from "../src/services/ai";
import { jobs } from "../src/services/jobs";
import { storage } from "../src/services/storage";

const app = buildApp();
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

async function createOwner() {
  const session = await app.inject({ method: "POST", url: "/api/session" });
  const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
  const created = await app.inject({ method: "POST", url: "/api/bosses", headers: { cookie }, payload: { alias: "업로드 테스트", avatarKey: "boss-female-01", jobFunction: "기획", yearsOfServiceBand: "10~14년", rank: "부장", companyName: "테스트", ageBand: 40, hierarchyScore: 70, genderBalanceScore: 0 } });
  return { cookie, bossId: created.json().boss.id as string };
}

async function waitForJob(cookie: string, jobId: string) {
  for (let index = 0; index < 30; index++) {
    const response = await app.inject({ method: "GET", url: `/api/jobs/${jobId}`, headers: { cookie } });
    const job = response.json().job as { status: string };
    if (["SUCCEEDED", "FAILED"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("job timeout");
}

function expectSafeEvidenceSummary(evidence: Record<string, unknown>) {
  expect(Object.keys(evidence).sort()).toEqual(["createdAt", "errorMessage", "id", "sourceName", "status", "type"]);
  expect(evidence).not.toHaveProperty("rawText");
  expect(evidence).not.toHaveProperty("storagePath");
  expect(evidence).not.toHaveProperty("parsedData");
}

describe("personal boss evidence uploads", () => {
  it("processes pasted text, TXT, and images with the expected extraction inputs", async () => {
    const { cookie, bossId } = await createOwner();
    vi.spyOn(storage, "verify").mockResolvedValue(true);
    vi.spyOn(storage, "downloadText").mockResolvedValue("팀장님: 결론부터 공유해요.");
    vi.spyOn(storage, "createSignedDownload").mockResolvedValue("https://storage.example/signed-image");
    const original = ai.extractEvidence.bind(ai);
    const extraction = vi.spyOn(ai, "extractEvidence").mockImplementation((input) => original(input));

    const pasted = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/evidence`, headers: { cookie }, payload: { type: "TEXT", rawText: "일정은 미리 보고해요." } });
    expect(pasted.statusCode).toBe(202);
    expectSafeEvidenceSummary(pasted.json().evidence);
    expect((await waitForJob(cookie, pasted.json().jobId)).status).toBe("SUCCEEDED");

    for (const file of [{ fileName: "conversation.txt", contentType: "text/plain", size: 120, type: "TXT" }, { fileName: "capture.png", contentType: "image/png", size: 2048, type: "IMAGE" }]) {
      const signed = await app.inject({ method: "POST", url: "/api/uploads/sign", headers: { cookie }, payload: { bossId, fileName: file.fileName, contentType: file.contentType, size: file.size } });
      expect(signed.statusCode).toBe(200);
      const evidence = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/evidence`, headers: { cookie }, payload: { type: file.type, uploadIntentId: signed.json().upload.intentId } });
      expect(evidence.statusCode).toBe(202);
      expectSafeEvidenceSummary(evidence.json().evidence);
      expect((await waitForJob(cookie, evidence.json().jobId)).status).toBe("SUCCEEDED");
      const replay = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/evidence`, headers: { cookie }, payload: { type: file.type, uploadIntentId: signed.json().upload.intentId } });
      expect(replay.statusCode).toBe(400);
    }

    expect(extraction).toHaveBeenCalledWith(expect.objectContaining({ kind: "TEXT", content: "일정은 미리 보고해요." }));
    expect(extraction).toHaveBeenCalledWith(expect.objectContaining({ kind: "TXT", content: "팀장님: 결론부터 공유해요." }));
    expect(extraction).toHaveBeenCalledWith(expect.objectContaining({ kind: "IMAGE", content: "이미지 URL: https://storage.example/signed-image" }));

    const list = await app.inject({ method: "GET", url: `/api/bosses/${bossId}/evidence`, headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().evidence).toHaveLength(3);
    list.json().evidence.forEach(expectSafeEvidenceSummary);
    expect(JSON.stringify(list.json())).not.toContain("일정은 미리 보고해요.");
    expect(JSON.stringify(list.json())).not.toContain("storage.example");
  });

  it("rejects oversized, unsupported, foreign, and mismatched uploads", async () => {
    const owner = await createOwner();
    const foreign = await createOwner();
    const unsupported = await app.inject({ method: "POST", url: "/api/uploads/sign", headers: { cookie: owner.cookie }, payload: { bossId: owner.bossId, fileName: "data.pdf", contentType: "application/pdf", size: 100 } });
    const oversized = await app.inject({ method: "POST", url: "/api/uploads/sign", headers: { cookie: owner.cookie }, payload: { bossId: owner.bossId, fileName: "large.png", contentType: "image/png", size: 9 * 1024 * 1024 } });
    expect(unsupported.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(413);

    const signed = await app.inject({ method: "POST", url: "/api/uploads/sign", headers: { cookie: owner.cookie }, payload: { bossId: owner.bossId, fileName: "capture.webp", contentType: "image/webp", size: 512 } });
    const foreignUse = await app.inject({ method: "POST", url: `/api/bosses/${foreign.bossId}/evidence`, headers: { cookie: foreign.cookie }, payload: { type: "IMAGE", uploadIntentId: signed.json().upload.intentId } });
    expect(foreignUse.statusCode).toBe(400);

    vi.spyOn(storage, "verify").mockResolvedValue(false);
    const mismatch = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie }, payload: { type: "IMAGE", uploadIntentId: signed.json().upload.intentId } });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json().error.code).toBe("UPLOAD_MISMATCH");
  });

  it("isolates safe evidence summaries by session and boss", async () => {
    const owner = await createOwner();
    const foreign = await createOwner();
    const secondBoss = await app.inject({ method: "POST", url: "/api/bosses", headers: { cookie: owner.cookie }, payload: { alias: "두 번째 상사", avatarKey: "boss-female-01", jobFunction: "개발", yearsOfServiceBand: "6~9년", rank: "팀장", companyName: "테스트", ageBand: 40, hierarchyScore: 50, genderBalanceScore: 0 } });
    const text = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie }, payload: { type: "TEXT", rawText: "다른 상사에게 보이면 안 되는 대화" } });

    const foreignList = await app.inject({ method: "GET", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: foreign.cookie } });
    expect(foreignList.statusCode).toBe(404);
    const secondBossList = await app.inject({ method: "GET", url: `/api/bosses/${secondBoss.json().boss.id}/evidence`, headers: { cookie: owner.cookie } });
    expect(secondBossList.statusCode).toBe(200);
    expect(secondBossList.json().evidence).toEqual([]);
    const wrongBossDelete = await app.inject({ method: "DELETE", url: `/api/bosses/${secondBoss.json().boss.id}/evidence/${text.json().evidence.id}`, headers: { cookie: owner.cookie } });
    expect(wrongBossDelete.statusCode).toBe(404);
  });

  it("caps cumulative images at five, preserves names, and frees a slot after deletion", async () => {
    const owner = await createOwner();
    vi.spyOn(storage, "verify").mockResolvedValue(true);
    const remove = vi.spyOn(storage, "remove").mockResolvedValue();
    const uploads = await Promise.all(Array.from({ length: 6 }, (_, index) => app.inject({
      method: "POST",
      url: "/api/uploads/sign",
      headers: { cookie: owner.cookie },
      payload: { bossId: owner.bossId, fileName: `capture-${index}.png`, contentType: "image/png", size: 100 + index },
    })));
    expect(uploads.every((response) => response.statusCode === 200)).toBe(true);

    const registered = await Promise.all(uploads.map((signed) => app.inject({
      method: "POST",
      url: `/api/bosses/${owner.bossId}/evidence`,
      headers: { cookie: owner.cookie },
      payload: { type: "IMAGE", uploadIntentId: signed.json().upload.intentId },
    })));
    expect(registered.filter((response) => response.statusCode === 202)).toHaveLength(5);
    const rejected = registered.find((response) => response.statusCode === 409)!;
    expect(rejected.json().error.code).toBe("IMAGE_LIMIT_EXCEEDED");

    const list = await app.inject({ method: "GET", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie } });
    const images = list.json().evidence.filter((item: { type: string }) => item.type === "IMAGE");
    expect(images).toHaveLength(5);
    expect(images.map((item: { sourceName: string }) => item.sourceName)).toEqual(expect.arrayContaining(["capture-0.png", "capture-4.png"]));

    const full = await app.inject({ method: "POST", url: "/api/uploads/sign", headers: { cookie: owner.cookie }, payload: { bossId: owner.bossId, fileName: "blocked.png", contentType: "image/png", size: 200 } });
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe("IMAGE_LIMIT_EXCEEDED");

    const targetIndex = registered.findIndex((response) => response.statusCode === 202);
    const target = registered[targetIndex]!.json();
    const deleted = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/${target.evidence.id}`, headers: { cookie: owner.cookie } });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ deletedEvidenceId: target.evidence.id, deletedJobIds: expect.arrayContaining([target.jobId]), personaJobId: null, personaRebuildError: null });
    expect(remove).toHaveBeenCalledWith([uploads[targetIndex]!.json().upload.path]);

    const replacementSign = await app.inject({ method: "POST", url: "/api/uploads/sign", headers: { cookie: owner.cookie }, payload: { bossId: owner.bossId, fileName: "replacement.png", contentType: "image/png", size: 300 } });
    expect(replacementSign.statusCode).toBe(200);
    const replacement = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie }, payload: { type: "IMAGE", uploadIntentId: replacementSign.json().upload.intentId } });
    expect(replacement.statusCode).toBe(202);
  });

  it("deletes pasted text and TXT while rejecting foreign and missing personal evidence", async () => {
    const owner = await createOwner();
    const foreign = await createOwner();
    const text = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie }, payload: { type: "TEXT", rawText: "삭제할 텍스트" } });
    const foreignDelete = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/${text.json().evidence.id}`, headers: { cookie: foreign.cookie } });
    expect(foreignDelete.statusCode).toBe(404);
    const textDelete = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/${text.json().evidence.id}`, headers: { cookie: owner.cookie } });
    expect(textDelete.statusCode).toBe(200);
    expect(textDelete.json()).toMatchObject({ deletedEvidenceId: text.json().evidence.id, personaJobId: null });

    const signedTxt = await app.inject({ method: "POST", url: "/api/uploads/sign", headers: { cookie: owner.cookie }, payload: { bossId: owner.bossId, fileName: "remove.txt", contentType: "text/plain", size: 24 } });
    const txt = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie }, payload: { type: "TXT", uploadIntentId: signedTxt.json().upload.intentId } });
    const txtDelete = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/${txt.json().evidence.id}`, headers: { cookie: owner.cookie } });
    expect(txtDelete.statusCode).toBe(200);
    expect(txtDelete.json()).toMatchObject({ deletedEvidenceId: txt.json().evidence.id, deletedJobIds: expect.arrayContaining([txt.json().jobId]), personaJobId: null });

    const missingDelete = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/00000000-0000-4000-8000-000000000099`, headers: { cookie: owner.cookie } });
    expect(missingDelete.statusCode).toBe(404);
  });

  it("automatically rebuilds an existing persona after evidence deletion", async () => {
    const owner = await createOwner();
    const text = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie }, payload: { type: "TEXT", rawText: "진행 상황을 먼저 공유해 주세요." } });
    expect((await waitForJob(owner.cookie, text.json().jobId)).status).toBe("SUCCEEDED");
    const initialRebuild = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/rebuild`, headers: { cookie: owner.cookie } });
    expect((await waitForJob(owner.cookie, initialRebuild.json().jobId)).status).toBe("SUCCEEDED");

    const deleted = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/${text.json().evidence.id}`, headers: { cookie: owner.cookie } });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().personaJobId).toEqual(expect.any(String));
    expect((await waitForJob(owner.cookie, deleted.json().personaJobId)).status).toBe("SUCCEEDED");
    const list = await app.inject({ method: "GET", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie } });
    expect(list.json().evidence).toEqual([]);
  });

  it("keeps deletion and reports a rebuild scheduling failure for manual retry", async () => {
    const owner = await createOwner();
    const text = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie }, payload: { type: "TEXT", rawText: "수정본을 오늘 다시 주세요." } });
    expect((await waitForJob(owner.cookie, text.json().jobId)).status).toBe("SUCCEEDED");
    const initialRebuild = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/rebuild`, headers: { cookie: owner.cookie } });
    expect((await waitForJob(owner.cookie, initialRebuild.json().jobId)).status).toBe("SUCCEEDED");

    vi.spyOn(jobs, "enqueue").mockRejectedValueOnce(new Error("queue unavailable"));
    const deleted = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/${text.json().evidence.id}`, headers: { cookie: owner.cookie } });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({
      deletedEvidenceId: text.json().evidence.id,
      personaJobId: null,
      personaRebuildError: expect.stringContaining("수동으로 다시 분석"),
    });
    const list = await app.inject({ method: "GET", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie } });
    expect(list.json().evidence).toEqual([]);

    const manualRetry = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/rebuild`, headers: { cookie: owner.cookie } });
    expect(manualRetry.statusCode).toBe(202);
    expect((await waitForJob(owner.cookie, manualRetry.json().jobId)).status).toBe("SUCCEEDED");
  });
});
