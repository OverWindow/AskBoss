import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../apps/api/src/app.js";
import { restoreRewrittenApiUrl } from "../apps/api/src/utils/vercel-request.js";

const app = buildApp();

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  request.url = restoreRewrittenApiUrl(request.url);
  await app.ready();
  app.server.emit("request", request, response);
}
