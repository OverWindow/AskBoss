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

  it("uses global-boss actual responses only as same-session calibration in every AI path", async () => {
    const chatInputs: any[] = [];
    const translationInputs: any[] = [];
    const simulationInputs: any[] = [];
    const monologueInputs: any[] = [];
    const originalTranslate = ai.translateBossMessage.bind(ai);
    vi.spyOn(ai, "streamChatWithBoss").mockImplementation(async function* (input: any, _signal?: AbortSignal) { chatInputs.push(input); yield "확인했습니다."; });
    vi.spyOn(ai, "translateBossMessage").mockImplementation(async (input: any, signal?: AbortSignal) => { translationInputs.push(input); return originalTranslate(input, signal); });
    vi.spyOn(ai, "streamSimulatedBossReaction").mockImplementation(async function* (input: any, _signal?: AbortSignal) { simulationInputs.push(input); yield "그럼 네 시에 다시 보자."; });
    vi.spyOn(ai, "generateMonologue").mockImplementation(async (input: any) => { monologueInputs.push(input); return "실제 반응을 참고해야겠군."; });

    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const bossId = "00000000-0000-4000-8000-000000000001";
    const initialTranslation = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie }, payload: { inputText: "오늘 되나?", channel: "사내 메신저" } });
    const archiveCookie = String(initialTranslation.headers["set-cookie"]).split(";")[0]!;
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie }, payload: { translationId: initialTranslation.json().translationId, replyIndex: 0 } });
    const feedback = await app.inject({ method: "PUT", url: `/api/archives/${initialTranslation.json().archiveId}/actual-response`, headers: { cookie: `${cookie}; ${archiveCookie}` }, payload: { content: "실제로는 내일 오전에 다시 보자고 했습니다." } });
    expect(feedback.json().application).toBe("SESSION_CALIBRATION");

    chatInputs.length = 0;
    translationInputs.length = 0;
    simulationInputs.length = 0;
    monologueInputs.length = 0;
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat`, headers: { cookie }, payload: { threadId: feedback.json().activeChat.threadId, message: "알겠습니다." } });
    const translated = await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie }, payload: { inputText: "다시 보자", channel: "대면" } });
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/chat/simulate`, headers: { cookie }, payload: { translationId: translated.json().translationId, replyIndex: 0 } });
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/monologue`, headers: { cookie } });

    for (const input of [chatInputs[0], translationInputs[0], simulationInputs[0], monologueInputs[0]]) {
      expect(input.sessionCalibration).toHaveLength(1);
      expect(input.sessionCalibration[0].content).toContain("실제로는 내일 오전에 다시 보자고 했습니다.");
    }
    expect((await store.listGlobalEvidence()).some((item) => item.rawText?.includes("내일 오전"))).toBe(false);

    const otherSession = await app.inject({ method: "POST", url: "/api/session" });
    const otherCookie = String(otherSession.headers["set-cookie"]).split(";")[0]!;
    await app.inject({ method: "POST", url: `/api/bosses/${bossId}/translate`, headers: { cookie: otherCookie }, payload: { inputText: "다시 보자", channel: "대면" } });
    expect(translationInputs.at(-1)?.sessionCalibration).toEqual([]);
  });
});
