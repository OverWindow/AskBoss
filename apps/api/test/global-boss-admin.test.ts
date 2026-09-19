import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { env } from "../src/config/env";
import { store } from "../src/repositories";
import { ai } from "../src/services/ai";

const app = buildApp();
const origin = "http://localhost:5173";
const globalBossId = "00000000-0000-4000-8000-000000000001";
let cookie = "";

async function waitForJob(id: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await app.inject({ method: "GET", url: `/api/admin/jobs/${id}`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const job = response.json().job as { status: string; errorMessage: string | null };
    if (job.status === "SUCCEEDED" || job.status === "FAILED") return job;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Job ${id} did not finish`);
}

beforeAll(async () => {
  env.ADMIN_PASSWORD = "correct-horse-battery-staple";
  env.ADMIN_SESSION_SECRET = "admin-session-secret-that-is-long-enough";
  const login = await app.inject({
    method: "POST",
    url: "/api/admin/login",
    headers: { origin, "x-forwarded-for": "10.0.1.10" },
    payload: { password: env.ADMIN_PASSWORD },
  });
  cookie = String(login.headers["set-cookie"]).split(";")[0]!;
});

afterAll(() => app.close());

describe("global boss administration", () => {
  it("rejects ordinary sessions and cross-origin mutations", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/admin/global-boss" });
    expect(anonymous.statusCode).toBe(401);

    const crossOrigin = await app.inject({
      method: "PATCH",
      url: "/api/admin/global-boss",
      headers: { cookie, origin: "https://attacker.example" },
      payload: { alias: "변조된 상사" },
    });
    expect(crossOrigin.statusCode).toBe(403);
    expect(crossOrigin.json().error.code).toBe("INVALID_ORIGIN");
  });

  it("updates global metadata without rebuilding the current persona", async () => {
    const before = structuredClone(await store.getGlobalBoss());
    const persona = structuredClone(before.persona);
    const version = before.personaVersion;
    try {
      const updated = await app.inject({
        method: "PATCH",
        url: "/api/admin/global-boss",
        headers: { cookie, origin },
        payload: { alias: "테스트 모두의 상사", hierarchyScore: 64 },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().boss).toMatchObject({ alias: "테스트 모두의 상사", hierarchyScore: 64 });
      expect(updated.json().boss.persona).toEqual(persona);
      expect(updated.json().boss.personaVersion).toBe(version);
    } finally {
      await store.updateGlobalBoss({ alias: before.alias, hierarchyScore: before.hierarchyScore });
    }
  });

  it("processes pasted text, TXT, and image evidence and removes their records", async () => {
    const createdIds: string[] = [];
    try {
      const text = await app.inject({
        method: "POST",
        url: "/api/admin/global-boss/evidence",
        headers: { cookie, origin },
        payload: { type: "TEXT", rawText: "팀장님은 카톡에서 결론과 마감 시간을 먼저 물어본다." },
      });
      expect(text.statusCode).toBe(202);
      createdIds.push(text.json().evidence.id);
      expect((await waitForJob(text.json().jobId)).status).toBe("SUCCEEDED");

      for (const file of [
        { fileName: "conversation.txt", contentType: "text/plain", size: 128, evidenceType: "TXT" },
        { fileName: "capture.png", contentType: "image/png", size: 2048, evidenceType: "IMAGE" },
      ]) {
        const signed = await app.inject({
          method: "POST",
          url: "/api/admin/global-boss/uploads/sign",
          headers: { cookie, origin },
          payload: { fileName: file.fileName, contentType: file.contentType, size: file.size },
        });
        expect(signed.statusCode).toBe(200);
        expect(signed.json().upload.path).toMatch(new RegExp(`^global/${globalBossId}/`));
        const evidence = await app.inject({
          method: "POST",
          url: "/api/admin/global-boss/evidence",
          headers: { cookie, origin },
          payload: { type: file.evidenceType, uploadIntentId: signed.json().upload.intentId },
        });
        expect(evidence.statusCode).toBe(202);
        createdIds.push(evidence.json().evidence.id);
        expect((await waitForJob(evidence.json().jobId)).status).toBe("SUCCEEDED");
      }

      const detail = await app.inject({ method: "GET", url: "/api/admin/global-boss", headers: { cookie } });
      expect(detail.statusCode).toBe(200);
      const created = detail.json().evidence.filter((item: { id: string }) => createdIds.includes(item.id));
      expect(created).toHaveLength(3);
      expect(created.every((item: { status: string }) => item.status === "READY")).toBe(true);
      expect(JSON.stringify(created)).not.toContain("storagePath");
    } finally {
      for (const id of createdIds) {
        const deleted = await app.inject({ method: "DELETE", url: `/api/admin/global-boss/evidence/${id}`, headers: { cookie, origin } });
        expect(deleted.statusCode).toBe(204);
      }
    }
  });

  it("generates and saves survey answers as global evidence", async () => {
    const generated = await app.inject({ method: "POST", url: "/api/admin/global-boss/survey/generate", headers: { cookie, origin } });
    expect(generated.statusCode).toBe(200);
    const question = generated.json().questions[0];
    const saved = await app.inject({
      method: "PUT",
      url: "/api/admin/global-boss/survey/answers",
      headers: { cookie, origin },
      payload: { answers: [{ questionId: question.id, questionSnapshot: question, selectedOption: question.options[0].id, freeText: null }] },
    });
    expect(saved.statusCode).toBe(200);
    const detail = await app.inject({ method: "GET", url: "/api/admin/global-boss", headers: { cookie } });
    expect(detail.json().surveyAnswers).toEqual(expect.arrayContaining([expect.objectContaining({ questionId: question.id })]));
    expect(detail.json().evidence).toEqual(expect.arrayContaining([expect.objectContaining({ type: "SURVEY", status: "READY" })]));
  });

  it("blocks rebuild while evidence is processing", async () => {
    const evidence = await store.createGlobalEvidence({
      bossId: globalBossId,
      type: "TEXT",
      status: "PENDING",
      sourceName: "처리 중 테스트",
      rawText: "아직 처리 중",
      storagePath: null,
      parsedData: null,
      observedAt: null,
      errorMessage: null,
    });
    try {
      const response = await app.inject({ method: "POST", url: "/api/admin/global-boss/persona/rebuild", headers: { cookie, origin } });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("EVIDENCE_PROCESSING");
    } finally {
      await store.deleteGlobalEvidence(evidence.id);
    }
  });

  it("publishes persona and PKI together only after a successful rebuild", async () => {
    const before = structuredClone(await store.getGlobalBoss());
    const response = await app.inject({ method: "POST", url: "/api/admin/global-boss/persona/rebuild", headers: { cookie, origin } });
    expect(response.statusCode).toBe(202);
    expect((await waitForJob(response.json().jobId)).status).toBe("SUCCEEDED");
    const after = await store.getGlobalBoss();
    expect(after.personaVersion).toBe((before.personaVersion ?? 0) + 1);
    expect(after.persona).not.toBeNull();
    expect(after.pki).not.toBeNull();
  });

  it("keeps the live persona unchanged and reports a terminal job error on rebuild failure", async () => {
    const before = structuredClone(await store.getGlobalBoss());
    const build = vi.spyOn(ai, "buildPersona").mockRejectedValueOnce(new Error("model unavailable"));
    try {
      const response = await app.inject({ method: "POST", url: "/api/admin/global-boss/persona/rebuild", headers: { cookie, origin } });
      expect(response.statusCode).toBe(202);
      const job = await waitForJob(response.json().jobId);
      expect(job.status).toBe("FAILED");
      const after = await store.getGlobalBoss();
      expect(after.personaVersion).toBe(before.personaVersion);
      expect(after.persona).toEqual(before.persona);
      expect(after.pki).toEqual(before.pki);
    } finally {
      build.mockRestore();
    }
  });
});
