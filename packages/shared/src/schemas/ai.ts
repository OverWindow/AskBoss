import { z } from "zod";

export const companyResearchSchema = z.object({
  companyName: z.string(), industry: z.string().nullable(), companySizeHint: z.string().nullable(), businessSummary: z.string(),
  organizationHints: z.array(z.string()), workCultureSignals: z.array(z.string()), confidence: z.number().min(0).max(1), sourceSummary: z.array(z.string()),
});
const traitSchema = z.object({ key: z.string(), label: z.string(), value: z.string(), confidence: z.number().min(0).max(1), evidenceIds: z.array(z.string()) });
export const bossPersonaSchema = z.object({
  summary: z.string(),
  communication: z.object({ tone: z.string(), messageLength: z.string(), directness: z.number().min(0).max(100), formality: z.number().min(0).max(100) }),
  reporting: z.object({ preferredLength: z.string(), preferredStructure: z.array(z.string()), frequentChecks: z.array(z.string()) }),
  decisionMaking: z.object({ speed: z.string(), riskTolerance: z.string(), autonomyPreference: z.string() }),
  management: z.object({ hierarchyPreference: z.string(), feedbackStyle: z.string(), deadlineSensitivity: z.string() }),
  recurringPatterns: z.array(z.string()), recurringPhrases: z.array(z.string()), humorStyle: z.string().nullable(), uncertainty: z.array(z.string()), traits: z.array(traitSchema),
});
export const surveyQuestionsSchema = z.array(z.object({ id: z.string(), category: z.string(), situation: z.string(), options: z.array(z.object({ id: z.string(), label: z.string() })).min(2), allowFreeText: z.boolean() })).length(5);
export const extractedEvidenceSchema = z.object({ observations: z.array(z.object({ category: z.string(), summary: z.string(), observedAt: z.string().nullable(), contextQuality: z.number().min(0).max(1), messages: z.array(z.object({ speaker: z.string().nullable(), timestamp: z.string().nullable(), content: z.string(), contextBefore: z.string().optional(), contextAfter: z.string().optional() })) })) });
export const translationResultSchema = z.object({
  plainMeaning: z.string(), likelyIntent: z.array(z.string()), tone: z.string(), caution: z.string().optional(), confidence: z.number().min(0).max(1), surfaceActualGapScore: z.number().min(0).max(100),
  replies: z.tuple([z.object({ text: z.string(), style: z.string(), reason: z.string() }), z.object({ text: z.string(), style: z.string(), reason: z.string() }), z.object({ text: z.string(), style: z.string(), reason: z.string() })]),
});
