import { hasAi } from "../../config/env.js";
import { FakeAiService } from "./fake.js";
import { MindlogicAiService } from "./mindlogic.js";
export const ai = hasAi ? new MindlogicAiService() : new FakeAiService();
export type { AiService } from "./types.js";
