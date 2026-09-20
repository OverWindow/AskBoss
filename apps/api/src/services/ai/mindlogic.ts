import OpenAI from "openai";
import { z, type ZodType } from "zod";
import { bossPersonaSchema,chatMessageCoachingSchema,companyResearchSchema,extractedEvidenceSchema,surveyQuestionsSchema,translationResultSchema } from "../../shared.js";
import { env } from "../../config/env.js";
import { companyPrompt } from "../../prompts/company.js";
import { evidencePrompt } from "../../prompts/evidence.js";
import { buildPersonaMessages } from "../../prompts/persona.js";
import { surveyPrompt } from "../../prompts/survey.js";
import { buildBossChatMessages } from "../../prompts/chat.js";
import { translatorPrompt } from "../../prompts/translator.js";
import { monologuePrompt } from "../../prompts/monologue.js";
import { hrSummaryPrompt } from "../../prompts/hr-summary.js";
import { simulationPrompt } from "../../prompts/simulation.js";
import { coachingPrompt } from "../../prompts/coaching.js";
import { bossSystemPrompt } from "../../prompts/shared.js";
import type { AiService, BossChatInput } from "./types.js";
import { plainTextValues, toPlainText } from "../../utils/plain-text.js";

const PERSONA_BUILD_TIMEOUT_MS = 90_000;
const personaJsonSchema = z.toJSONSchema(bossPersonaSchema);
delete personaJsonSchema.$schema;
const personaResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "boss_persona",
    strict: true,
    schema: personaJsonSchema,
  },
};

type PhaseTrace = {
  operation: "persona_build";
  phase: "generate" | "repair";
  schemaMode: "strict" | "prompt";
};

type MindlogicAiServiceOptions = {
  client?: OpenAI;
  personaTimeoutMs?: number;
};

function errorMetadata(error: unknown) {
  const candidate = error as { name?: unknown; status?: unknown; code?: unknown; requestID?: unknown };
  return {
    errorName: typeof candidate?.name === "string" ? candidate.name : "UnknownError",
    httpStatus: typeof candidate?.status === "number" ? candidate.status : undefined,
    errorCode: typeof candidate?.code === "string" ? candidate.code : undefined,
    requestId: typeof candidate?.requestID === "string" ? candidate.requestID : undefined,
  };
}

function isStructuredOutputRejection(error: unknown) {
  const status = (error as { status?: unknown })?.status;
  return status === 400 || status === 422;
}

export class MindlogicAiService implements AiService {
  private client: OpenAI;
  private personaTimeoutMs: number;
  private personaStructuredOutputsSupported: boolean | undefined;

  constructor(options: MindlogicAiServiceOptions = {}) {
    this.client = options.client ?? new OpenAI({ apiKey: env.MINDLOGIC_API_KEY!, baseURL: env.MINDLOGIC_BASE_URL, maxRetries: 0, timeout: 120_000 });
    this.personaTimeoutMs = options.personaTimeoutMs ?? PERSONA_BUILD_TIMEOUT_MS;
  }

  private logPhase(record: Record<string, unknown>) {
    const output = JSON.stringify({ event: "ai_phase", provider: "mindlogic", ...record });
    if (record.outcome === "failed") console.error(output);
    else console.info(output);
  }

  private async text(
    model: string,
    prompt: string,
    signal?: AbortSignal,
    system?: string,
    temperature = .4,
    responseFormat?: typeof personaResponseFormat,
    trace?: PhaseTrace,
  ) {
    const startedAt = Date.now();
    try {
      const { data: result, request_id: requestId } = await this.client.chat.completions.create({
        model,
        messages: [
          ...(system ? [{ role: "system" as const, content: system }] : []),
          { role: "user" as const, content: prompt },
        ],
        temperature,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }, { signal }).withResponse();
      const content = result.choices[0]?.message.content ?? "";
      if (trace) this.logPhase({ ...trace, outcome: "succeeded", durationMs: Date.now() - startedAt, model, requestId, responseChars: content.length });
      return content;
    } catch (error) {
      if (trace) this.logPhase({ ...trace, outcome: "failed", durationMs: Date.now() - startedAt, model, ...errorMetadata(error) });
      throw error;
    }
  }

  private parse<T>(raw: string, schema: ZodType<T>) {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
    return schema.parse(JSON.parse(cleaned));
  }

  private async validateOrRepair<T>(model: string, raw: string, schema: ZodType<T>, signal?: AbortSignal, temperature = .4) {
    try {
      return this.parse(raw, schema);
    } catch (error) {
      const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
      const repaired = await this.text(model, `다음 응답을 제공된 JSON Schema에 맞는 유효한 JSON으로 한 번만 복구하라. 설명이나 Markdown 없이 JSON 객체만 반환하라.\nJSON Schema: ${jsonSchema}\n검증 오류: ${error instanceof Error ? error.message : "invalid"}\n원본 응답: ${raw}`, signal, undefined, temperature);
      return this.parse(repaired, schema);
    }
  }

  private async structured<T>(model: string, prompt: string, schema: ZodType<T>, signal?: AbortSignal, system?: string, temperature = .4) {
    return plainTextValues(await this.validateOrRepair(model, await this.text(model, prompt, signal, system, temperature), schema, signal, temperature));
  }

  private async personaJsonText(model: string, prompt: string, signal: AbortSignal, system: string | undefined, phase: PhaseTrace["phase"]) {
    const schemaPrompt = `${prompt}\n<output-json-schema>${JSON.stringify(personaJsonSchema)}</output-json-schema>`;
    if (this.personaStructuredOutputsSupported === false) {
      return this.text(model, schemaPrompt, signal, system, .4, undefined, { operation: "persona_build", phase, schemaMode: "prompt" });
    }

    try {
      const content = await this.text(model, schemaPrompt, signal, system, .4, personaResponseFormat, { operation: "persona_build", phase, schemaMode: "strict" });
      this.personaStructuredOutputsSupported = true;
      return content;
    } catch (error) {
      if (!isStructuredOutputRejection(error)) throw error;
      this.personaStructuredOutputsSupported = false;
      this.logPhase({ operation: "persona_build", phase, schemaMode: "prompt", outcome: "fallback", reason: "strict_schema_rejected", ...errorMetadata(error) });
      return this.text(model, schemaPrompt, signal, system, .4, undefined, { operation: "persona_build", phase, schemaMode: "prompt" });
    }
  }

  private async buildPersonaWithinDeadline(input: any, signal: AbortSignal) {
    const [system, user] = buildPersonaMessages(input);
    const raw = await this.personaJsonText(env.AI_PRIMARY_MODEL, user.content, signal, system.content, "generate");
    try {
      return plainTextValues(this.parse(raw, bossPersonaSchema));
    } catch (error) {
      this.logPhase({ operation: "persona_build", phase: "validate", outcome: "failed", reason: "schema_validation_failed", ...errorMetadata(error) });
      const repaired = await this.personaJsonText(
        env.AI_PRIMARY_MODEL,
        `다음 응답을 제공된 JSON Schema에 맞는 유효한 JSON으로 한 번만 복구하라. 설명이나 Markdown 없이 JSON 객체만 반환하라.\n검증 오류: ${error instanceof Error ? error.message : "invalid"}\n원본 응답: ${raw}`,
        signal,
        undefined,
        "repair",
      );
      return plainTextValues(this.parse(repaired, bossPersonaSchema));
    }
  }

  private async withPersonaDeadline<T>(task: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController();
    const startedAt = Date.now();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.personaTimeoutMs);

    try {
      const result = await task(controller.signal);
      this.logPhase({ operation: "persona_build", phase: "total", outcome: "succeeded", durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      const finalError = timedOut
        ? Object.assign(new Error(`페르소나 생성 시간이 ${Math.ceil(this.personaTimeoutMs / 1_000)}초를 초과했습니다.`), { name: "PersonaBuildTimeoutError" })
        : error;
      this.logPhase({ operation: "persona_build", phase: "total", outcome: "failed", durationMs: Date.now() - startedAt, ...errorMetadata(finalError) });
      throw finalError;
    } finally {
      clearTimeout(timeout);
    }
  }

  researchCompany(name: string, promptInstruction?: string) { return this.structured(env.AI_COMPANY_RESEARCH_MODEL, companyPrompt(name, promptInstruction), companyResearchSchema); }

  async extractEvidence(input: { content: string; kind: string; promptInstruction?: string }) {
    if (input.kind !== "IMAGE") return this.structured(env.AI_PRIMARY_MODEL, evidencePrompt(input.content, input.promptInstruction), extractedEvidenceSchema);
    const url = input.content.replace(/^이미지 URL:\s*/, "");
    const response = await this.client.chat.completions.create({ model: env.AI_PRIMARY_MODEL, temperature: .2, messages: [{ role: "user", content: [{ type: "text", text: evidencePrompt("첨부 이미지의 대화 내용을 분석하라.", input.promptInstruction) }, { type: "image_url", image_url: { url } }] }] });
    return this.validateOrRepair(env.AI_PRIMARY_MODEL, response.choices[0]?.message.content ?? "", extractedEvidenceSchema);
  }

  buildPersona(input: any) { return this.withPersonaDeadline((signal) => this.buildPersonaWithinDeadline(input, signal)); }
  reviewUserMessage(input: any, signal?: AbortSignal) { return this.structured(env.AI_PRIMARY_MODEL, coachingPrompt(input), chatMessageCoachingSchema, signal, undefined, 0); }
  generateSurvey(boss: any, promptInstruction?: string) { return this.structured(env.AI_PRIMARY_MODEL, surveyPrompt(boss, promptInstruction), surveyQuestionsSchema); }

  async *streamChatWithBoss(input: BossChatInput, signal?: AbortSignal) {
    const stream = await this.client.chat.completions.create({ model: env.AI_PRIMARY_MODEL, messages: [...buildBossChatMessages(input)], temperature: .4, stream: true }, { signal });
    for await (const part of stream) {
      if (signal?.aborted) throw signal.reason;
      const content = part.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  async *streamSimulatedBossReaction(input: any, signal?: AbortSignal) {
    const { basePrompt, globalBoss, ...context } = input;
    const stream = await this.client.chat.completions.create({ model: env.AI_PRIMARY_MODEL, messages: [{ role: "system" as const, content: bossSystemPrompt(input.boss.scope, basePrompt, input.boss.scope === "SESSION" ? globalBoss?.persona : undefined) }, { role: "user", content: simulationPrompt(context) }], temperature: .4, stream: true }, { signal });
    for await (const part of stream) {
      if (signal?.aborted) throw signal.reason;
      const content = part.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  translateBossMessage(input: any, signal?: AbortSignal) { const { basePrompt, globalBoss, promptInstruction, replyStyles, ...context } = input; return this.structured(env.AI_PRIMARY_MODEL, translatorPrompt(context, promptInstruction, replyStyles), translationResultSchema, signal, bossSystemPrompt(input.boss.scope, basePrompt, input.boss.scope === "SESSION" ? globalBoss?.persona : undefined)); }
  async generateMonologue(input: any) { const { basePrompt, globalBoss, ...context } = input; return toPlainText(await this.text(env.AI_PRIMARY_MODEL, monologuePrompt(context), undefined, bossSystemPrompt(input.boss.scope, basePrompt, input.boss.scope === "SESSION" ? globalBoss?.persona : undefined))); }
  async generateHrSummary(data: any) { return toPlainText(await this.text(env.AI_PRIMARY_MODEL, hrSummaryPrompt(data))); }

  async health() {
    const required = [env.AI_PRIMARY_MODEL, env.AI_COMPANY_RESEARCH_MODEL];
    try {
      const response = await fetch(`${env.MINDLOGIC_BASE_URL.replace(/\/$/, "")}/models/`, { headers: { Authorization: `Bearer ${env.MINDLOGIC_API_KEY}` }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return { ok: false, available: [], missing: required, mode: "live" as const };
      const json: any = await response.json();
      const available = (json.data ?? json.models ?? []).map((model: any) => typeof model === "string" ? model : model.id);
      const missing = required.filter((model) => !available.includes(model));
      return { ok: missing.length === 0, available, missing, mode: "live" as const };
    } catch {
      return { ok: false, available: [], missing: required, mode: "live" as const };
    }
  }
}
