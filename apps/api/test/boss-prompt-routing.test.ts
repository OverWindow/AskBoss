import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PERSONAL_BOSS_BASE_PROMPT } from "@askboss/shared";
import { buildApp } from "../src/app";
import { store } from "../src/repositories";
import { ai } from "../src/services/ai";

const app = buildApp();
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

function expectSeparated(inputs: any[]) {
  const global = inputs.find((input) => input.boss.scope === "GLOBAL");
  const personal = inputs.find((input) => input.boss.scope === "SESSION");
  expect(global).toMatchObject({ basePrompt: "글로벌 전용 지침" });
  expect(global.globalBoss).toBeUndefined();
  expect(global.globalPersona).toBeUndefined();
  expect(personal).toMatchObject({ basePrompt: "개인 전용 지침" });
  if (personal.globalBoss) expect(personal.globalBoss).toMatchObject({ scope: "GLOBAL" });
  else expect(personal.globalPersona).toBeTruthy();
}

describe("boss prompt routing", () => {
  it("keeps global and personal defaults separated in every live AI path", async () => {
    await store.updatePersonalBossDefaults("개인 전용 지침");
    await store.updateGlobalBossDefaults("글로벌 전용 지침");
    const chatInputs: any[] = [];
    const translationInputs: any[] = [];
    const simulationInputs: any[] = [];
    const monologueInputs: any[] = [];
    const originalTranslate = ai.translateBossMessage.bind(ai);
    vi.spyOn(ai, "streamChatWithBoss").mockImplementation(async function* (input: any, _signal?: AbortSignal) { chatInputs.push(input); yield "확인했습니다."; });
    vi.spyOn(ai, "translateBossMessage").mockImplementation(async (input: any, signal?: AbortSignal) => { translationInputs.push(input); return originalTranslate(input, signal); });
    vi.spyOn(ai, "streamSimulatedBossReaction").mockImplementation(async function* (input: any, _signal?: AbortSignal) { simulationInputs.push(input); yield "그대로 진행해."; });
    vi.spyOn(ai, "generateMonologue").mockImplementation(async (input: any) => { monologueInputs.push(input); return "진행 상황을 확인해야겠군."; });

    try {
      const session = await app.inject({ method: "POST", url: "/api/session" });
      const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
      const globalBossId = "00000000-0000-4000-8000-000000000001";
      const created = await app.inject({ method: "POST", url: "/api/bosses", headers: { cookie }, payload: { alias: "개인 테스트 상사", avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "10~14년", rank: "팀장", companyName: "테스트", ageBand: 40, hierarchyScore: 70 } });
      const personalBossId = created.json().boss.id as string;

      for (const bossId of [globalBossId, personalBossId]) {
        const chat = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat`, headers: { cookie }, payload: { message: "진행 상황을 알려주세요." } });
        expect(chat.statusCode).toBe(200);
        const translated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie }, payload: { inputText: "언제 되나?", channel: "사내 메신저" } });
        expect(translated.statusCode).toBe(200);
        const simulated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie }, payload: { translationId: translated.json().translationId, replyIndex: 0 } });
        expect(simulated.statusCode).toBe(200);
        const monologue = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/monologue`, headers: { cookie } });
        expect(monologue.statusCode).toBe(200);
      }

      expectSeparated(chatInputs);
      expectSeparated(translationInputs);
      expectSeparated(simulationInputs);
      expectSeparated(monologueInputs);
    } finally {
      await store.updatePersonalBossDefaults(DEFAULT_PERSONAL_BOSS_BASE_PROMPT);
      await store.updateGlobalBossDefaults("");
    }
  });
});
