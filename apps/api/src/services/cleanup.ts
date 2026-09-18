import { store } from "../repositories/index.js";
import { storage } from "./storage.js";
export async function cleanup(){const result=await store.cleanupExpired();await storage.remove(result.uploads);return result;}
