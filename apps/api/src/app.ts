import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { env } from "./config/env";
import { corsPlugin } from "./plugins/cors";
import { errorHandler } from "./plugins/error-handler";
import { rateLimitPlugin } from "./plugins/rate-limit";
import { requestContext } from "./plugins/request-context";
import { sessionRoutes } from "./routes/session";
import { profileRoutes } from "./routes/profile";
import { bossRoutes } from "./routes/bosses";
import { companyRoutes } from "./routes/company";
import { uploadRoutes } from "./routes/uploads";
import { evidenceRoutes } from "./routes/evidence";
import { surveyRoutes } from "./routes/survey";
import { personaRoutes } from "./routes/persona";
import { jobRoutes } from "./routes/jobs";
import { chatRoutes } from "./routes/chat";
import { monologueRoutes } from "./routes/monologue";
import { translationRoutes } from "./routes/translations";
import { hrRoutes } from "./routes/hr";
import { healthRoutes } from "./routes/health";
import { internalRoutes } from "./routes/internal";
import { adminRoutes } from "./routes/admin";

export function buildApp(){
  const app=Fastify({logger:{level:env.NODE_ENV==="test"?"silent":"info",redact:["req.headers.cookie","req.headers.authorization","res.headers.set-cookie"]},trustProxy:true});
  void app.register(cookie);void app.register(corsPlugin);void app.register(rateLimitPlugin);void app.register(requestContext);void errorHandler(app);
  const routes=[sessionRoutes,profileRoutes,bossRoutes,companyRoutes,uploadRoutes,evidenceRoutes,surveyRoutes,personaRoutes,jobRoutes,chatRoutes,monologueRoutes,translationRoutes,hrRoutes,healthRoutes,internalRoutes,adminRoutes];
  for(const route of routes)void app.register(route,{prefix:"/api"});
  return app;
}
