import type { AdminCredits, CreditBucket } from "@askboss/shared";
import { env } from "../../config/env.js";
import { ai } from "./index.js";

let cache: { expiresAt: number; value: AdminCredits } | null = null;

export function clearAdminCreditsCache() {
  cache = null;
}

function bucket(value: any): CreditBucket | null {
  if (!value || ![value.quota, value.used, value.remaining].every((item) => Number.isFinite(Number(item)))) return null;
  return { quota: Number(value.quota), used: Number(value.used), remaining: Number(value.remaining), renewalDate: value.renewal_date ?? null };
}

export async function getAdminCredits(force = false): Promise<AdminCredits> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.value;
  const started = performance.now();
  const models = await ai.health();
  if (!env.MINDLOGIC_API_KEY) return { available: false, checkedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - started), models, monthly: null, purchased: null, total: null, error: "Mindlogic API 키가 설정되지 않았습니다." };
  try {
    const response = await fetch(`${env.MINDLOGIC_BASE_URL.replace(/\/$/, "")}/credits/`, { headers: { Authorization: `Bearer ${env.MINDLOGIC_API_KEY}` }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Credits API ${response.status}`);
    const json = await response.json() as any;
    const value: AdminCredits = { available: true, checkedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - started), models, monthly: bucket(json.monthly_allocated), purchased: bucket(json.purchased), total: bucket(json.total) };
    cache = { expiresAt: Date.now() + 60_000, value };
    return value;
  } catch (error) {
    return { available: false, checkedAt: new Date().toISOString(), latencyMs: Math.round(performance.now() - started), models, monthly: null, purchased: null, total: null, error: error instanceof Error ? error.message : "크레딧을 조회하지 못했습니다." };
  }
}
