import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { store } from "../repositories/index.js";
import { HttpError } from "../utils/http.js";
import { hmac, randomToken } from "../utils/security.js";

const COOKIE = "askboss_admin";
const EIGHT_HOURS = 8 * 60 * 60_000;

function configured() {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) throw new HttpError(503, "관리자 비밀번호가 설정되지 않았습니다.", "ADMIN_NOT_CONFIGURED");
  return { password: env.ADMIN_PASSWORD, secret: env.ADMIN_SESSION_SECRET };
}

function matches(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function adminSourceKey(request: Pick<FastifyRequest, "ip">) {
  return env.ADMIN_SESSION_SECRET
    ? hmac(request.ip, env.ADMIN_SESSION_SECRET, "admin-ip")
    : createHash("sha256").update(`askboss-admin:${request.ip}`).digest("hex");
}

export function assertAdminOrigin(request: FastifyRequest) {
  const origin = request.headers.origin;
  if (!origin) throw new HttpError(403, "요청 출처를 확인할 수 없습니다.", "INVALID_ORIGIN");
  if (origin === env.WEB_ORIGIN) return;
  if (env.NODE_ENV !== "production") {
    try {
      const url = new URL(origin);
      if (["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:") return;
    } catch {
      // Invalid origins fail closed below.
    }
  }
  throw new HttpError(403, "허용되지 않은 요청 출처입니다.", "INVALID_ORIGIN");
}

export async function loginAdmin(request: FastifyRequest, reply: FastifyReply, password: string) {
  const { password: expected, secret } = configured();
  const ipHash = adminSourceKey(request);
  const attempt = await store.getAdminLoginAttempt(ipHash);
  if (attempt?.lockedUntil && Date.parse(attempt.lockedUntil) > Date.now()) throw new HttpError(429, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.", "ADMIN_LOCKED");
  if (!matches(password, expected)) {
    const failure = await store.recordAdminLoginFailure(ipHash);
    if (failure.lockedUntil && Date.parse(failure.lockedUntil) > Date.now()) throw new HttpError(429, "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.", "ADMIN_LOCKED");
    throw new HttpError(401, "비밀번호가 올바르지 않습니다.", "INVALID_ADMIN_PASSWORD");
  }
  await store.clearAdminLoginFailures(ipHash);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + EIGHT_HOURS).toISOString();
  await store.createAdminSession(hmac(token, secret, "admin-session"), ipHash, expiresAt);
  reply.setCookie(COOKIE, token, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: EIGHT_HOURS / 1000 });
  return { authenticated: true as const, expiresAt };
}

export async function optionalAdmin(request: FastifyRequest) {
  if (!env.ADMIN_SESSION_SECRET) return null;
  const token = request.cookies[COOKIE];
  if (!token) return null;
  return store.findAdminSession(hmac(token, env.ADMIN_SESSION_SECRET, "admin-session"));
}

export async function requireAdmin(request: FastifyRequest) {
  const session = await optionalAdmin(request);
  if (!session) throw new HttpError(401, "관리자 로그인이 필요합니다.", "ADMIN_AUTH_REQUIRED");
  return session;
}

export async function logoutAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (env.ADMIN_SESSION_SECRET) {
    const token = request.cookies[COOKIE];
    if (token) await store.deleteAdminSession(hmac(token, env.ADMIN_SESSION_SECRET, "admin-session"));
  }
  reply.clearCookie(COOKIE, { path: "/", sameSite: "strict" });
}
