import { env } from "../config/env.js";
import { store } from "../repositories/index.js";
import type { AnalyticsEventInput, BossRecord, UserProfile } from "../types.js";
import { classifyRankGap, computeRepeatedSimulationTypes, computeSurfaceActualGap, type GapRow, type SurfaceActualGapResult } from "../utils/hr-aggregation.js";
import { hmac } from "../utils/security.js";

export { computeRepeatedSimulationTypes, computeSurfaceActualGap, type GapRow, type SurfaceActualGapResult };

function ageGap(user?:number|null,boss?:number|null){if(!user||!boss)return null;const gap=Math.abs(boss-user);return gap<=5?"0~5년":gap<=10?"6~10년":gap<=20?"11~20년":"20년+";}
function sameJobFunction(user?:string|null,boss?:string|null){if(!user||!boss)return null;return user===boss?"SAME":"DIFF";}
export async function track(sessionId:string,feature:string,profile:UserProfile|null,boss:BossRecord,extra:Partial<AnalyticsEventInput>={}){await store.trackAnalytics(hmac(sessionId,env.ANALYTICS_HMAC_SECRET,"analytics"),{eventType:"AI_REQUEST",feature,userAgeBand:profile?.ageBand,bossAgeBand:boss.ageBand,rankGapBucket:classifyRankGap(profile?.rank,boss.rank),ageGapBucket:ageGap(profile?.ageBand,boss.ageBand),sameJobFunctionBucket:sameJobFunction(profile?.jobFunction,boss.jobFunction),userJobFunction:profile?.jobFunction||null,bossJobFunction:boss.jobFunction||null,topicKeywords:[],personaConfidenceBucket:boss.pki?boss.pki.score>=75?"HIGH":boss.pki.score>=40?"MEDIUM":"LOW":null,...extra});}
