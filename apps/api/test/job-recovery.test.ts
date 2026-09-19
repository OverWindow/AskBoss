import { afterAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { env } from "../src/config/env";
import { store } from "../src/repositories";

const app = buildApp();

afterAll(() => app.close());

describe("expired AI job recovery", () => {
  it("reclaims an expired job when its owner polls without a cron runner", async () => {
    const browserSession = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(browserSession.headers["set-cookie"]).split(";")[0]!;
    const session = browserSession.json().session;
    const boss = await store.createBoss(session.id, {
      alias: "폴링 복구 상사",
      avatarKey: "boss-male-01",
      jobFunction: "개발",
      yearsOfServiceBand: "10~14년",
      rank: "팀장",
      companyName: "테스트 회사",
      ageBand: 40,
      hierarchyScore: 60,
    }, session.expiresAt);
    const evidence = await store.createEvidence({
      sessionId: session.id,
      bossId: boss.id,
      type: "TEXT",
      status: "PENDING",
      rawText: "진행 상황과 완료 시각을 함께 확인한다.",
      storagePath: null,
      parsedData: null,
      observedAt: null,
      expiresAt: session.expiresAt,
      errorMessage: null,
      sourceArchiveId: null,
    });
    const job = await store.createJob({ sessionId: session.id, bossId: boss.id, type: "EVIDENCE_EXTRACT", payload: { evidenceId: evidence.id } });
    const claimed = await store.claimJob(job.id);
    if (claimed) claimed.leaseUntil = new Date(Date.now() - 1_000).toISOString();

    const polled = await app.inject({ method: "GET", url: `/api/jobs/${job.id}`, headers: { cookie } });
    expect(polled.statusCode).toBe(200);
    await vi.waitFor(async () => expect(await store.getJobById(job.id)).toMatchObject({ status: "SUCCEEDED", attempts: 2, leaseUntil: null }));
    expect(await store.getEvidence(session.id, evidence.id)).toMatchObject({ status: "READY" });

    await store.deleteSession(session.id);
  });

  it("requires the cron secret and reclaims an expired running job", async () => {
    env.CRON_SECRET = "test-cron-secret";
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const session = await store.createSession(`job-recovery-${Date.now()}`, expiresAt);
    const boss = await store.createBoss(session.id, {
      alias: "복구 테스트 상사",
      avatarKey: "boss-male-01",
      jobFunction: "개발",
      yearsOfServiceBand: "10~14년",
      rank: "팀장",
      companyName: "테스트 회사",
      ageBand: 40,
      hierarchyScore: 60,
    }, expiresAt);
    const evidence = await store.createEvidence({
      sessionId: session.id,
      bossId: boss.id,
      type: "TEXT",
      status: "PENDING",
      rawText: "결론과 마감 일정을 먼저 확인한다.",
      storagePath: null,
      parsedData: null,
      observedAt: null,
      expiresAt,
      errorMessage: null,
      sourceArchiveId: null,
    });
    const job = await store.createJob({ sessionId: session.id, bossId: boss.id, type: "EVIDENCE_EXTRACT", payload: { evidenceId: evidence.id } });
    const claimed = await store.claimJob(job.id);
    expect(claimed?.status).toBe("RUNNING");
    if (claimed) claimed.leaseUntil = new Date(Date.now() - 1_000).toISOString();

    const unauthorized = await app.inject({ method: "GET", url: "/api/internal/jobs/run" });
    expect(unauthorized.statusCode).toBe(401);

    const recovered = await app.inject({ method: "GET", url: "/api/internal/jobs/run", headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json().processed).toBe(1);
    expect(await store.getJobById(job.id)).toMatchObject({ status: "SUCCEEDED", attempts: 2, leaseUntil: null });
    expect(await store.getEvidence(session.id, evidence.id)).toMatchObject({ status: "READY" });

    await store.deleteSession(session.id);
  });

  it("renews only a running job lease", async () => {
    const job = await store.createJob({ sessionId: null, bossId: null, type: "CHAT_SUMMARIZE", payload: {} });
    await store.renewJobLease(job.id);
    expect((await store.getJobById(job.id))?.leaseUntil).toBeNull();

    await store.claimJob(job.id);
    const before = Date.now();
    await store.renewJobLease(job.id);
    const renewed = await store.getJobById(job.id);
    expect(renewed?.leaseUntil).not.toBeNull();
    expect(Date.parse(renewed!.leaseUntil!)).toBeGreaterThanOrEqual(before + 89_000);
    await store.completeJob(job.id, { ok: true });
  });

  it("defers a persona rebuild until pending evidence has finished", async () => {
    env.CRON_SECRET = "test-cron-secret";
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const session = await store.createSession(`job-dependency-${Date.now()}`, expiresAt);
    const boss = await store.createBoss(session.id, {
      alias: "의존성 테스트 상사",
      avatarKey: "boss-male-01",
      jobFunction: "개발",
      yearsOfServiceBand: "10~14년",
      rank: "팀장",
      companyName: "테스트 회사",
      ageBand: 40,
      hierarchyScore: 60,
    }, expiresAt);
    const evidence = await store.createEvidence({
      sessionId: session.id,
      bossId: boss.id,
      type: "TEXT",
      status: "PENDING",
      rawText: "진행 상황과 완료 예정 시각을 함께 확인한다.",
      storagePath: null,
      parsedData: null,
      observedAt: null,
      expiresAt,
      errorMessage: null,
      sourceArchiveId: null,
    });
    const personaJob = await store.createJob({ sessionId: session.id, bossId: boss.id, type: "PERSONA_REBUILD", payload: {} });
    const evidenceJob = await store.createJob({ sessionId: session.id, bossId: boss.id, type: "EVIDENCE_EXTRACT", payload: { evidenceId: evidence.id } });
    const headers = { authorization: `Bearer ${env.CRON_SECRET}` };

    const firstRun = await app.inject({ method: "GET", url: "/api/internal/jobs/run", headers });
    expect(firstRun.statusCode).toBe(200);
    expect(firstRun.json().processed).toBe(2);
    expect(await store.getJobById(evidenceJob.id)).toMatchObject({ status: "SUCCEEDED", attempts: 1 });
    expect(await store.getJobById(personaJob.id)).toMatchObject({ status: "PENDING", attempts: 0, leaseUntil: null });

    const secondRun = await app.inject({ method: "GET", url: "/api/internal/jobs/run", headers });
    expect(secondRun.statusCode).toBe(200);
    expect(secondRun.json().processed).toBe(1);
    expect(await store.getJobById(personaJob.id)).toMatchObject({ status: "SUCCEEDED", attempts: 1 });

    await store.deleteSession(session.id);
  });
});
