import type { ServerResponse } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import { chatInputSchema, chatSimulationInputSchema } from "../shared.js";
import { store } from "../repositories/index.js";
import { requireSession, sessionExpiry } from "../services/session.js";
import { ai } from "../services/ai/index.js";
import { track } from "../services/analytics.js";
import { HttpError } from "../utils/http.js";
import { parse } from "../utils/validation.js";

const FIRST_DELTA_TIMEOUT_MS = 30_000;
const DELTA_IDLE_TIMEOUT_MS = 25_000;
const TOTAL_TIMEOUT_MS = 90_000;
const HEARTBEAT_MS = 10_000;

const keywords = (text: string) => ["보고", "일정", "마감", "야근", "메신저", "피드백", "회의", "자료", "실수", "확인"].filter((word) => text.includes(word));

function writeEvent(response: ServerResponse, event: string, data: unknown) {
  if (!response.destroyed && !response.writableEnded) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  app.get("/bosses/:bossId/chat", async (request) => {
    const session = await requireSession(request);
    const bossId = (request.params as { bossId: string }).bossId;
    const query = request.query as { cursor?: string; limit?: string };
    return store.listChatMessages(session.id, bossId, query.cursor, Math.min(Number(query.limit) || 50, 100));
  });

  app.post("/bosses/:bossId/chat/simulate", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const session = await requireSession(request);
    const bossId = (request.params as { bossId: string }).bossId;
    const body = parse(chatSimulationInputSchema, request.body);
    const [boss, profile, translation] = await Promise.all([
      store.getBoss(session.id, bossId),
      store.getProfile(session.id),
      store.getTranslation(session.id, body.translationId),
    ]);
    if (!boss) throw new HttpError(404, "상사를 찾을 수 없습니다.");
    if (!translation || translation.bossId !== bossId) throw new HttpError(404, "번역 결과를 찾을 수 없습니다.", "TRANSLATION_NOT_FOUND");
    const selectedReply = translation.result.replies[body.replyIndex];
    if (!selectedReply) throw new HttpError(400, "추천 답변을 찾을 수 없습니다.", "REPLY_NOT_FOUND");
    const basePrompt = boss.scope === "SESSION" ? (await store.getPersonalBossDefaults()).prompt : undefined;

    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");
    reply.raw.setHeader("x-accel-buffering", "no");
    reply.raw.flushHeaders();
    writeEvent(reply.raw, "meta", { inputText: translation.inputText, reply: selectedReply.text });

    const controller = new AbortController();
    let timeoutCode: "AI_FIRST_DELTA_TIMEOUT" | "AI_IDLE_TIMEOUT" | "AI_TIMEOUT" | null = null;
    let timeoutMessage: string | null = null;
    let finished = false;
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    const abortForTimeout = (code: Exclude<typeof timeoutCode, null>, message: string) => {
      if (controller.signal.aborted) return;
      timeoutCode = code;
      timeoutMessage = message;
      controller.abort(new Error(message));
    };
    const resetProgressTimer = (milliseconds: number, code: Exclude<typeof timeoutCode, null>, message: string) => {
      clearTimeout(progressTimer);
      progressTimer = setTimeout(() => abortForTimeout(code, message), milliseconds);
    };
    const onClientClose = () => {
      if (!reply.raw.writableEnded && !controller.signal.aborted) controller.abort(new Error("client disconnected"));
    };

    request.raw.once("aborted", onClientClose);
    reply.raw.once("close", onClientClose);
    resetProgressTimer(FIRST_DELTA_TIMEOUT_MS, "AI_FIRST_DELTA_TIMEOUT", "첫 반응이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
    const totalTimer = setTimeout(() => abortForTimeout("AI_TIMEOUT", "시뮬레이션 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."), TOTAL_TIMEOUT_MS);
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(": heartbeat\n\n");
    }, HEARTBEAT_MS);

    try {
      let content = "";
      for await (const chunk of ai.streamSimulatedBossReaction({ profile, boss, basePrompt, inputText: translation.inputText, reply: selectedReply.text, channel: translation.channel }, controller.signal)) {
        if (!chunk) continue;
        content += chunk;
        writeEvent(reply.raw, "delta", { text: chunk });
        resetProgressTimer(DELTA_IDLE_TIMEOUT_MS, "AI_IDLE_TIMEOUT", "반응 생성이 중간에 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
      }
      clearTimeout(progressTimer);
      if (!content.trim()) throw new Error("AI returned an empty response");
      writeEvent(reply.raw, "done", { content });
      finished = true;
      reply.raw.end();
      void track(session.id, "SIMULATE", profile, boss, { topicKeywords: keywords(translation.inputText) }).catch((error) => request.log.warn(error, "simulation analytics failed"));
    } catch (error) {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        const code = timeoutCode ?? "AI_RESPONSE_ERROR";
        const message = timeoutMessage ?? "상사의 반응을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
        request.log.warn({ err: error, code }, "simulation stream failed");
        writeEvent(reply.raw, "error", { code, message });
      }
    } finally {
      clearTimeout(progressTimer);
      clearTimeout(totalTimer);
      clearInterval(heartbeat);
      request.raw.off("aborted", onClientClose);
      reply.raw.off("close", onClientClose);
      if (!finished && !reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
    }
  });

  app.post("/bosses/:bossId/chat", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const session = await requireSession(request);
    const bossId = (request.params as { bossId: string }).bossId;
    const body = parse(chatInputSchema, request.body);
    const [boss, profile] = await Promise.all([store.getBoss(session.id, bossId), store.getProfile(session.id)]);
    if (!boss) throw new HttpError(404, "상사를 찾을 수 없습니다.");
    const basePrompt = boss.scope === "SESSION" ? (await store.getPersonalBossDefaults()).prompt : undefined;

    const thread = await store.getOrCreateThread(session.id, bossId, body.threadId, sessionExpiry());
    // Capture history before adding the current message so the prompt contains it exactly once.
    const previousMessages = thread.messages.slice(-19);
    const userMessage = await store.addChatMessage(thread.id, "user", body.message);

    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");
    reply.raw.setHeader("x-accel-buffering", "no");
    reply.raw.flushHeaders();
    writeEvent(reply.raw, "meta", { threadId: thread.id, messageId: userMessage.id });

    const controller = new AbortController();
    let timeoutCode: "AI_FIRST_DELTA_TIMEOUT" | "AI_IDLE_TIMEOUT" | "AI_TIMEOUT" | null = null;
    let timeoutMessage: string | null = null;
    let finished = false;
    let progressTimer: ReturnType<typeof setTimeout> | undefined;

    const abortForTimeout = (code: Exclude<typeof timeoutCode, null>, message: string) => {
      if (controller.signal.aborted) return;
      timeoutCode = code;
      timeoutMessage = message;
      controller.abort(new Error(message));
    };
    const resetProgressTimer = (milliseconds: number, code: Exclude<typeof timeoutCode, null>, message: string) => {
      clearTimeout(progressTimer);
      progressTimer = setTimeout(() => abortForTimeout(code, message), milliseconds);
    };
    const onClientClose = () => {
      if (!reply.raw.writableEnded && !controller.signal.aborted) controller.abort(new Error("client disconnected"));
    };

    request.raw.once("aborted", onClientClose);
    reply.raw.once("close", onClientClose);
    resetProgressTimer(FIRST_DELTA_TIMEOUT_MS, "AI_FIRST_DELTA_TIMEOUT", "첫 답변이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
    const totalTimer = setTimeout(() => abortForTimeout("AI_TIMEOUT", "답변 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."), TOTAL_TIMEOUT_MS);
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(": heartbeat\n\n");
    }, HEARTBEAT_MS);

    try {
      let content = "";
      for await (const chunk of ai.streamChatWithBoss({ profile, boss, basePrompt, summary: thread.conversationSummary, messages: previousMessages, message: body.message }, controller.signal)) {
        if (!chunk) continue;
        content += chunk;
        writeEvent(reply.raw, "delta", { text: chunk });
        resetProgressTimer(DELTA_IDLE_TIMEOUT_MS, "AI_IDLE_TIMEOUT", "답변이 중간에 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
      }
      clearTimeout(progressTimer);
      if (!content.trim()) throw new Error("AI returned an empty response");

      const saved = await store.addChatMessage(thread.id, "assistant", content);
      writeEvent(reply.raw, "done", { message: saved });
      finished = true;
      reply.raw.end();
      void track(session.id, "CHAT", profile, boss, { topicKeywords: keywords(body.message) }).catch((error) => request.log.warn(error, "chat analytics failed"));
    } catch (error) {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        const code = timeoutCode ?? "AI_RESPONSE_ERROR";
        const message = timeoutMessage ?? "답변을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
        request.log.warn({ err: error, code }, "chat stream failed");
        writeEvent(reply.raw, "error", { code, message });
      }
    } finally {
      clearTimeout(progressTimer);
      clearTimeout(totalTimer);
      clearInterval(heartbeat);
      request.raw.off("aborted", onClientClose);
      reply.raw.off("close", onClientClose);
      if (!finished && !reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
    }
  });
};
