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

  it("injects separate administrator defaults for global and personal bosses", async () => {
    const seen: any[] = [];
    const translate = ai.translateBossMessage.bind(ai) as (...args: any[]) => Promise<any>;
    vi.spyOn(ai as any, "translateBossMessage").mockImplementation(async (...args: any[]) => { seen.push(args[0]); return translate(...args); });
    await store.updatePersonalBossDefaults("개인 상사 전용 테스트 성격");
    await store.updateGlobalBossDefaults("모두의 상사 전용 테스트 성격");
    try {
      const session = await app.inject({ method: "POST", url: "/api/session" });
      const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
      const personal = await app.inject({
        method: "POST",
        url: "/api/bosses",
        headers: { cookie },
        payload: { alias: "테스트 상사", avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "팀장", companyName: "테스트 회사", ageBand: 40, hierarchyScore: 70 },
      });

      await app.inject({ method: "POST", url: "/api/bosses/00000000-0000-4000-8000-000000000001/translate", headers: { cookie }, payload: { inputText: "확인했나?", channel: "사내 메신저" } });
      await app.inject({ method: "POST", url: `/api/bosses/${personal.json().boss.id}/translate`, headers: { cookie }, payload: { inputText: "확인했나?", channel: "사내 메신저" } });

      expect(seen[0].basePrompt).toBe("모두의 상사 전용 테스트 성격");
      expect(seen[0].globalBoss).toBeUndefined();
      expect(seen[1].basePrompt).toBe("개인 상사 전용 테스트 성격");
      expect(seen[1].globalBoss?.scope).toBe("GLOBAL");
    } finally {
      await store.updatePersonalBossDefaults(DEFAULT_PERSONAL_BOSS_BASE_PROMPT);
      await store.updateGlobalBossDefaults("");
    }
  });

  it("normalizes Markdown from every user-visible translation field", async () => {
    vi.spyOn(ai, "translateBossMessage").mockResolvedValueOnce({ plainMeaning: "**현재 상황** 공유 요청", likelyIntent: ["- 일정 확인"], tone: "`간결함`", caution: "[단정 금지](https://example.com)", confidence: 0.7, surfaceActualGapScore: 20, replies: [{ text: "**오늘** 공유하겠습니다.", style: "무난하게", reason: "- 일정 명시" }, { text: "오후에 공유하겠습니다.", style: "간결하게", reason: "시점 명시" }, { text: "정리해서 공유드리겠습니다.", style: "부드럽게", reason: "예의 유지" }] });
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const response = await app.inject({ method: "POST", url: "/api/bosses/00000000-0000-4000-8000-000000000001/translate", headers: { cookie }, payload: { inputText: "언제 되나?", channel: "사내 메신저" } });
    expect(response.json().result).toMatchObject({ plainMeaning: "현재 상황 공유 요청", tone: "간결함", caution: "단정 금지" });
    expect(JSON.stringify(response.json().result)).not.toMatch(/\*\*|`|https:\/\//);
  });
});
