import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();
afterAll(() => app.close());

describe("translation API", () => {
  it("translates with the global boss through the deeply nested route", async () => {
    const session = await app.inject({ method: "POST", url: "/api/session" });
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;

    const response = await app.inject({
      method: "POST",
      url: "/api/bosses/00000000-0000-4000-8000-000000000001/translate",
      headers: { cookie },
      payload: { inputText: "진행 상황 알려주세요.", channel: "사내 메신저" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      translationId: expect.any(String),
      result: { plainMeaning: expect.any(String), replies: expect.any(Array) },
    });
  });
});
