import { createHmac, randomBytes } from "node:crypto";

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function hmac(value: string, secret: string, namespace: string) {
  return createHmac("sha256", secret).update(`${namespace}:${value}`).digest("hex");
}

export function safeExtension(fileName: string, contentType: string) {
  const byType: Record<string, string> = { "text/plain": "txt", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  return byType[contentType] ?? fileName.split(".").pop()?.toLowerCase() ?? "bin";
}

export function cleanLogValue(value: unknown) {
  if (typeof value !== "string") return value;
  return value.replace(/https?:\/\/[^\s]+token=[^\s]+/gi, "[signed-url]");
}
