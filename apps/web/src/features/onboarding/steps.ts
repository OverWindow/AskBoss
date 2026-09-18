import { z } from "zod";
import { handleSchema } from "@askboss/shared";
export const USER_STEPS=["U1","U2","U3","U4","U5","U6"] as const;
export const BOSS_STEPS=["B1","B2","B3","B4","B5","B6","B7","B8","B9","B10"] as const;
const schemas:Record<string,z.ZodTypeAny>={U1:handleSchema,U2:z.number(),U3:z.string().min(1),U4:z.string().min(1),U5:z.string().min(1),U6:z.array(z.string()),B1:z.string().min(1),B2:z.string().trim().min(1),B3:z.string().min(1),B4:z.string().min(1),B5:z.string().min(1),B6:z.string().trim().min(1),B7:z.number(),B8:z.number().min(0).max(100),B9:z.number().min(-100).max(100),B10:z.any()};
export function stepValue(step:string,draft:any){const map:Record<string,unknown>={U1:draft.profile.handle,U2:draft.profile.ageBand,U3:draft.profile.yearsOfServiceBand,U4:draft.profile.rank,U5:draft.profile.entryPath,U6:draft.profile.weaknesses,B1:draft.boss.avatarKey,B2:draft.boss.alias,B3:draft.boss.jobFunction,B4:draft.boss.yearsOfServiceBand,B5:draft.boss.rank,B6:draft.boss.companyName,B7:draft.boss.ageBand,B8:draft.boss.hierarchyScore,B9:draft.boss.genderBalanceScore,B10:true};return map[step];}
export function validateStep(step:string,draft:any){const result=schemas[step]?.safeParse(stepValue(step,draft));return result?.success?null:result?.error.issues[0]?.message??"값을 확인해 주세요.";}
