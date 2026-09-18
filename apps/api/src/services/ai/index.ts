import { hasAi } from "../../config/env";
import { FakeAiService } from "./fake";
import { MindlogicAiService } from "./mindlogic";
export const ai = hasAi ? new MindlogicAiService() : new FakeAiService();
export type { AiService } from "./types";
