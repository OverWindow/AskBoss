import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const app = buildApp();
afterAll(() => app.close());

async function sessionCookie() {
  const response = await app.inject({ method: "POST", url: "/api/session" });
  return String(response.headers["set-cookie"]).split(";")[0]!;
}

const profile = (handle: string) => ({ handle, ageBand: 30, yearsOfServiceBand: "3~4년", jobFunction: "개발", rank: "대리", entryPath: "신입", weaknesses: [] });

describe("profile API", () => {
  it("returns the persisted profile and reports validation and duplicate handle errors", async () => {
    const firstCookie = await sessionCookie();
    const secondCookie = await sessionCookie();
    const saved = await app.inject({ method: "PUT", url: "/api/profile", headers: { cookie: firstCookie }, payload: profile("새사용자") });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().profile.handle).toBe("새사용자");

    const duplicate = await app.inject({ method: "PUT", url: "/api/profile", headers: { cookie: secondCookie }, payload: profile("새사용자") });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toMatchObject({ code: "HANDLE_TAKEN", message: "이미 사용 중인 사용자 ID입니다." });

    const invalid = await app.inject({ method: "PUT", url: "/api/profile", headers: { cookie: secondCookie }, payload: profile("x") });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.message).toContain("3자 이상");

    const selfUpdate = await app.inject({ method: "PUT", url: "/api/profile", headers: { cookie: firstCookie }, payload: profile("새사용자") });
    expect(selfUpdate.statusCode).toBe(200);
  });
});
