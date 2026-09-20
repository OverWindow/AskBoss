import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { ai } from "../src/services/ai";
import { store } from "../src/repositories";

const app = buildApp();
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

async function waitForSessionJob(cookie: string, id: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await app.inject({ method: "GET", url: `/api/jobs/${id}`, headers: { cookie } });
    const job = response.json().job as { status: string; errorMessage: string | null };
    if (job.status === "SUCCEEDED" || job.status === "FAILED") return job;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Job ${id} did not finish`);
}

describe("editable onboarding prompt routing", () => {
  it("uses the latest four onboarding instructions throughout personal boss onboarding", async () => {
    const before = await store.getAiPromptSettings();
    const instructions = {
      companyResearch: "회사 조사 라우팅 테스트",
      evidenceExtraction: "자료 추출 라우팅 테스트",
      surveyGeneration: "질문 생성 라우팅 테스트",
      personaGeneration: "페르소나 생성 라우팅 테스트",
    };
    await store.updateAiPromptSettings({ translation: before.translation, translationReplyStyles: before.translationReplyStyles, coaching: before.coaching, onboarding: instructions });
    await store.clearCompanyResearchCache();

    const originalResearch = ai.researchCompany.bind(ai);
    const originalSurvey = ai.generateSurvey.bind(ai);
    const originalExtract = ai.extractEvidence.bind(ai);
    const originalBuild = ai.buildPersona.bind(ai);
    const research = vi.spyOn(ai as any, "researchCompany").mockImplementation((...args: unknown[]) => originalResearch(args[0] as string, args[1] as string | undefined));
    const survey = vi.spyOn(ai as any, "generateSurvey").mockImplementation((...args: unknown[]) => originalSurvey(args[0] as any, args[1] as string | undefined));
    const extract = vi.spyOn(ai, "extractEvidence").mockImplementation((input) => originalExtract(input));
    const build = vi.spyOn(ai, "buildPersona").mockImplementation((input) => originalBuild(input));

    try {
      const session = await app.inject({ method: "POST", url: "/api/session" });
      const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
      const company = await app.inject({ method: "POST", url: "/api/company/research", headers: { cookie }, payload: { companyName: "프롬프트 라우팅 테스트 회사" } });
      expect(company.statusCode).toBe(200);
      expect(research).toHaveBeenCalledWith("프롬프트 라우팅 테스트 회사", instructions.companyResearch);

      const created = await app.inject({ method: "POST", url: "/api/bosses", headers: { cookie }, payload: { alias: "라우팅 상사", avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "팀장", companyName: "프롬프트 라우팅 테스트 회사", ageBand: 40, hierarchyScore: 70 } });
      const bossId = created.json().boss.id as string;
      const generated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/survey/generate`, headers: { cookie } });
      expect(generated.statusCode).toBe(200);
      expect(survey).toHaveBeenCalledWith(expect.objectContaining({ id: bossId }), instructions.surveyGeneration);

      const evidence = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/evidence`, headers: { cookie }, payload: { type: "TEXT", rawText: "결론과 마감 시간을 먼저 묻습니다." } });
      expect(evidence.statusCode).toBe(202);
      expect((await waitForSessionJob(cookie, evidence.json().jobId)).status).toBe("SUCCEEDED");
      expect(extract).toHaveBeenCalledWith(expect.objectContaining({ promptInstruction: instructions.evidenceExtraction }));

      const rebuild = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/persona/rebuild`, headers: { cookie } });
      expect(rebuild.statusCode).toBe(202);
      expect((await waitForSessionJob(cookie, rebuild.json().jobId)).status).toBe("SUCCEEDED");
      expect(build).toHaveBeenCalledWith(expect.objectContaining({ boss: expect.objectContaining({ id: bossId }), promptInstruction: instructions.personaGeneration }));
    } finally {
      await store.updateAiPromptSettings({ translation: before.translation, translationReplyStyles: before.translationReplyStyles, coaching: before.coaching, onboarding: before.onboarding });
    }
  });
});
