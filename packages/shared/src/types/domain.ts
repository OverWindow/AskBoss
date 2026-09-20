export type BossScope = "GLOBAL" | "SESSION";
export type BossStatus = "DRAFT" | "BUILDING" | "READY" | "FAILED";
export type JobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface CompanyResearch {
  companyName: string;
  industry: string | null;
  companySizeHint: string | null;
  businessSummary: string;
  organizationHints: string[];
  workCultureSignals: string[];
  confidence: number;
  sourceSummary: string[];
}

export interface PersonaTrait {
  category: string;
  key: string;
  label: string;
  value: string;
  confidence: number;
  evidenceIds: string[];
}

export interface BossPersona {
  summary: string;
  traits: PersonaTrait[];
  uncertainty: string[];
}

export interface LegacyPersonaTrait {
  key: string;
  label: string;
  value: string;
  confidence: number;
  evidenceIds: string[];
}

export interface LegacyBossPersona {
  summary: string;
  communication: { tone: string; messageLength: string; directness: number; formality: number };
  reporting: { preferredLength: string; preferredStructure: string[]; frequentChecks: string[] };
  decisionMaking: { speed: string; riskTolerance: string; autonomyPreference: string };
  management: { hierarchyPreference: string; feedbackStyle: string; deadlineSensitivity: string };
  recurringPatterns: string[];
  recurringPhrases: string[];
  humorStyle: string | null;
  uncertainty: string[];
  traits: LegacyPersonaTrait[];
}

export type ReadableBossPersona = BossPersona | LegacyBossPersona;

export interface PkiBreakdown { completeness: number; evidenceReliability: number; diversity: number; freshness: number; score: number }

export interface Boss {
  id: string;
  scope: BossScope;
  status: BossStatus;
  alias: string;
  avatarKey: string;
  jobFunction: string | null;
  yearsOfServiceBand: string | null;
  rank: string | null;
  companyName: string | null;
  ageBand: number | null;
  hierarchyScore: number | null;
  companyResearch: CompanyResearch | null;
  persona: ReadableBossPersona | null;
  pki: PkiBreakdown | null;
  personaError?: string | null;
  personaVersion?: number;
}

export interface UserProfile {
  handle: string;
  ageBand: number;
  yearsOfServiceBand: string;
  rank: string;
  jobFunction: string;
  entryPath: string;
  weaknesses: string[];
}

export interface BossSurveyQuestion {
  id: string;
  category: string;
  situation: string;
  options: { id: string; label: string }[];
  allowFreeText: boolean;
}

export interface ExtractedMessage {
  speaker: string | null;
  timestamp: string | null;
  content: string;
  contextBefore?: string;
  contextAfter?: string;
}

export interface ExtractedObservation {
  category: string;
  summary: string;
  observedAt: string | null;
  contextQuality: number;
  messages: ExtractedMessage[];
}

export interface TranslationResult {
  plainMeaning: string;
  likelyIntent: string[];
  tone: string;
  caution?: string;
  confidence: number;
  surfaceActualGapScore: number;
  replies: [{ text: string; style: string; reason: string }, { text: string; style: string; reason: string }, { text: string; style: string; reason: string }];
}

export type ChatMessageKind = "CHAT" | "SIMULATION_SOURCE" | "SIMULATION_REPLY" | "SIMULATION_REACTION" | "ACTUAL_RESPONSE";

export interface ChatMessageCoaching {
  shouldSuggest: boolean;
  reason: string | null;
  revisedText: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: ChatMessageKind;
  coaching?: ChatMessageCoaching | null;
  createdAt: string;
}

export interface TranslationArchiveBoss {
  id: string;
  alias: string;
  avatarKey: string;
  scope: BossScope;
}

export interface TranslationArchiveActualResponse {
  content: string;
  replyIndex: number | null;
  replyText: string | null;
  updatedAt: string;
}

export interface TranslationArchiveBranch {
  id: string;
  kind: "PREDICTED" | "ACTUAL";
  status: "ACTIVE" | "SUPERSEDED" | "FAILED";
  replyIndex: number;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface TranslationArchiveSummary {
  id: string;
  boss: TranslationArchiveBoss;
  inputText: string;
  channel: string;
  lastCopiedReplyIndex: number | null;
  actualResponse: TranslationArchiveActualResponse | null;
  branchCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationArchiveDetail extends TranslationArchiveSummary {
  result: TranslationResult;
  branches: TranslationArchiveBranch[];
}

export interface PersonalBossDefaults {
  prompt: string;
  updatedAt: string;
}

export interface GlobalBossDefaults {
  prompt: string;
  updatedAt: string | null;
}

export type TranslationExamples = [string, string, string];
export type TranslationReplyStyles = [string, string, string];

export interface TranslationExamplesSettings {
  examples: TranslationExamples;
  updatedAt: string | null;
}

export interface AiPromptInstructions {
  translation: string;
  translationReplyStyles: TranslationReplyStyles;
  coaching: string;
  onboarding: {
    companyResearch: string;
    evidenceExtraction: string;
    surveyGeneration: string;
    personaGeneration: string;
  };
}

export interface AdminAiPromptSettings extends AiPromptInstructions {
  updatedAt: string | null;
}

export type AdminAiPromptSettingsInput = AiPromptInstructions;

export interface GlobalBossPromptSource {
  role: "system" | "user";
  component: string;
  origin: string;
  description: string;
  usesMockData: boolean;
}

export interface GlobalBossPromptPreview {
  messages: [
    { role: "system"; content: string },
    { role: "user"; content: string },
  ];
  sources: GlobalBossPromptSource[];
  usesMockUserData: true;
}

export interface AdminPromptMessage {
  role: "system" | "user";
  content: string;
}

export interface AdminPersonalBossPromptSource {
  role: "system" | "user";
  component: string;
  origin: string;
  description: string;
  containsPersonalData: boolean;
}

export interface AdminPersonalBossSummary {
  id: string;
  ownerHandle: string | null;
  alias: string;
  avatarKey: string;
  status: BossStatus;
  personaVersion: number;
  pkiScore: number | null;
  chatMessageCount: number;
  lastActivityAt: string;
  expiresAt: string;
}

export interface AdminPersonalBossPage {
  items: AdminPersonalBossSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminPersonaGenerationPromptPreview {
  messages: [AdminPromptMessage, AdminPromptMessage];
  sources: AdminPersonalBossPromptSource[];
  evidenceCount: number;
  surveyAnswerCount: number;
}

export type AdminBossChatPromptPreview = {
  status: "AVAILABLE";
  messages: [AdminPromptMessage, AdminPromptMessage];
  sources: AdminPersonalBossPromptSource[];
  lastQuestionAt: string;
  historyMessageCount: number;
  includedMessageCount: number;
  totalMessageCount: number;
} | {
  status: "NO_CHAT_HISTORY";
  reason: string;
  totalMessageCount: number;
};

export interface AdminPersonalBossPromptPreview {
  reconstructedAt: string;
  reconstructionMode: "CURRENT_STATE";
  profile: UserProfile | null;
  boss: Boss;
  personaGeneration: AdminPersonaGenerationPromptPreview;
  chat: AdminBossChatPromptPreview;
}

export interface AdminOperation {
  id: string;
  type: "JOB_RETRY" | "CLEANUP" | "ANALYTICS_ROLLUP" | "GLOBAL_BOSS_UPDATE" | "GLOBAL_PERSONA_REBUILD" | "PERSONAL_BOSS_DEFAULTS_UPDATE" | "GLOBAL_BOSS_DEFAULTS_UPDATE" | "TRANSLATION_EXAMPLES_UPDATE" | "AI_PROMPT_SETTINGS_UPDATE" | "MEANINGLESS_SESSIONS_PRUNE" | "PERSONAL_BOSS_PROMPT_VIEW";
  status: "SUCCEEDED" | "FAILED";
  detail: Record<string, number | string | boolean | null>;
  createdAt: string;
}

export interface AdminGlobalEvidence {
  id: string;
  bossId: string;
  type: "TEXT" | "TXT" | "IMAGE" | "SURVEY";
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  sourceName: string | null;
  rawText: string | null;
  parsedData: unknown;
  errorMessage: string | null;
  observedAt: string | null;
  createdAt: string;
}

export interface AdminGlobalSurveyAnswer {
  questionId: string;
  questionSnapshot: Record<string, unknown>;
  selectedOption: string | null;
  freeText: string | null;
}

export interface AdminGlobalBossDetail {
  boss: Boss;
  evidence: AdminGlobalEvidence[];
  surveyAnswers: AdminGlobalSurveyAnswer[];
}

export interface AdminDashboard {
  generatedAt: string;
  sessions: { total: number; active15m: number; new24h: number; expiring1h: number };
  usage: { personalBosses: number; chatMessages24h: number; translations24h: number };
  jobs: { pending: number; running: number; failed: number; oldestPendingMinutes: number | null; failureReasons: { reason: string; count: number }[] };
  uploads: { expiredIncomplete: number };
  featureUsage: { feature: string; value: number }[];
  recentOperations: AdminOperation[];
}

export interface HrDashboard {
  dataSource: "ACTUAL" | "MOCK";
  includesDemo: boolean;
  overview: { totalUses: number; activeSubjects: number; topFeature: string; summary: string };
  topics: { text: string; value: number }[];
  rankGap: { label: string; value: number }[];
  ageGap: { label: string; value: number }[];
  sameJobFunctionDistribution: { bucket: "SAME" | "DIFF"; count: number }[];
  surfaceActualGapRate: number | null;
  topRepeatedPhrases: { phrase: string; count: number }[];
}

export interface AdminSessionSummary {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  bossCount: number;
  chatMessageCount: number;
  translationCount: number;
}

export interface AdminSessionPage {
  items: AdminSessionSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminJobSummary {
  id: string;
  type: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  retryOf: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreditBucket {
  quota: number;
  used: number;
  remaining: number;
  renewalDate?: string | null;
}

export interface AdminCredits {
  available: boolean;
  checkedAt: string;
  latencyMs: number;
  models: { ok: boolean; available: string[]; missing: string[]; mode: "live" | "demo" };
  monthly: CreditBucket | null;
  purchased: CreditBucket | null;
  total: CreditBucket | null;
  error?: string;
}
