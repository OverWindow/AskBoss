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
  key: string;
  label: string;
  value: string;
  confidence: number;
  evidenceIds: string[];
}

export interface BossPersona {
  summary: string;
  communication: { tone: string; messageLength: string; directness: number; formality: number };
  reporting: { preferredLength: string; preferredStructure: string[]; frequentChecks: string[] };
  decisionMaking: { speed: string; riskTolerance: string; autonomyPreference: string };
  management: { hierarchyPreference: string; feedbackStyle: string; deadlineSensitivity: string };
  recurringPatterns: string[];
  recurringPhrases: string[];
  humorStyle: string | null;
  uncertainty: string[];
  traits: PersonaTrait[];
}

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
  genderBalanceScore: number | null;
  companyResearch: CompanyResearch | null;
  persona: BossPersona | null;
  pki: PkiBreakdown | null;
  personaError?: string | null;
  personaVersion?: number;
}

export interface UserProfile {
  handle: string;
  ageBand: number;
  yearsOfServiceBand: string;
  rank: string;
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
  replies: [{ text: string; style: string; reason: string }, { text: string; style: string; reason: string }, { text: string; style: string; reason: string }];
}

export interface PersonalBossDefaults {
  prompt: string;
  updatedAt: string;
}

export interface AdminOperation {
  id: string;
  type: "JOB_RETRY" | "CLEANUP" | "ANALYTICS_ROLLUP" | "GLOBAL_BOSS_UPDATE" | "GLOBAL_PERSONA_REBUILD" | "PERSONAL_BOSS_DEFAULTS_UPDATE";
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

export interface AdminSessionSummary {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  bossCount: number;
  chatMessageCount: number;
  translationCount: number;
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
