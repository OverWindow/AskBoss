import { env, hasDatabase } from "../config/env";
import { MemoryStore } from "./memory-store";
import { PostgresStore } from "./postgres-store";

export const store = hasDatabase ? new PostgresStore(env.DATABASE_URL!) : new MemoryStore();
export type { Store } from "./store";
