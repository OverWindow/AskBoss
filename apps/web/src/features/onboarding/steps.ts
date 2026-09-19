import { z } from "zod";
import { handleSchema } from "@askboss/shared";
export const USER_STEPS=["U1","U2","U3","U4","U5","U6","U7"] as const;
export const BOSS_STEPS=["B1","B2","B3","B4","B5","B6","B7","B8","B9"] as const;
const schemas:Record<string,z.ZodTypeAny>={U1:handleSchema,U2:z.number(),U3:z.string().min(1),U4:z.string().min(1),U5:z.string().min(1),U6:z.string().min(1),U7:z.array(z.string()),B1:z.string().min(1),B2:z.string().trim().min(1),B3:z.string().min(1),B4:z.string().min(1),B5:z.string().min(1),B6:z.string().trim().min(1),B7:z.number(),B8:z.number().min(0).max(100),B9:z.any()};
const validationMessages:Record<string,string>={
  U1:"사용자 ID는 3~20자의 한글, 영문, 숫자, 밑줄(_), 하이픈(-)으로 입력해 주세요.",
  U2:"나이대를 선택해 주세요.",
  U3:"회사 생활 연차를 선택해 주세요.",
  U4:"내 직무를 선택해 주세요.",
  U5:"현재 직급을 선택해 주세요.",
  U6:"입사 경로를 선택해 주세요.",
  U7:"업무 대화에서 어려운 점을 선택해 주세요.",
  B1:"상사의 모습을 선택해 주세요.",
  B2:"상사를 부를 이름을 입력해 주세요.",
  B3:"상사의 직무를 선택해 주세요.",
  B4:"상사의 연차를 선택해 주세요.",
  B5:"상사의 직급을 선택해 주세요.",
  B6:"회사 이름을 입력해 주세요.",
  B7:"상사의 나이대를 선택해 주세요.",
  B8:"조직의 위계 정도를 0~100 사이에서 선택해 주세요.",
  B9:"입력값을 확인해 주세요.",
};
export function stepValue(step:string,draft:any){const map:Record<string,unknown>={U1:draft.profile.handle,U2:draft.profile.ageBand,U3:draft.profile.yearsOfServiceBand,U4:draft.profile.jobFunction,U5:draft.profile.rank,U6:draft.profile.entryPath,U7:draft.profile.weaknesses,B1:draft.boss.avatarKey,B2:draft.boss.alias,B3:draft.boss.jobFunction,B4:draft.boss.yearsOfServiceBand,B5:draft.boss.rank,B6:draft.boss.companyName,B7:draft.boss.ageBand,B8:draft.boss.hierarchyScore,B9:true};return map[step];}
export function validateStep(step:string,draft:any){const result=schemas[step]?.safeParse(stepValue(step,draft));return result?.success?null:validationMessages[step]??"입력값을 확인해 주세요.";}
