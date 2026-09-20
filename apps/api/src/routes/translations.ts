import type { FastifyPluginAsync } from "fastify";
import { feedbackSchema, translationInputSchema, type TranslationResult } from "../shared.js";
import { store } from "../repositories/index.js";
import { requireSession, sessionExpiry } from "../services/session.js";
import { ai } from "../services/ai/index.js";
import { track } from "../services/analytics.js";
import { HttpError } from "../utils/http.js";
import { parse } from "../utils/validation.js";
import { plainTextValues } from "../utils/plain-text.js";
import { getBossPromptContext } from "../services/boss-prompt-context.js";
import { requireArchiveOwner } from "../services/archive-owner.js";

const TRANSLATION_TIMEOUT_MS = 60_000;
const topics = (text: string) => ["보고", "일정", "마감", "야근", "메신저", "피드백", "회의", "자료", "실수", "확인"].filter((word) => text.includes(word));

export const translationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/translation-examples", async (request) => {
    await requireSession(request);
    const { examples } = await store.getTranslationExamples();
    return { examples };
  });

  app.post("/bosses/:bossId/translate", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const session = await requireSession(request);
    const ownerHash = requireArchiveOwner(request, reply);
    const body = parse(translationInputSchema, request.body);
    const bossId = (request.params as { bossId: string }).bossId;
    const [boss, profile, prompts] = await Promise.all([store.getBoss(session.id, bossId), store.getProfile(session.id), store.getAiPromptSettings()]);
    if (!boss) throw new HttpError(404, "상사를 찾을 수 없습니다.");
    const { basePrompt, globalBoss, sessionCalibration } = await getBossPromptContext(boss, session.id);

    const controller = new AbortController();
    let timedOut = false;
    const onClientAbort = () => controller.abort(new Error("client disconnected"));
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("translation timeout"));
    }, TRANSLATION_TIMEOUT_MS);
    request.raw.once("aborted", onClientAbort);

    try {
      const translated = plainTextValues(await ai.translateBossMessage({ profile, boss, basePrompt, globalBoss: boss.scope === "SESSION" ? globalBoss : undefined, sessionCalibration, promptInstruction: prompts.translation, replyStyles: prompts.translationReplyStyles, ...body }, controller.signal));
      const result: TranslationResult = {
        ...translated,
        replies: translated.replies.map((reply, index) => ({ ...reply, style: prompts.translationReplyStyles[index] })) as TranslationResult["replies"],
      };
      const { translation: row, archive } = await store.createTranslationWithArchive({ sessionId: session.id, bossId, inputText: body.inputText, channel: body.channel, result, expiresAt: sessionExpiry() }, ownerHash, boss);
      void track(session.id, "TRANSLATE", profile, boss, { topicKeywords: topics(body.inputText) }).catch((error) => request.log.warn(error, "translation analytics failed"));
      return { translationId: row.id, archiveId: archive.id, result };
    } catch (error) {
      if (timedOut) throw new HttpError(504, "번역 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", "AI_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
      request.raw.off("aborted", onClientAbort);
    }
  });

  app.post("/translations/:translationId/feedback", async (request) => {
    const session = await requireSession(request);
    const body = parse(feedbackSchema, request.body);
    await store.setTranslationFeedback(session.id, (request.params as { translationId: string }).translationId, body.feedback);
    return { saved: true };
  });
};
