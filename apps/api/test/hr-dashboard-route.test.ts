import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

const app = buildApp();
afterAll(() => app.close());

describe("HR dashboard API privacy", () => {
  it("returns only anonymous repeated simulation types for actual and demo datasets", async () => {
    for (const dataset of ["actual", "mock"]) {
      const response = await app.inject({ method: "GET", url: `/api/hr/dashboard?dataset=${dataset}` });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty("repeatedSimulationTypes");
      expect(body).not.toHaveProperty("topRepeatedPhrases");
      expect(JSON.stringify(body)).not.toMatch(/"(?:phrase|inputText)"/);
      for (const item of body.repeatedSimulationTypes) expect(Object.keys(item).sort()).toEqual(["count", "type"]);
    }
  });
});
