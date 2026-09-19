import OpenAI from "openai";
import { z, type ZodType } from "zod";
import { bossPersonaSchema,chatMessageCoachingSchema,companyResearchSchema,extractedEvidenceSchema,surveyQuestionsSchema,translationResultSchema } from "../../shared.js";
import { env } from "../../config/env.js";
import { companyPrompt } from "../../prompts/company.js";
import { evidencePrompt } from "../../prompts/evidence.js";
import { buildPersonaMessages } from "../../prompts/persona.js";
import { surveyPrompt } from "../../prompts/survey.js";
import { buildBossChatMessages } from "../../prompts/chat.js";
import { translatorPrompt } from "../../prompts/translator.js";
import { monologuePrompt } from "../../prompts/monologue.js";
import { hrSummaryPrompt } from "../../prompts/hr-summary.js";
import { simulationPrompt } from "../../prompts/simulation.js";
import { coachingPrompt } from "../../prompts/coaching.js";
import { bossSystemPrompt } from "../../prompts/shared.js";
import type { AiService, BossChatInput } from "./types.js";
import { plainTextValues, toPlainText } from "../../utils/plain-text.js";

export class MindlogicAiService implements AiService {
  private client=new OpenAI({apiKey:env.MINDLOGIC_API_KEY!,baseURL:env.MINDLOGIC_BASE_URL,maxRetries:0,timeout:120_000});
  private async text(model:string,prompt:string,signal?:AbortSignal,system?:string,temperature=.4){const result=await this.client.chat.completions.create({model,messages:[...(system?[{role:"system" as const,content:system}]:[]),{role:"user" as const,content:prompt}],temperature},{signal});return result.choices[0]?.message.content??"";}
  private parse<T>(raw:string,schema:ZodType<T>){const cleaned=raw.replace(/^```json\s*|\s*```$/g,"");return schema.parse(JSON.parse(cleaned));}
  private async validateOrRepair<T>(model:string,raw:string,schema:ZodType<T>,signal?:AbortSignal,temperature=.4){try{return this.parse(raw,schema);}catch(error){const jsonSchema=JSON.stringify(z.toJSONSchema(schema));const repaired=await this.text(model,`다음 응답을 제공된 JSON Schema에 맞는 유효한 JSON으로 한 번만 복구하라. 설명이나 Markdown 없이 JSON 객체만 반환하라.\nJSON Schema: ${jsonSchema}\n검증 오류: ${error instanceof Error?error.message:"invalid"}\n원본 응답: ${raw}`,signal,undefined,temperature);return this.parse(repaired,schema);}}
  private async structured<T>(model:string,prompt:string,schema:ZodType<T>,signal?:AbortSignal,system?:string,temperature=.4){return plainTextValues(await this.validateOrRepair(model,await this.text(model,prompt,signal,system,temperature),schema,signal,temperature));}
  researchCompany(name:string,promptInstruction?:string){return this.structured(env.AI_COMPANY_RESEARCH_MODEL,companyPrompt(name,promptInstruction),companyResearchSchema);}
  async extractEvidence(input:{content:string;kind:string;promptInstruction?:string}){
    if(input.kind!=="IMAGE")return this.structured(env.AI_PRIMARY_MODEL,evidencePrompt(input.content,input.promptInstruction),extractedEvidenceSchema);
    const url=input.content.replace(/^이미지 URL:\s*/,"");
    const response=await this.client.chat.completions.create({model:env.AI_PRIMARY_MODEL,temperature:.2,messages:[{role:"user",content:[{type:"text",text:evidencePrompt("첨부 이미지의 대화 내용을 분석하라.",input.promptInstruction)},{type:"image_url",image_url:{url}}]}]});
    return this.validateOrRepair(env.AI_PRIMARY_MODEL,response.choices[0]?.message.content??"",extractedEvidenceSchema);
  }
  buildPersona(input:any){const [system,user]=buildPersonaMessages(input);return this.structured(env.AI_PRIMARY_MODEL,user.content,bossPersonaSchema,undefined,system.content);}
  reviewUserMessage(input:any,signal?:AbortSignal){return this.structured(env.AI_PRIMARY_MODEL,coachingPrompt(input),chatMessageCoachingSchema,signal,undefined,0);}
  generateSurvey(boss:any,promptInstruction?:string){return this.structured(env.AI_PRIMARY_MODEL,surveyPrompt(boss,promptInstruction),surveyQuestionsSchema);}
  async *streamChatWithBoss(input:BossChatInput,signal?:AbortSignal){
    const stream=await this.client.chat.completions.create({model:env.AI_PRIMARY_MODEL,messages:[...buildBossChatMessages(input)],temperature:.4,stream:true},{signal});
    for await(const part of stream){
      if(signal?.aborted)throw signal.reason;
      const content=part.choices[0]?.delta?.content;
      if(content)yield content;
    }
  }
  async *streamSimulatedBossReaction(input:any,signal?:AbortSignal){const {basePrompt,globalBoss,...context}=input;const stream=await this.client.chat.completions.create({model:env.AI_PRIMARY_MODEL,messages:[{role:"system" as const,content:bossSystemPrompt(input.boss.scope,basePrompt,input.boss.scope==="SESSION"?globalBoss?.persona:undefined)},{role:"user",content:simulationPrompt(context)}],temperature:.4,stream:true},{signal});for await(const part of stream){if(signal?.aborted)throw signal.reason;const content=part.choices[0]?.delta?.content;if(content)yield content;}}
  translateBossMessage(input:any,signal?:AbortSignal){const {basePrompt,globalBoss,promptInstruction,...context}=input;return this.structured(env.AI_PRIMARY_MODEL,translatorPrompt(context,promptInstruction),translationResultSchema,signal,bossSystemPrompt(input.boss.scope,basePrompt,input.boss.scope==="SESSION"?globalBoss?.persona:undefined));}
  async generateMonologue(input:any){const {basePrompt,globalBoss,...context}=input;return toPlainText(await this.text(env.AI_PRIMARY_MODEL,monologuePrompt(context),undefined,bossSystemPrompt(input.boss.scope,basePrompt,input.boss.scope==="SESSION"?globalBoss?.persona:undefined)));}
  async generateHrSummary(data:any){return toPlainText(await this.text(env.AI_PRIMARY_MODEL,hrSummaryPrompt(data)));}
  async health(){
    const required=[env.AI_PRIMARY_MODEL,env.AI_COMPANY_RESEARCH_MODEL];
    try{
      const response=await fetch(`${env.MINDLOGIC_BASE_URL.replace(/\/$/,"")}/models/`,{headers:{Authorization:`Bearer ${env.MINDLOGIC_API_KEY}`},signal:AbortSignal.timeout(8_000)});
      if(!response.ok)return {ok:false,available:[],missing:required,mode:"live" as const};
      const json:any=await response.json();
      const available=(json.data??json.models??[]).map((model:any)=>typeof model==="string"?model:model.id);
      const missing=required.filter(model=>!available.includes(model));
      return {ok:missing.length===0,available,missing,mode:"live" as const};
    }catch{
      return {ok:false,available:[],missing:required,mode:"live" as const};
    }
  }
}
