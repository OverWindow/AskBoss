import { store } from "../repositories";
import { storage } from "./storage";
export async function cleanup(){const result=await store.cleanupExpired();await storage.remove(result.uploads);return result;}
