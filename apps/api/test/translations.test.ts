import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { ai } from "../src/services/ai/index.js";
import { store } from "../src/repositories/index.js";
import { DEFAULT_PERSONAL_BOSS_BASE_PROMPT } from "@askboss/shared";

const app = buildApp();
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

describe("translation API", () => {
  it("translates with the global boss through the deeply nested route", async () => {
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;

    const response = await app.inject({
      method: "POST",
      url: "/api/bosses/00000000-0000-4000-8000-000000000001/translate",
      headers: { cookie },
      payload: { inputText: "진행 상황 알려주세요.", channel: "사내 메신저" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      translationId: expect.any(String),
      result: { plainMeaning: expect.any(String), replies: expect.any(Array) },
    });
  });

  it("injects the administrator default only for personal bosses", async () => {
    const seen: any[] = [];
    const translate = ai.translateBossMessage.bind(ai) as (...args: any[]) => Promise<any>;
    vi.spyOn(ai as any, "translateBossMessage").mockImplementation(async (...args: any[]) => { seen.push(args[0]); return translate(...args); });
    await store.updatePersonalBossDefaults("결론과 마감을 먼저 확인하는 테스트 기본 성격");
    try {
      const session = await app.inject({ method: "POST", url: "/api/session" });
      const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
      const personal = await app.inject({
        method: "POST",
        url: "/api/bosses",
        headers: { cookie },
        payload: { alias: "테스트 상사", avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "팀장", companyName: "테스트 회사", ageBand: 40, hierarchyScore: 70, genderBalanceScore: 0 },
      });

      await app.inject({ method: "POST", url: "/api/bosses/00000000-0000-4000-8000-000000000001/translate", headers: { cookie }, payload: { inputText: "확인했나?", channel: "사내 메신저" } });
      await app.inject({ method: "POST", url: `/api/bosses/${personal.json().boss.id}/translate`, headers: { cookie }, payload: { inputText: "확인했나?", channel: "사내 메신저" } });

      expect(seen[0].basePrompt).toBeUndefined();
      expect(seen[1].basePrompt).toBe("결론과 마감을 먼저 확인하는 테스트 기본 성격");
    } finally {
      await store.updatePersonalBossDefaults(DEFAULT_PERSONAL_BOSS_BASE_PROMPT);
    }
  });
});
