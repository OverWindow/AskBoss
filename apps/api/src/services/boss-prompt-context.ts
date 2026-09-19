import type { BossRecord } from "../types.js";
import { store } from "../repositories/index.js";

export async function getBossPromptContext(boss: BossRecord) {
  if (boss.scope === "GLOBAL") {
    const defaults = await store.getGlobalBossDefaults();
    return { basePrompt: defaults.prompt, globalBoss: undefined };
  }
  const [defaults, globalBoss] = await Promise.all([
    store.getPersonalBossDefaults(),
    store.getGlobalBoss(),
  ]);
  return { basePrompt: defaults.prompt, globalBoss };
}
