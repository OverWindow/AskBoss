import type { BossRecord } from "../types.js";
import { store } from "../repositories/index.js";

const CALIBRATION_LIMIT = 10;
const CALIBRATION_CHARACTER_LIMIT = 10_000;

export async function getBossPromptContext(boss: BossRecord, sessionId?: string) {
  if (boss.scope === "GLOBAL") {
    const [defaults, evidence] = await Promise.all([
      store.getGlobalBossDefaults(),
      sessionId ? store.listEvidence(sessionId, boss.id) : Promise.resolve([]),
    ]);
    let remaining = CALIBRATION_CHARACTER_LIMIT;
    const sessionCalibration = evidence
      .filter((item) => item.type === "FEEDBACK" && item.status === "READY" && item.rawText)
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .slice(0, CALIBRATION_LIMIT)
      .flatMap((item) => {
        if (remaining <= 0) return [];
        const content = item.rawText!.slice(0, remaining);
        remaining -= content.length;
        return [{ evidenceId: item.id, observedAt: item.observedAt ?? item.createdAt, content }];
      });
    return { basePrompt: defaults.prompt, globalBoss: undefined, sessionCalibration };
  }
  const [defaults, globalBoss] = await Promise.all([
    store.getPersonalBossDefaults(),
    store.getGlobalBoss(),
  ]);
  return { basePrompt: defaults.prompt, globalBoss, sessionCalibration: undefined };
}
