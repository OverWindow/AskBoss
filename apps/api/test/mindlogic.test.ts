import type OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bossPersonaSchema } from "@askboss/shared";
import { MindlogicAiService } from "../src/services/ai/mindlogic";

const persona = {
  summary: "요약",
  uncertainty: [],
  traits: [
    { category: "소통", key: "direct", label: "직접성", value: "높음", confidence: .8, evidenceIds: [] },
    { category: "회의", key: "pre_read", label: "사전 공유 선호", value: "회의 전에 핵심 내용을 미리 확인함", confidence: .65, evidenceIds: ["evidence-1"] },
  ],
};

const input = {
  boss: { scope: "SESSION" },
  evidence: [],
  survey: [],
} as any;

type Step = { content: string; requestId?: string } | { error: unknown };

function mockClient(steps: Step[]) {
  const create = vi.fn((_body: unknown, _options: { signal?: AbortSignal }) => {
    const step = steps.shift();
    if (!step) throw new Error("Unexpected AI request");
    return {
      withResponse: async () => {
        if ("error" in step) throw step.error;
        return {
          data: { choices: [{ message: { content: step.content } }] },
          request_id: step.requestId,
        };
      },
    };
  });
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create };
}

describe("MindlogicAiService persona generation", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the persona JSON Schema on the first request", async () => {
    const { client, create } = mockClient([{ content: JSON.stringify(persona), requestId: "req-persona" }]);
    const service = new MindlogicAiService({ client });

    await expect(service.buildPersona(input)).resolves.toEqual(persona);

    const request = create.mock.calls.at(0)![0] as any;
    expect(request.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "boss_persona", strict: true },
    });
    expect(request.response_format.json_schema.schema).toMatchObject({
      additionalProperties: false,
      required: ["summary", "traits", "uncertainty"],
    });
    expect(JSON.stringify(request.response_format.json_schema.schema)).toContain('"category"');
    expect(JSON.stringify(request.response_format.json_schema.schema)).not.toContain('"communication"');
    expect(request.messages.at(-1).content).toContain("<output-json-schema>");
    expect(request.messages.at(-1).content).toContain('"category"');
  });

  it("falls back to schema-in-prompt mode when the gateway rejects strict output", async () => {
    const rejection = Object.assign(new Error("unsupported response_format"), { status: 400, requestID: "req-rejected" });
    const { client, create } = mockClient([
      { error: rejection },
      { content: JSON.stringify(persona) },
      { content: JSON.stringify(persona) },
    ]);
    const service = new MindlogicAiService({ client });

    await service.buildPersona(input);
    await service.buildPersona(input);

    expect((create.mock.calls.at(0)![0] as any).response_format.type).toBe("json_schema");
    expect((create.mock.calls.at(1)![0] as any).response_format).toBeUndefined();
    expect((create.mock.calls.at(2)![0] as any).response_format).toBeUndefined();
    expect((create.mock.calls.at(1)![0] as any).messages.at(-1).content).toContain("<output-json-schema>");
  });

  it("logs generation and repair timings separately", async () => {
    const { client, create } = mockClient([
      { content: '{"summary":"incomplete"}', requestId: "req-generate" },
      { content: JSON.stringify(persona), requestId: "req-repair" },
    ]);
    const service = new MindlogicAiService({ client });

    await expect(service.buildPersona(input)).resolves.toEqual(persona);

    expect(create).toHaveBeenCalledTimes(2);
    const records = vi.mocked(console.info).mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "ai_phase", phase: "generate", outcome: "succeeded", requestId: "req-generate" }),
      expect.objectContaining({ event: "ai_phase", phase: "repair", outcome: "succeeded", requestId: "req-repair" }),
      expect.objectContaining({ event: "ai_phase", phase: "total", outcome: "succeeded" }),
    ]));
  });

  it("keeps trait contents flexible while enforcing the fixed JSON contract", () => {
    expect(bossPersonaSchema.parse(persona)).toEqual(persona);
    expect(() => bossPersonaSchema.parse({ ...persona, traits: [{ ...persona.traits[0], value: ["높음"] }] })).toThrow();
    expect(() => bossPersonaSchema.parse({ ...persona, traits: [{ ...persona.traits[0], confidence: 1.1 }] })).toThrow();
    expect(() => bossPersonaSchema.parse({ ...persona, communication: { tone: "간결" } })).toThrow();
  });

  it("aborts the complete generate-and-repair operation at the hard deadline", async () => {
    const create = vi.fn((_body: unknown, options: { signal?: AbortSignal }) => ({
      withResponse: () => new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      }),
    }));
    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    const service = new MindlogicAiService({ client, personaTimeoutMs: 10 });

    await expect(service.buildPersona(input)).rejects.toMatchObject({
      name: "PersonaBuildTimeoutError",
      message: "페르소나 생성 시간이 1초를 초과했습니다.",
    });
    expect((create.mock.calls.at(0)![1] as { signal: AbortSignal }).signal.aborted).toBe(true);
  });
});
