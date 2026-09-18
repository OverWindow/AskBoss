import { buildApp } from "./app";
import { env,hasAi } from "./config/env";
import { ai } from "./services/ai";
const app=buildApp();
try{await app.listen({port:env.PORT,host:"0.0.0.0"});if(hasAi){const health=await ai.health();if(!health.ok)app.log.warn({missing:health.missing},"Required AI model not available in Mindlogic tenant");}}catch(error){app.log.error(error);process.exit(1);}
