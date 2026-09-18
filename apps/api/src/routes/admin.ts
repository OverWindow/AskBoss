import type { FastifyPluginAsync } from "fastify";
import { adminJobStatusSchema, adminLoginSchema } from "@askboss/shared";
import { store } from "../repositories";
import { cleanup } from "../services/cleanup";
import { getAdminCredits } from "../services/ai/credits";
import { adminSourceKey, assertAdminOrigin, loginAdmin, logoutAdmin, optionalAdmin, requireAdmin } from "../services/admin-auth";
import { jobs } from "../services/jobs";
import { HttpError } from "../utils/http";
import { parse } from "../utils/validation";

const maskId = (id: string | null) => id ? `${id.slice(0, 8)}…${id.slice(-4)}` : null;
const cursor = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/auth", async (request) => {
    const session = await optionalAdmin(request);
    return session ? { authenticated: true, expiresAt: session.expiresAt } : { authenticated: false, expiresAt: null };
  });

  app.post("/admin/login", { config: { rateLimit: { max: 5, timeWindow: "15 minutes", keyGenerator: adminSourceKey } } }, async (request, reply) => {
    assertAdminOrigin(request);
    const body = parse(adminLoginSchema, request.body);
    return loginAdmin(request, reply, body.password);
  });

  app.post("/admin/logout", async (request, reply) => {
    assertAdminOrigin(request);
    await requireAdmin(request);
    await logoutAdmin(request, reply);
    return { authenticated: false };
  });

  app.get("/admin/dashboard", async (request) => { await requireAdmin(request); return store.getAdminDashboard(); });
  app.get("/admin/credits", async (request) => { await requireAdmin(request); return getAdminCredits(); });
  app.get("/admin/sessions", async (request) => {
    await requireAdmin(request);
    const query = request.query as Record<string, unknown>;
    const result = await store.listAdminSessions(cursor(query.cursor), 20);
    return { ...result, items: result.items.map((item) => ({ ...item, id: maskId(item.id) })) };
  });
  app.get("/admin/jobs", async (request) => {
    await requireAdmin(request);
    const query = request.query as Record<string, unknown>;
    const status = query.status === undefined ? undefined : adminJobStatusSchema.safeParse(query.status);
    if (status && !status.success) throw new HttpError(400, "유효하지 않은 Job 상태입니다.");
    const result = await store.listAdminJobs(status?.data, cursor(query.cursor), 20);
    return result;
  });

  app.post("/admin/jobs/:id/retry", async (request, reply) => {
    assertAdminOrigin(request); await requireAdmin(request);
    const id = (request.params as { id: string }).id;
    const job = await store.retryJob(id);
    if (!job) throw new HttpError(404, "재시도할 수 있는 실패 Job을 찾지 못했습니다.");
    await store.recordAdminOperation("JOB_RETRY", "SUCCEEDED", { originalJob: maskId(id)!, newJob: maskId(job.id)! });
    jobs.defer(jobs.process(job.id));
    return reply.code(202).send({ job: { id: maskId(job.id), status: job.status } });
  });

  app.post("/admin/maintenance/cleanup", async (request) => {
    assertAdminOrigin(request); await requireAdmin(request);
    try { const result = await cleanup(); await store.recordAdminOperation("CLEANUP", "SUCCEEDED", { sessions: result.sessions, uploads: result.uploads.length }); return result; }
    catch (error) { await store.recordAdminOperation("CLEANUP", "FAILED", { error: "operation_failed" }); throw error; }
  });
  app.post("/admin/maintenance/rollup", async (request) => {
    assertAdminOrigin(request); await requireAdmin(request);
    try { const rolledUp = await store.rollupAnalytics(); await store.recordAdminOperation("ANALYTICS_ROLLUP", "SUCCEEDED", { rolledUp }); return { rolledUp }; }
    catch (error) { await store.recordAdminOperation("ANALYTICS_ROLLUP", "FAILED", { error: "operation_failed" }); throw error; }
  });
};
