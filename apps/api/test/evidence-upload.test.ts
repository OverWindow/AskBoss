import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { ai } from "../src/services/ai";
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
    expect((await waitForJob(cookie, pasted.json().jobId)).status).toBe("SUCCEEDED");

    for (const file of [{ fileName: "conversation.txt", contentType: "text/plain", size: 120, type: "TXT" }, { fileName: "capture.png", contentType: "image/png", size: 2048, type: "IMAGE" }]) {
      const signed = await app.inject({ method: "POST", url: "/api/uploads/sign", headers: { cookie }, payload: { bossId, fileName: file.fileName, contentType: file.contentType, size: file.size } });
      expect(signed.statusCode).toBe(200);
      const evidence = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/evidence`, headers: { cookie }, payload: { type: file.type, uploadIntentId: signed.json().upload.intentId } });
      expect(evidence.statusCode).toBe(202);
      expect(JSON.stringify(evidence.json())).not.toContain("storage.example");
      expect((await waitForJob(cookie, evidence.json().jobId)).status).toBe("SUCCEEDED");
      const replay = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/evidence`, headers: { cookie }, payload: { type: file.type, uploadIntentId: signed.json().upload.intentId } });
      expect(replay.statusCode).toBe(400);
    }

    expect(extraction).toHaveBeenCalledWith(expect.objectContaining({ kind: "TEXT", content: "일정은 미리 보고해요." }));
    expect(extraction).toHaveBeenCalledWith(expect.objectContaining({ kind: "TXT", content: "팀장님: 결론부터 공유해요." }));
    expect(extraction).toHaveBeenCalledWith(expect.objectContaining({ kind: "IMAGE", content: "이미지 URL: https://storage.example/signed-image" }));
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

    const target = registered.find((response) => response.statusCode === 202)!.json();
    const deleted = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/${target.evidence.id}`, headers: { cookie: owner.cookie } });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ deletedEvidenceId: target.evidence.id, deletedJobIds: expect.arrayContaining([target.jobId]) });
    expect(remove).toHaveBeenCalledWith([target.evidence.storagePath]);

    const replacementSign = await app.inject({ method: "POST", url: "/api/uploads/sign", headers: { cookie: owner.cookie }, payload: { bossId: owner.bossId, fileName: "replacement.png", contentType: "image/png", size: 300 } });
    expect(replacementSign.statusCode).toBe(200);
    const replacement = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie }, payload: { type: "IMAGE", uploadIntentId: replacementSign.json().upload.intentId } });
    expect(replacement.statusCode).toBe(202);
  });

  it("rejects foreign, non-image, and missing personal evidence deletion", async () => {
    const owner = await createOwner();
    const foreign = await createOwner();
    const text = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/evidence`, headers: { cookie: owner.cookie }, payload: { type: "TEXT", rawText: "삭제할 수 없는 텍스트" } });
    const foreignDelete = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/${text.json().evidence.id}`, headers: { cookie: foreign.cookie } });
    expect(foreignDelete.statusCode).toBe(404);
    const textDelete = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/${text.json().evidence.id}`, headers: { cookie: owner.cookie } });
    expect(textDelete.statusCode).toBe(400);
    expect(textDelete.json().error.code).toBe("IMAGE_EVIDENCE_REQUIRED");
    const missingDelete = await app.inject({ method: "DELETE", url: `/api/bosses/${owner.bossId}/evidence/00000000-0000-4000-8000-000000000099`, headers: { cookie: owner.cookie } });
    expect(missingDelete.statusCode).toBe(404);
  });
});
