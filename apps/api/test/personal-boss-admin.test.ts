import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { env } from "../src/config/env";
import { store } from "../src/repositories";

const app = buildApp();
const origin = "http://localhost:5173";
let adminCookie = "";

const bossInput = (alias: string) => ({ alias, avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "팀장", companyName: "테스트 회사", ageBand: 40, hierarchyScore: 70 });
const profileInput = (handle: string) => ({ handle, ageBand: 30, yearsOfServiceBand: "3~4년", jobFunction: "개발", rank: "대리", entryPath: "신입", weaknesses: ["보고가 김"] });

async function createOwner(handle: string) {
  const session = await app.inject({ method: "POST", url: "/api/session" });
  const sessionId = session.json().session.id as string;
  const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
  await app.inject({ method: "PUT", url: "/api/profile", headers: { cookie }, payload: profileInput(handle) });
  return { sessionId, cookie };
}

beforeAll(async () => {
  env.ADMIN_PASSWORD = "correct-horse-battery-staple";
  env.ADMIN_SESSION_SECRET = "admin-session-secret-that-is-long-enough";
  const login = await app.inject({ method: "POST", url: "/api/admin/login", headers: { origin, "x-forwarded-for": "10.0.2.10" }, payload: { password: env.ADMIN_PASSWORD } });
  adminCookie = String(login.headers["set-cookie"]).split(";")[0]!;
});

afterAll(() => app.close());

describe("personal boss prompt administration", () => {
  it("requires admin authentication and paginates only active personal bosses", async () => {
    expect((await app.inject({ method: "GET", url: "/api/admin/personal-bosses?page=1" })).statusCode).toBe(401);
    const owner = await createOwner("목록테스트사용자");
    const expiry = new Date(Date.now() + 86_400_000).toISOString();
    try {
      for (let index = 0; index < 21; index += 1) await store.createBoss(owner.sessionId, bossInput(`상사 ${String(index).padStart(2, "0")}`), expiry);
      await store.createBoss(owner.sessionId, bossInput("만료 상사"), new Date(Date.now() - 1_000).toISOString());
      const first = await app.inject({ method: "GET", url: "/api/admin/personal-bosses?page=1", headers: { cookie: adminCookie } });
      const second = await app.inject({ method: "GET", url: "/api/admin/personal-bosses?page=2", headers: { cookie: adminCookie } });
      expect(first.statusCode).toBe(200);
      expect(first.headers["cache-control"]).toBe("no-store");
      expect(first.json()).toMatchObject({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
      expect(first.json().items).toHaveLength(20);
      expect(second.json().items).toHaveLength(1);
      expect([...first.json().items, ...second.json().items].every((item: any) => item.ownerHandle === "목록테스트사용자" && item.alias !== "만료 상사")).toBe(true);
      expect([...first.json().items, ...second.json().items].some((item: any) => item.id === "00000000-0000-4000-8000-000000000001")).toBe(false);
    } finally {
      await store.deleteSession(owner.sessionId);
    }
  });

  it("reconstructs current persona and the latest real chat prompt, then audits without raw text", async () => {
    const owner = await createOwner("원문테스트사용자");
    const expiry = new Date(Date.now() + 86_400_000).toISOString();
    const boss = await store.createBoss(owner.sessionId, bossInput("원문 상사"), expiry);
    const previousDefaults = await store.getPersonalBossDefaults();
    const previousPrompts = await store.getAiPromptSettings();
    await store.updatePersonalBossDefaults("개인 상사 원문 테스트 기본 성향");
    await store.updateAiPromptSettings({ translation: previousPrompts.translation, translationReplyStyles: previousPrompts.translationReplyStyles, onboarding: { ...previousPrompts.onboarding, personaGeneration: "원문 테스트 페르소나 생성 지침" } });
    const evidence = await store.createEvidence({ bossId: boss.id, sessionId: owner.sessionId, type: "TEXT", status: "READY", rawText: "결론을 먼저 물어보는 실제 관찰", storagePath: null, parsedData: { observations: [] }, observedAt: new Date().toISOString(), expiresAt: expiry });
    await store.upsertSurveyAnswers(owner.sessionId, boss.id, [{ questionId: "q1", questionSnapshot: { situation: "일정 보고" }, selectedOption: "마감부터 확인", freeText: null }]);
    const thread = await store.getOrCreateThread(owner.sessionId, boss.id, undefined, expiry);
    for (let index = 0; index < 20; index += 1) await store.addChatMessage(thread.id, index % 2 ? "assistant" : "user", `이전 메시지 ${String(index).padStart(2, "0")}`);
    await store.addChatMessage(thread.id, "user", "최신 실제 사용자 질문");
    await store.addChatMessage(thread.id, "assistant", "프롬프트 입력에서 제외될 최신 답변");

    try {
      const response = await app.inject({ method: "GET", url: `/api/admin/personal-bosses/${boss.id}/prompt-preview`, headers: { cookie: adminCookie } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      const body = response.json();
      expect(body).toMatchObject({ reconstructionMode: "CURRENT_STATE", profile: { handle: "원문테스트사용자" }, boss: { id: boss.id, alias: "원문 상사" }, chat: { status: "AVAILABLE", historyMessageCount: 19, includedMessageCount: 20, totalMessageCount: 22 } });
      expect(body.personaGeneration.messages[0].content).toContain("개인 상사 원문 테스트 기본 성향");
      expect(body.personaGeneration.messages[1].content).toContain("원문 테스트 페르소나 생성 지침");
      expect(body.personaGeneration.messages[1].content).toContain("결론을 먼저 물어보는 실제 관찰");
      expect(body.personaGeneration.messages[1].content).toContain("마감부터 확인");
      expect(body.chat.messages[1].content).toContain("최신 실제 사용자 질문");
      expect(body.chat.messages[1].content).toContain("이전 메시지 01");
      expect(body.chat.messages[1].content).not.toContain("이전 메시지 00");
      expect(body.chat.messages[1].content).not.toContain("프롬프트 입력에서 제외될 최신 답변");

      const dashboard = await store.getAdminDashboard();
      const audit = dashboard.recentOperations.find((item) => item.type === "PERSONAL_BOSS_PROMPT_VIEW");
      expect(audit?.detail).toMatchObject({ personaVersion: 0, chatMessageCount: 22, hasChatPrompt: true });
      expect(JSON.stringify(audit)).not.toContain("원문테스트사용자");
      expect(JSON.stringify(audit)).not.toContain("최신 실제 사용자 질문");

      const originalRecordAdminOperation = store.recordAdminOperation.bind(store);
      const legacyAudit = vi.spyOn(store, "recordAdminOperation");
      legacyAudit.mockRejectedValueOnce(Object.assign(new Error("legacy operation constraint"), { code: "23514", constraint_name: "admin_operations_type_check" }));
      legacyAudit.mockImplementation(originalRecordAdminOperation);
      const compatible = await app.inject({ method: "GET", url: `/api/admin/personal-bosses/${boss.id}/prompt-preview`, headers: { cookie: adminCookie } });
      expect(compatible.statusCode).toBe(200);
      const compatibilityRecord = (await store.getAdminDashboard()).recentOperations.find((item) => item.detail.action === "PERSONAL_BOSS_PROMPT_VIEW");
      expect(compatibilityRecord).toMatchObject({ type: "PERSONAL_BOSS_DEFAULTS_UPDATE", status: "SUCCEEDED", detail: { compatibilityAudit: true } });
      expect(JSON.stringify(compatibilityRecord)).not.toContain("최신 실제 사용자 질문");
      legacyAudit.mockRestore();

      const auditFailure = vi.spyOn(store, "recordAdminOperation").mockRejectedValueOnce(new Error("audit unavailable"));
      const blocked = await app.inject({ method: "GET", url: `/api/admin/personal-bosses/${boss.id}/prompt-preview`, headers: { cookie: adminCookie } });
      expect(blocked.statusCode).toBe(500);
      expect(blocked.body).not.toContain("최신 실제 사용자 질문");
      auditFailure.mockRestore();
    } finally {
      await store.updatePersonalBossDefaults(previousDefaults.prompt);
      await store.updateAiPromptSettings({ translation: previousPrompts.translation, translationReplyStyles: previousPrompts.translationReplyStyles, onboarding: previousPrompts.onboarding });
      await store.updateEvidence(owner.sessionId, evidence.id, { rawText: null });
      await store.deleteSession(owner.sessionId);
    }
  });

  it("returns NO_CHAT_HISTORY without creating an empty thread", async () => {
    const owner = await createOwner("빈대화사용자");
    const boss = await store.createBoss(owner.sessionId, bossInput("빈 대화 상사"), new Date(Date.now() + 86_400_000).toISOString());
    try {
      expect((await store.listChatMessages(owner.sessionId, boss.id)).threadId).toBeNull();
      const response = await app.inject({ method: "GET", url: `/api/admin/personal-bosses/${boss.id}/prompt-preview`, headers: { cookie: adminCookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json().chat).toMatchObject({ status: "NO_CHAT_HISTORY", totalMessageCount: 0 });
      expect((await store.listChatMessages(owner.sessionId, boss.id)).threadId).toBeNull();
    } finally {
      await store.deleteSession(owner.sessionId);
    }
  });
});
