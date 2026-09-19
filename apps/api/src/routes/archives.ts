import type { FastifyPluginAsync } from "fastify";
import { actualResponseSchema, archiveIdParamsSchema, archiveSelectedReplySchema } from "../shared.js";
import { store } from "../repositories/index.js";
import { requireArchiveOwner } from "../services/archive-owner.js";
import { requireSession, sessionExpiry } from "../services/session.js";
import { HttpError } from "../utils/http.js";
import { parse } from "../utils/validation.js";
import { decodeArchiveCursor } from "../utils/archive-cursor.js";
import type { ArchiveCursor } from "../utils/archive-cursor.js";

export const archiveRoutes: FastifyPluginAsync = async (app) => {
  app.get("/archives", async (request, reply) => {
    await requireSession(request);
    const ownerHash = requireArchiveOwner(request, reply);
    const query = request.query as { cursor?: string; limit?: string };
    let cursor: ArchiveCursor | undefined;
    if (query.cursor) {
      cursor = decodeArchiveCursor(query.cursor) ?? undefined;
      if (!cursor) throw new HttpError(400, "올바르지 않은 아카이브 커서입니다.", "INVALID_CURSOR");
    }
    const requestedLimit = Number(query.limit ?? 20);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 50)) : 20;
    return store.listArchives(ownerHash, cursor, limit);
  });

  app.get("/archives/:archiveId", async (request, reply) => {
    await requireSession(request);
    const ownerHash = requireArchiveOwner(request, reply);
    const { archiveId } = parse(archiveIdParamsSchema, request.params);
    const archive = await store.getArchive(ownerHash, archiveId);
    if (!archive) throw new HttpError(404, "아카이브를 찾을 수 없습니다.", "ARCHIVE_NOT_FOUND");
    return { archive };
  });

  app.delete("/archives/:archiveId", async (request, reply) => {
    await requireSession(request);
    const ownerHash = requireArchiveOwner(request, reply);
    const { archiveId } = parse(archiveIdParamsSchema, request.params);
    if (!(await store.deleteArchive(ownerHash, archiveId))) throw new HttpError(404, "아카이브를 찾을 수 없습니다.", "ARCHIVE_NOT_FOUND");
    return reply.code(204).send();
  });

  app.put("/archives/:archiveId/selected-reply", async (request, reply) => {
    await requireSession(request);
    const ownerHash = requireArchiveOwner(request, reply);
    const { archiveId } = parse(archiveIdParamsSchema, request.params);
    const { replyIndex } = parse(archiveSelectedReplySchema, request.body);
    const archive = await store.setArchiveSelectedReply(ownerHash, archiveId, replyIndex);
    if (!archive) throw new HttpError(404, "아카이브를 찾을 수 없습니다.", "ARCHIVE_NOT_FOUND");
    return { archive };
  });

  app.put("/archives/:archiveId/actual-response", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const session = await requireSession(request);
    const ownerHash = requireArchiveOwner(request, reply);
    const { archiveId } = parse(archiveIdParamsSchema, request.params);
    const { content } = parse(actualResponseSchema, request.body);
    const result = await store.upsertArchiveActualResponse(ownerHash, session.id, archiveId, content, sessionExpiry());
    if (!result) throw new HttpError(404, "아카이브를 찾을 수 없습니다.", "ARCHIVE_NOT_FOUND");
    return result;
  });
};
