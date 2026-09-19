import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { env } from "../src/config/env";
import { store } from "../src/repositories";
import { DEFAULT_PERSONAL_BOSS_BASE_PROMPT } from "@askboss/shared";

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
});
