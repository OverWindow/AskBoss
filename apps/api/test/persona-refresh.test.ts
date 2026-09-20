import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { jobs } from "../src/services/jobs";

const app = buildApp();
afterAll(() => app.close());
afterEach(() => vi.restoreAllMocks());

async function createOwner(alias = "재분석 테스트") {
  const session = await app.inject({ method: "POST", url: "/api/session" });
  const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
  const created = await app.inject({
    method: "POST",
    url: "/api/bosses",
    headers: { cookie },
    payload: { alias, avatarKey: "boss-female-01", jobFunction: "기획", yearsOfServiceBand: "10~14년", rank: "부장", companyName: "테스트", ageBand: 40, hierarchyScore: 70, genderBalanceScore: 0 },
  });
  return { cookie, bossId: created.json().boss.id as string };
}

async function waitForJob(cookie: string, jobId: string) {
  for (let index = 0; index < 30; index += 1) {
    const response = await app.inject({ method: "GET", url: `/api/jobs/${jobId}`, headers: { cookie } });
    const job = response.json().job as { status: string };
    if (job.status === "SUCCEEDED" || job.status === "FAILED") return job;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("job timeout");
}

describe("personal persona refresh", () => {
  it("enforces a three-minute manual cooldown without limiting the legacy rebuild route", async () => {
    const owner = await createOwner();
    const initial = await app.inject({ method: "GET", url: `/api/bosses/${owner.bossId}/persona/refresh`, headers: { cookie: owner.cookie } });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ availableAt: null, retryAfterSeconds: 0, inProgress: false, jobId: null });

    const first = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/refresh`, headers: { cookie: owner.cookie } });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({ retryAfterSeconds: 180, inProgress: true, jobId: expect.any(String) });
    await waitForJob(owner.cookie, first.json().jobId);

    const blocked = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/refresh`, headers: { cookie: owner.cookie } });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe("PERSONA_REFRESH_COOLDOWN");

    const legacy = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/rebuild`, headers: { cookie: owner.cookie } });
    expect(legacy.statusCode).toBe(202);

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 181_000);
    const afterCooldown = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/refresh`, headers: { cookie: owner.cookie } });
    expect(afterCooldown.statusCode).toBe(202);
  });

  it("blocks another refresh while the prior job is active even after three minutes", async () => {
    const owner = await createOwner("진행 중 테스트");
    vi.spyOn(jobs, "resume").mockImplementation(() => undefined);
    const first = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/refresh`, headers: { cookie: owner.cookie } });
    expect(first.statusCode).toBe(202);

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 4 * 60_000);
    const blocked = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/refresh`, headers: { cookie: owner.cookie } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("PERSONA_REFRESH_IN_PROGRESS");
  });

  it("keeps the cooldown independent for each personal boss", async () => {
    const owner = await createOwner("첫 번째 상사");
    const second = await app.inject({
      method: "POST",
      url: "/api/bosses",
      headers: { cookie: owner.cookie },
      payload: { alias: "두 번째 상사", avatarKey: "boss-male-01", jobFunction: "개발", yearsOfServiceBand: "6~9년", rank: "팀장", companyName: "테스트", ageBand: 40, hierarchyScore: 50, genderBalanceScore: 0 },
    });
    const firstRefresh = await app.inject({ method: "POST", url: `/api/bosses/${owner.bossId}/persona/refresh`, headers: { cookie: owner.cookie } });
    const secondRefresh = await app.inject({ method: "POST", url: `/api/bosses/${second.json().boss.id}/persona/refresh`, headers: { cookie: owner.cookie } });
    expect(firstRefresh.statusCode).toBe(202);
    expect(secondRefresh.statusCode).toBe(202);
  });
});
