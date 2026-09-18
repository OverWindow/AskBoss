import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";

function loadDevelopmentEnv() {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") return;
  const candidates = [resolve(process.cwd(), ".env.development"), resolve(process.cwd(), "../../.env.development")];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return;
  const values = parseEnv(readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
}

loadDevelopmentEnv();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("boss-evidence"),
  MINDLOGIC_BASE_URL: z.string().url().default("https://factchat-cloud.mindlogic.ai/v1/gateway"),
  MINDLOGIC_API_KEY: z.string().optional(),
  AI_PRIMARY_MODEL: z.string().default("gpt-5.6-luna"),
  AI_COMPANY_RESEARCH_MODEL: z.string().default("gemini-3.5-flash-lite"),
  SESSION_SECRET: z.string().min(16).default("askboss-local-development-secret"),
  ANALYTICS_HMAC_SECRET: z.string().min(16).default("askboss-local-analytics-secret"),
  CRON_SECRET: z.string().min(8).default("askboss-local-cron"),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  ADMIN_SESSION_SECRET: z.string().min(32).optional(),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  HR_DEMO_MODE: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== "production") return;
  if (!value.ADMIN_PASSWORD) context.addIssue({ code: "custom", path: ["ADMIN_PASSWORD"], message: "ADMIN_PASSWORD is required in production" });
  if (!value.ADMIN_SESSION_SECRET) context.addIssue({ code: "custom", path: ["ADMIN_SESSION_SECRET"], message: "ADMIN_SESSION_SECRET is required in production" });
});

export type Env = z.infer<typeof schema>;
export const env = schema.parse(process.env);
export const hasDatabase = Boolean(env.DATABASE_URL);
export const hasAi = Boolean(env.MINDLOGIC_API_KEY);
export const hasStorage = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
