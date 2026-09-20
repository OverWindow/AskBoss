import { z } from "zod";
import { AGE_BANDS, ALLOWED_MIME_TYPES, AVATARS, CHANNELS, ENTRY_PATHS } from "../constants/options.js";
import { companyResearchSchema } from "./ai.js";

export const handleSchema = z.string()
  .trim()
  .min(3, "사용자 ID는 3자 이상 입력해 주세요.")
  .max(20, "사용자 ID는 20자 이하로 입력해 주세요.")
  .regex(/^[a-zA-Z0-9_\-가-힣]+$/, "사용자 ID에는 한글, 영문, 숫자, 밑줄(_), 하이픈(-)만 사용할 수 있습니다.");
export const profileSchema = z.object({
  handle: handleSchema,
  ageBand: z.number().refine((value) => (AGE_BANDS as readonly number[]).includes(value)),
  yearsOfServiceBand: z.string().min(1, "회사 생활 연차를 선택해 주세요."),
  rank: z.string().min(1, "현재 직급을 선택해 주세요."),
  jobFunction: z.string().min(1, "내 직무를 선택해 주세요."),
  entryPath: z.enum(ENTRY_PATHS),
  weaknesses: z.array(z.string()).default([]),
});

export const bossInputSchema = z.object({
  alias: z.string().trim().min(1, "상사를 부를 이름을 입력해 주세요.").max(40, "상사 이름은 40자 이하로 입력해 주세요."),
  avatarKey: z.enum(AVATARS),
  jobFunction: z.string().min(1, "상사의 직무를 선택해 주세요."),
  yearsOfServiceBand: z.string().min(1, "상사의 연차를 선택해 주세요."),
  rank: z.string().min(1, "상사의 직급을 선택해 주세요."),
  companyName: z.string().trim().min(1, "회사 이름을 입력해 주세요.").max(120, "회사 이름은 120자 이하로 입력해 주세요."),
  ageBand: z.number().refine((value) => (AGE_BANDS as readonly number[]).includes(value)),
  hierarchyScore: z.number().int("위계도는 정수로 입력해 주세요.").min(0, "위계도는 0 이상이어야 합니다.").max(100, "위계도는 100 이하여야 합니다."),
  companyResearch: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const uploadSignSchema = z.object({
  bossId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_MIME_TYPES),
  size: z.number().int().positive(),
});

export const evidenceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TEXT"), rawText: z.string().min(1).max(100_000) }),
  z.object({ type: z.enum(["TXT", "IMAGE"]), uploadIntentId: z.string().uuid() }),
]);

export const translationInputSchema = z.object({ inputText: z.string().trim().min(1).max(5_000), channel: z.enum(CHANNELS) });
export const chatInputSchema = z.object({ threadId: z.string().uuid().optional(), message: z.string().trim().min(1).max(5_000) });
export const chatSimulationInputSchema = z.object({ translationId: z.string().uuid(), replyIndex: z.number().int().min(0).max(2) });
export const actualResponseSchema = z.object({ content: z.string().trim().min(1, "실제 상사 답변을 입력해 주세요.").max(2_000, "실제 상사 답변은 2,000자 이하로 입력해 주세요.") });
export const archiveIdParamsSchema = z.object({ archiveId: z.string().uuid() });
export const archiveSelectedReplySchema = z.object({ replyIndex: z.number().int().min(0).max(2) });
export const feedbackSchema = z.object({ feedback: z.enum(["GOOD", "BAD"]) });
export const surveyAnswerSchema = z.object({ questionId: z.string(), questionSnapshot: z.record(z.string(), z.unknown()), selectedOption: z.string().nullable(), freeText: z.string().max(2_000).nullable() });
export const surveyAnswersSchema = z.object({ answers: z.array(surveyAnswerSchema).min(1).max(10) });
export const adminLoginSchema = z.object({ password: z.string().min(1).max(256) });
export const adminPersonalBossDefaultsSchema = z.object({ prompt: z.string().trim().max(5_000) });
export const adminGlobalBossDefaultsSchema = z.object({ prompt: z.string().trim().max(5_000) });
export const translationExamplesSchema = z.tuple([
  z.string().trim().min(1).max(200),
  z.string().trim().min(1).max(200),
  z.string().trim().min(1).max(200),
]);
export const adminTranslationExamplesSchema = z.object({ examples: translationExamplesSchema });
const adminPromptInstructionSchema = z.string().trim().min(1, "프롬프트 지침을 입력해 주세요.").max(5_000, "프롬프트 지침은 5,000자 이하로 입력해 주세요.");
const translationReplyStylesSchema = z.tuple([
  z.string().trim().min(1, "답장 스타일을 입력해 주세요.").max(40, "답장 스타일은 40자 이하로 입력해 주세요."),
  z.string().trim().min(1, "답장 스타일을 입력해 주세요.").max(40, "답장 스타일은 40자 이하로 입력해 주세요."),
  z.string().trim().min(1, "답장 스타일을 입력해 주세요.").max(40, "답장 스타일은 40자 이하로 입력해 주세요."),
]);
export const adminAiPromptSettingsSchema = z.object({
  translation: adminPromptInstructionSchema,
  translationReplyStyles: translationReplyStylesSchema,
  onboarding: z.object({
    companyResearch: adminPromptInstructionSchema,
    evidenceExtraction: adminPromptInstructionSchema,
    surveyGeneration: adminPromptInstructionSchema,
    personaGeneration: adminPromptInstructionSchema,
  }),
});
export const adminJobStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]);
export const adminGlobalBossPatchSchema = z.object({
  alias: z.string().trim().min(1).max(40).optional(),
  avatarKey: z.enum(AVATARS).optional(),
  jobFunction: z.string().min(1).nullable().optional(),
  yearsOfServiceBand: z.string().min(1).nullable().optional(),
  rank: z.string().min(1).nullable().optional(),
  companyName: z.string().trim().min(1).max(120).nullable().optional(),
  ageBand: z.number().refine((value) => (AGE_BANDS as readonly number[]).includes(value)).nullable().optional(),
  hierarchyScore: z.number().int().min(0).max(100).nullable().optional(),
  companyResearch: companyResearchSchema.nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "수정할 값을 입력해 주세요.");
export const adminGlobalUploadSignSchema = uploadSignSchema.omit({ bossId: true });
