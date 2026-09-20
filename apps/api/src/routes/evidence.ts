import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { evidenceSchema, MAX_IMAGE_EVIDENCE_PER_BOSS, type BossEvidenceSummary } from "../shared.js";
import type { EvidenceRecord } from "../types.js";
import { store } from "../repositories/index.js";
import { requireSession, sessionExpiry } from "../services/session.js";
import { jobs } from "../services/jobs.js";
import { HttpError } from "../utils/http.js";
import { parse } from "../utils/validation.js";
import { storage } from "../services/storage.js";

const managedEvidenceTypes = new Set<BossEvidenceSummary["type"]>(["TEXT", "TXT", "IMAGE"]);
const isManagedEvidence = (evidence: EvidenceRecord): evidence is EvidenceRecord & { type: BossEvidenceSummary["type"] } => managedEvidenceTypes.has(evidence.type as BossEvidenceSummary["type"]);

const summarizeEvidence = (evidence: EvidenceRecord & { type: BossEvidenceSummary["type"] }): BossEvidenceSummary => ({
  id: evidence.id,
  type: evidence.type,
  status: evidence.status as BossEvidenceSummary["status"],
  sourceName: evidence.sourceName ?? null,
  errorMessage: evidence.errorMessage ?? null,
  createdAt: evidence.createdAt,
});

export const evidenceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/bosses/:bossId/evidence", async (request) => {
    const session = await requireSession(request);
    const bossId = (request.params as { bossId: string }).bossId;
    const boss = await store.getBoss(session.id, bossId);
    if (!boss || boss.scope !== "SESSION") throw new HttpError(404, "상사를 찾을 수 없습니다.");
    return { evidence: (await store.listEvidence(session.id, bossId)).filter(isManagedEvidence).map(summarizeEvidence) };
  });

  app.post("/bosses/:bossId/evidence", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const session = await requireSession(request);
    const bossId = (request.params as { bossId: string }).bossId;
    const boss = await store.getBoss(session.id, bossId);
    if (!boss || boss.scope === "GLOBAL") throw new HttpError(404, "상사를 찾을 수 없습니다.");
    const body = parse(evidenceSchema, request.body);
    let storagePath: string | null = null;
    let sourceName: string | null = body.type === "TEXT" ? "붙여넣기" : null;
    let type: string = body.type;
    if (body.type !== "TEXT") {
      const intent = await store.getUploadIntent(session.id, body.uploadIntentId);
      if (!intent || intent.bossId !== bossId || intent.completedAt) throw new HttpError(400, "유효하지 않은 업로드입니다.");
      if (!(await storage.verify(intent.storagePath, intent.sizeBytes, intent.contentType))) throw new HttpError(400, "업로드된 파일을 확인할 수 없습니다.", "UPLOAD_MISMATCH");
      storagePath = intent.storagePath;
      sourceName = intent.originalName;
      type = intent.contentType === "text/plain" ? "TXT" : "IMAGE";
      await store.completeUploadIntent(session.id, intent.id);
    }
    const input = { bossId, sessionId: session.id, type, status: "PENDING", sourceName, rawText: body.type === "TEXT" ? body.rawText : null, storagePath, parsedData: null, observedAt: null, expiresAt: sessionExpiry() };
    const evidence = type === "IMAGE" ? await store.createImageEvidenceWithLimit(input, MAX_IMAGE_EVIDENCE_PER_BOSS) : await store.createEvidence(input);
    if (!evidence) {
      if (storagePath) await storage.remove([storagePath]);
      throw new HttpError(409, `이미지는 상사별로 최대 ${MAX_IMAGE_EVIDENCE_PER_BOSS}장까지 등록할 수 있습니다.`, "IMAGE_LIMIT_EXCEEDED");
    }
    const job = await jobs.enqueue({ sessionId: session.id, bossId, type: "EVIDENCE_EXTRACT", payload: { evidenceId: evidence.id } });
    if (!isManagedEvidence(evidence)) throw new HttpError(500, "대화 자료 유형을 확인할 수 없습니다.");
    return reply.code(202).send({ evidence: summarizeEvidence(evidence), jobId: job.id });
  });

  app.delete("/bosses/:bossId/evidence/:evidenceId", async (request) => {
    const session = await requireSession(request);
    const { bossId, evidenceId } = parse(z.object({ bossId: z.string().uuid(), evidenceId: z.string().uuid() }), request.params);
    const boss = await store.getBoss(session.id, bossId);
    if (!boss || boss.scope !== "SESSION") throw new HttpError(404, "상사를 찾을 수 없습니다.", "BOSS_NOT_FOUND");
    const evidence = await store.getEvidence(session.id, evidenceId);
    if (!evidence || evidence.bossId !== bossId || !isManagedEvidence(evidence)) throw new HttpError(404, "대화 자료를 찾을 수 없습니다.", "EVIDENCE_NOT_FOUND");
    if (evidence.storagePath) await storage.remove([evidence.storagePath]);
    const deleted = await store.deleteEvidenceWithJobs(session.id, bossId, evidenceId);
    if (!deleted) throw new HttpError(404, "대화 자료를 찾을 수 없습니다.", "EVIDENCE_NOT_FOUND");
    let personaJobId: string | null = null;
    let personaRebuildError: string | null = null;
    if (boss.status !== "DRAFT") {
      try {
        personaJobId = (await jobs.enqueue({ sessionId: session.id, bossId, type: "PERSONA_REBUILD", payload: { reason: "EVIDENCE_DELETED" } })).id;
      } catch {
        personaRebuildError = "자료는 삭제됐지만 페르소나 재분석을 예약하지 못했습니다. 수동으로 다시 분석해 주세요.";
      }
    }
    return { deletedEvidenceId: evidenceId, deletedJobIds: deleted.jobIds, personaJobId, personaRebuildError };
  });
};
