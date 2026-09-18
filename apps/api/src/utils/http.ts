import type { FastifyReply, FastifyRequest } from "fastify";

export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code = "REQUEST_ERROR") { super(message); }
}

export function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
  const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
  return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message } });
}

export function bearer(request: FastifyRequest) {
  const value = request.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}
