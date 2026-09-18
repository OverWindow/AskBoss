import { z } from "zod";
import { AGE_BANDS, ALLOWED_MIME_TYPES, AVATARS, CHANNELS, ENTRY_PATHS } from "../constants/options.js";

export const handleSchema = z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_\-가-힣]+$/);
export const profileSchema = z.object({
  handle: handleSchema,
  ageBand: z.number().refine((value) => (AGE_BANDS as readonly number[]).includes(value)),
  yearsOfServiceBand: z.string().min(1),
  rank: z.string().min(1),
  entryPath: z.enum(ENTRY_PATHS),
  weaknesses: z.array(z.string()).default([]),
});

export const bossInputSchema = z.object({
  alias: z.string().trim().min(1).max(40),
  avatarKey: z.enum(AVATARS),
  jobFunction: z.string().min(1),
  yearsOfServiceBand: z.string().min(1),
  rank: z.string().min(1),
  companyName: z.string().trim().min(1).max(120),
  ageBand: z.number().refine((value) => (AGE_BANDS as readonly number[]).includes(value)),
  hierarchyScore: z.number().int().min(0).max(100),
  genderBalanceScore: z.number().int().min(-100).max(100),
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
export const feedbackSchema = z.object({ feedback: z.enum(["GOOD", "BAD"]) });
export const surveyAnswerSchema = z.object({ questionId: z.string(), questionSnapshot: z.record(z.string(), z.unknown()), selectedOption: z.string().nullable(), freeText: z.string().max(2_000).nullable() });
export const surveyAnswersSchema = z.object({ answers: z.array(surveyAnswerSchema).min(1).max(10) });
export const adminLoginSchema = z.object({ password: z.string().min(1).max(256) });
export const adminJobStatusSchema = z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]);
