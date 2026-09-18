import { env, hasDatabase } from "../config/env.js";
import { MemoryStore } from "./memory-store.js";
import { PostgresStore } from "./postgres-store.js";

export const store = hasDatabase ? new PostgresStore(env.DATABASE_URL!) : new MemoryStore();
export type { Store } from "./store.js";
