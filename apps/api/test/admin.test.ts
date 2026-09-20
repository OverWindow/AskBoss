import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { env } from "../src/config/env";
import { store } from "../src/repositories";
import { DEFAULT_AI_PROMPT_INSTRUCTIONS, DEFAULT_PERSONAL_BOSS_BASE_PROMPT, DEFAULT_TRANSLATION_EXAMPLES } from "@askboss/shared";

const app = buildApp();
const origin = "http://localhost:5173";

beforeAll(() => {
  env.ADMIN_PASSWORD = "correct-horse-battery-staple";
  env.ADMIN_SESSION_SECRET = "admin-session-secret-that-is-long-enough";
});

afterAll(() => app.close());

describe("admin API", () => {
  it("requires an allowed origin for login", async () => {
    const response = await app.inject({ method: "POST", url: "/api/admin/login", payload: { password: env.ADMIN_PASSWORD } });
    expect(response.statusCode).toBe(403);
  });

  it("allows a same-origin admin login on a production deployment", async () => {
    const previousNodeEnv = env.NODE_ENV;
    const previousWebOrigin = env.WEB_ORIGIN;
    env.NODE_ENV = "production";
    env.WEB_ORIGIN = "http://localhost:5173";
    try {
      const allowed = await app.inject({
        method: "POST",
        url: "/api/admin/login",
        headers: {
          origin: "https://ask-boss-mauve.vercel.app",
          host: "ask-boss-mauve.vercel.app",
          "x-forwarded-proto": "https",
          "x-forwarded-for": "10.0.0.11",
        },
        payload: { password: env.ADMIN_PASSWORD },
      });
      expect(allowed.statusCode).toBe(200);

      const rejected = await app.inject({
        method: "POST",
        url: "/api/admin/login",
        headers: {
          origin: "https://attacker.example",
          host: "ask-boss-mauve.vercel.app",
          "x-forwarded-proto": "https",
          "x-forwarded-for": "10.0.0.12",
        },
        payload: { password: env.ADMIN_PASSWORD },
      });
      expect(rejected.statusCode).toBe(403);
      expect(rejected.json().error.code).toBe("INVALID_ORIGIN");
    } finally {
      env.NODE_ENV = previousNodeEnv;
      env.WEB_ORIGIN = previousWebOrigin;
    }
  });

  it("creates and revokes an HttpOnly admin session", async () => {
    const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin, "x-forwarded-for": "10.0.0.10" }, payload: { password: env.ADMIN_PASSWORD } });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
    expect(login.headers["set-cookie"]).toContain("SameSite=Strict");
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;

    const dashboard = await app.inject({ method: "GET", url: "/api/admin/dashboard", headers: { cookie } });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(dashboard.json())).not.toContain(env.ADMIN_PASSWORD);

    const logout = await app.inject({ method: "POST", url: "/api/admin/logout", headers: { origin, cookie } });
    expect(logout.statusCode).toBe(200);
    const afterLogout = await app.inject({ method: "GET", url: "/api/admin/dashboard", headers: { cookie } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("locks a source after five failed passwords", async () => {
    let response;
    for (let index = 0; index < 5; index++) {
      response = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin, "x-forwarded-for": "10.0.0.20" }, payload: { password: "wrong-password" } });
    }
    expect(response?.statusCode).toBe(429);
  });

  it("retries failed jobs and audits maintenance operations", async () => {
    const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin, "x-forwarded-for": "10.0.0.30" }, payload: { password: env.ADMIN_PASSWORD } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const original = await store.createJob({ sessionId: null, bossId: null, type: "CHAT_SUMMARIZE", payload: {} });
    await store.failJob(original.id, "request timeout containing confidential evidence", false);

    const listed = await app.inject({ method: "GET", url: "/api/admin/jobs?status=FAILED", headers: { cookie } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items[0].errorMessage).toBe("AI 응답 시간 초과");
    expect(JSON.stringify(listed.json())).not.toContain("confidential");

    const retried = await app.inject({ method: "POST", url: `/api/admin/jobs/${original.id}/retry`, headers: { origin, cookie } });
    expect(retried.statusCode).toBe(202);
    const cleanup = await app.inject({ method: "POST", url: "/api/admin/maintenance/cleanup", headers: { origin, cookie } });
    const rollup = await app.inject({ method: "POST", url: "/api/admin/maintenance/rollup", headers: { origin, cookie } });
    expect(cleanup.statusCode).toBe(200);
    expect(rollup.statusCode).toBe(200);

    const dashboard = await app.inject({ method: "GET", url: "/api/admin/dashboard", headers: { cookie } });
    expect(dashboard.json().recentOperations.map((item: any) => item.type)).toEqual(expect.arrayContaining(["JOB_RETRY", "CLEANUP", "ANALYTICS_ROLLUP"]));
  });

  it("reads and updates the personal boss default without exposing its text in audit logs", async () => {
    const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin, "x-forwarded-for": "10.0.0.40" }, payload: { password: env.ADMIN_PASSWORD } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const initial = await app.inject({ method: "GET", url: "/api/admin/personal-boss-defaults", headers: { cookie } });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().prompt).toBe(DEFAULT_PERSONAL_BOSS_BASE_PROMPT);

    const prompt = "테스트용 비공개 기본 성격 문구";
    const updated = await app.inject({ method: "PUT", url: "/api/admin/personal-boss-defaults", headers: { cookie, origin }, payload: { prompt } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ prompt, updatedAt: expect.any(String) });

    const dashboard = await app.inject({ method: "GET", url: "/api/admin/dashboard", headers: { cookie } });
    const operation = dashboard.json().recentOperations.find((item: any) => item.type === "PERSONAL_BOSS_DEFAULTS_UPDATE");
    expect(operation.detail).toEqual({ enabled: true, promptLength: prompt.length });
    expect(JSON.stringify(operation)).not.toContain(prompt);
    await store.updatePersonalBossDefaults(DEFAULT_PERSONAL_BOSS_BASE_PROMPT);
  });

  it("reads, validates, updates, and disables the global boss default without auditing its text", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/admin/global-boss-defaults" });
    expect(anonymous.statusCode).toBe(401);

    const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin, "x-forwarded-for": "10.0.0.41" }, payload: { password: env.ADMIN_PASSWORD } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const initial = await app.inject({ method: "GET", url: "/api/admin/global-boss-defaults", headers: { cookie } });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({ prompt: "", updatedAt: null });

    const crossOrigin = await app.inject({ method: "PUT", url: "/api/admin/global-boss-defaults", headers: { cookie, origin: "https://attacker.example" }, payload: { prompt: "변조" } });
    expect(crossOrigin.statusCode).toBe(403);
    const tooLong = await app.inject({ method: "PUT", url: "/api/admin/global-boss-defaults", headers: { cookie, origin }, payload: { prompt: "가".repeat(5_001) } });
    expect(tooLong.statusCode).toBe(400);

    const prompt = "모두의 상사에만 적용할 비공개 성격 문구";
    const updated = await app.inject({ method: "PUT", url: "/api/admin/global-boss-defaults", headers: { cookie, origin }, payload: { prompt } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ prompt, updatedAt: expect.any(String) });

    const dashboard = await app.inject({ method: "GET", url: "/api/admin/dashboard", headers: { cookie } });
    const operation = dashboard.json().recentOperations.find((item: any) => item.type === "GLOBAL_BOSS_DEFAULTS_UPDATE" && item.detail.promptLength === prompt.length);
    expect(operation.detail).toEqual({ enabled: true, promptLength: prompt.length });
    expect(JSON.stringify(operation)).not.toContain(prompt);

    const disabled = await app.inject({ method: "PUT", url: "/api/admin/global-boss-defaults", headers: { cookie, origin }, payload: { prompt: "" } });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({ prompt: "", updatedAt: expect.any(String) });
  });

  it("validates and publishes exactly three shared translation examples without auditing their text", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/admin/translation-examples" });
    expect(anonymous.statusCode).toBe(401);
    const publicAnonymous = await app.inject({ method: "GET", url: "/api/translation-examples" });
    expect(publicAnonymous.statusCode).toBe(401);

    const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin, "x-forwarded-for": "10.0.0.42" }, payload: { password: env.ADMIN_PASSWORD } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const before = await store.getTranslationExamples();
    const examples = ["일정이 어떻게 되나요?", "제가 확인해 보겠습니다.", "핵심만 다시 정리해 주세요."] as [string, string, string];
    try {
      const crossOrigin = await app.inject({ method: "PUT", url: "/api/admin/translation-examples", headers: { cookie, origin: "https://attacker.example" }, payload: { examples } });
      expect(crossOrigin.statusCode).toBe(403);
      const tooFew = await app.inject({ method: "PUT", url: "/api/admin/translation-examples", headers: { cookie, origin }, payload: { examples: examples.slice(0, 2) } });
      expect(tooFew.statusCode).toBe(400);
      const blank = await app.inject({ method: "PUT", url: "/api/admin/translation-examples", headers: { cookie, origin }, payload: { examples: [examples[0], " ", examples[2]] } });
      expect(blank.statusCode).toBe(400);
      const tooLong = await app.inject({ method: "PUT", url: "/api/admin/translation-examples", headers: { cookie, origin }, payload: { examples: ["가".repeat(201), examples[1], examples[2]] } });
      expect(tooLong.statusCode).toBe(400);

      const updated = await app.inject({ method: "PUT", url: "/api/admin/translation-examples", headers: { cookie, origin }, payload: { examples } });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ examples, updatedAt: expect.any(String) });

      const session = await app.inject({ method: "POST", url: "/api/session" });
      const sessionCookie = String(session.headers["set-cookie"]).split(";")[0]!;
      const published = await app.inject({ method: "GET", url: "/api/translation-examples", headers: { cookie: sessionCookie } });
      expect(published.statusCode).toBe(200);
      expect(published.json()).toEqual({ examples });

      const dashboard = await app.inject({ method: "GET", url: "/api/admin/dashboard", headers: { cookie } });
      const operation = dashboard.json().recentOperations.find((item: any) => item.type === "TRANSLATION_EXAMPLES_UPDATE");
      expect(operation.detail).toEqual({ exampleCount: 3, totalLength: examples.reduce((sum, example) => sum + example.length, 0) });
      expect(JSON.stringify(operation)).not.toContain(examples[0]);
    } finally {
      await store.updateTranslationExamples([...before.examples]);
      expect((await store.getTranslationExamples()).examples).toEqual(before.examples.length ? before.examples : [...DEFAULT_TRANSLATION_EXAMPLES]);
    }
  });

  it("validates and updates shared AI prompt instructions without auditing their text", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/admin/ai-prompt-settings" });
    expect(anonymous.statusCode).toBe(401);
    const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin, "x-forwarded-for": "10.0.0.43" }, payload: { password: env.ADMIN_PASSWORD } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const before = await store.getAiPromptSettings();
    const initial = await app.inject({ method: "GET", url: "/api/admin/ai-prompt-settings", headers: { cookie } });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject(DEFAULT_AI_PROMPT_INSTRUCTIONS);
    const settings = {
      translation: "상사의 표현과 가능한 의도를 구분해서 설명한다.",
      translationReplyStyles: ["바로 수락", "조건 조율", "정중한 거절"],
      coaching: "약속한 기한이나 담당 주체가 불명확할 때만 수정 제안을 표시한다.",
      onboarding: {
        companyResearch: "검증 가능한 공개 정보와 추정을 분리한다.",
        evidenceExtraction: "메시지의 발신자와 앞뒤 맥락을 우선 추출한다.",
        surveyGeneration: "구체적인 업무 상황을 묻는 질문을 만든다.",
        personaGeneration: "반복 관찰과 직접 대화를 가장 강한 근거로 사용한다.",
      },
    };
    try {
      const crossOrigin = await app.inject({ method: "PUT", url: "/api/admin/ai-prompt-settings", headers: { cookie, origin: "https://attacker.example" }, payload: settings });
      expect(crossOrigin.statusCode).toBe(403);
      const blank = await app.inject({ method: "PUT", url: "/api/admin/ai-prompt-settings", headers: { cookie, origin }, payload: { ...settings, translation: " " } });
      expect(blank.statusCode).toBe(400);
      const blankStyle = await app.inject({ method: "PUT", url: "/api/admin/ai-prompt-settings", headers: { cookie, origin }, payload: { ...settings, translationReplyStyles: [settings.translationReplyStyles[0], " ", settings.translationReplyStyles[2]] } });
      expect(blankStyle.statusCode).toBe(400);
      const blankCoaching = await app.inject({ method: "PUT", url: "/api/admin/ai-prompt-settings", headers: { cookie, origin }, payload: { ...settings, coaching: " " } });
      expect(blankCoaching.statusCode).toBe(400);
      const tooLong = await app.inject({ method: "PUT", url: "/api/admin/ai-prompt-settings", headers: { cookie, origin }, payload: { ...settings, onboarding: { ...settings.onboarding, personaGeneration: "가".repeat(5_001) } } });
      expect(tooLong.statusCode).toBe(400);

      const legacyClient = await app.inject({ method: "PUT", url: "/api/admin/ai-prompt-settings", headers: { cookie, origin }, payload: { translation: before.translation, translationReplyStyles: before.translationReplyStyles, onboarding: before.onboarding } });
      expect(legacyClient.statusCode).toBe(200);
      expect(legacyClient.json().coaching).toBe(DEFAULT_AI_PROMPT_INSTRUCTIONS.coaching);

      await store.saveCompanyResearch("prompt-cache-test", { companyName: "테스트", industry: null, companySizeHint: null, businessSummary: "캐시", organizationHints: [], workCultureSignals: [], confidence: 0.5, sourceSummary: [] });
      expect(await store.getCompanyResearch("prompt-cache-test")).not.toBeNull();
      const updated = await app.inject({ method: "PUT", url: "/api/admin/ai-prompt-settings", headers: { cookie, origin }, payload: settings });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ ...settings, updatedAt: expect.any(String) });
      expect(await store.getCompanyResearch("prompt-cache-test")).toBeNull();

      const dashboard = await app.inject({ method: "GET", url: "/api/admin/dashboard", headers: { cookie } });
      const operation = dashboard.json().recentOperations.find((item: any) => item.type === "AI_PROMPT_SETTINGS_UPDATE");
      expect(operation.detail.changedKeys).toContain("translation");
      expect(operation.detail.changedKeys).toContain("translationReplyStyles");
      expect(operation.detail.changedKeys).toContain("coaching");
      expect(operation.detail.changedKeys).toContain("companyResearch");
      expect(JSON.stringify(operation)).not.toContain(settings.translation);
    } finally {
      await store.updateAiPromptSettings({ translation: before.translation, translationReplyStyles: before.translationReplyStyles, coaching: before.coaching, onboarding: before.onboarding });
      expect((await store.getAiPromptSettings()).translation).toBe(before.translation);
    }
  });

  it("paginates recent sessions in fixed groups of twenty", async () => {
    for (let index = 0; index < 21; index += 1) await app.inject({ method: "POST", url: "/api/session" });
    const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin, "x-forwarded-for": "10.0.0.44" }, payload: { password: env.ADMIN_PASSWORD } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const first = await app.inject({ method: "GET", url: "/api/admin/sessions?page=1", headers: { cookie } });
    const second = await app.inject({ method: "GET", url: "/api/admin/sessions?page=2", headers: { cookie } });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ page: 1, pageSize: 20, total: expect.any(Number), totalPages: expect.any(Number) });
    expect(first.json().items).toHaveLength(20);
    expect(second.json().page).toBe(2);
    expect(first.json().totalPages).toBe(Math.ceil(first.json().total / 20));
    const firstIds = new Set(first.json().items.map((item: any) => item.id));
    expect(second.json().items.every((item: any) => !firstIds.has(item.id))).toBe(true);
    expect(first.json().items.every((item: any) => /^.{8}….{4}$/.test(item.id))).toBe(true);
  });
});
