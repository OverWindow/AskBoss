import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { hmac, randomToken } from "../utils/security.js";

const COOKIE = "boss_archive";
const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;

export function requireArchiveOwner(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[COOKIE] || randomToken();
  reply.setCookie(COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TEN_YEARS_SECONDS,
  });
  return hmac(token, env.SESSION_SECRET, "archive-owner");
}
