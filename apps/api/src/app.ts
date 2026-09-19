import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { env } from "./config/env.js";
import { corsPlugin } from "./plugins/cors.js";
import { errorHandler } from "./plugins/error-handler.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { requestContext } from "./plugins/request-context.js";
import { sessionRoutes } from "./routes/session.js";
import { profileRoutes } from "./routes/profile.js";
import { bossRoutes } from "./routes/bosses.js";
import { companyRoutes } from "./routes/company.js";
import { uploadRoutes } from "./routes/uploads.js";
import { evidenceRoutes } from "./routes/evidence.js";
import { surveyRoutes } from "./routes/survey.js";
import { personaRoutes } from "./routes/persona.js";
import { jobRoutes } from "./routes/jobs.js";
import { chatRoutes } from "./routes/chat.js";
import { monologueRoutes } from "./routes/monologue.js";
import { translationRoutes } from "./routes/translations.js";
import { hrRoutes } from "./routes/hr.js";
import { healthRoutes } from "./routes/health.js";
import { internalRoutes } from "./routes/internal.js";
import { adminRoutes } from "./routes/admin.js";
import { archiveRoutes } from "./routes/archives.js";

export function buildApp(){
  const app=Fastify({logger:{level:env.NODE_ENV==="test"?"silent":"info",redact:["req.headers.cookie","req.headers.authorization","res.headers.set-cookie"]},trustProxy:true});
  void app.register(cookie);void app.register(corsPlugin);void app.register(rateLimitPlugin);void app.register(requestContext);void errorHandler(app);
  const routes=[sessionRoutes,profileRoutes,bossRoutes,companyRoutes,uploadRoutes,evidenceRoutes,surveyRoutes,personaRoutes,jobRoutes,chatRoutes,monologueRoutes,translationRoutes,archiveRoutes,hrRoutes,healthRoutes,internalRoutes,adminRoutes];
  for(const route of routes)void app.register(route,{prefix:"/api"});
  return app;
}
