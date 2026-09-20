import { z } from "zod";

export const companyResearchSchema = z.object({
  companyName: z.string(), industry: z.string().nullable(), companySizeHint: z.string().nullable(), businessSummary: z.string(),
  organizationHints: z.array(z.string()), workCultureSignals: z.array(z.string()), confidence: z.number().min(0).max(1), sourceSummary: z.array(z.string()),
});
const traitSchema = z.object({
  category: z.string(),
  key: z.string(),
  label: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
}).strict();
export const bossPersonaSchema = z.object({
  summary: z.string(),
  traits: z.array(traitSchema),
  uncertainty: z.array(z.string()),
}).strict();
export const surveyQuestionsSchema = z.array(z.object({ id: z.string(), category: z.string(), situation: z.string(), options: z.array(z.object({ id: z.string(), label: z.string() })).min(2), allowFreeText: z.boolean() })).length(5);
export const extractedEvidenceSchema = z.object({ observations: z.array(z.object({ category: z.string(), summary: z.string(), observedAt: z.string().nullable(), contextQuality: z.number().min(0).max(1), messages: z.array(z.object({ speaker: z.string().nullable(), timestamp: z.string().nullable(), content: z.string(), contextBefore: z.string().optional(), contextAfter: z.string().optional() })) })) });
export const translationResultSchema = z.object({
  plainMeaning: z.string(), likelyIntent: z.array(z.string()), tone: z.string(), caution: z.string().optional(), confidence: z.number().min(0).max(1), surfaceActualGapScore: z.number().min(0).max(100),
  replies: z.tuple([z.object({ text: z.string(), style: z.string(), reason: z.string() }), z.object({ text: z.string(), style: z.string(), reason: z.string() }), z.object({ text: z.string(), style: z.string(), reason: z.string() })]),
});
export const chatMessageCoachingSchema = z.object({
  shouldSuggest: z.boolean(),
  reason: z.string().trim().min(1).max(300).nullable(),
  revisedText: z.string().trim().min(1).max(5_000).nullable(),
}).superRefine((value, context) => {
  if (value.shouldSuggest && (!value.reason || !value.revisedText)) {
    context.addIssue({ code: "custom", message: "수정 제안에는 이유와 수정 문장이 필요합니다." });
  }
  if (!value.shouldSuggest && (value.reason !== null || value.revisedText !== null)) {
    context.addIssue({ code: "custom", message: "제안이 없으면 이유와 수정 문장은 null이어야 합니다." });
  }
});
