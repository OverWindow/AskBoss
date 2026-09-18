import OpenAI from "openai";
import { z, type ZodType } from "zod";
import { bossPersonaSchema,companyResearchSchema,extractedEvidenceSchema,surveyQuestionsSchema,translationResultSchema } from "@askboss/shared";
import { env } from "../../config/env";
import { companyPrompt } from "../../prompts/company";
import { evidencePrompt } from "../../prompts/evidence";
import { personaPrompt } from "../../prompts/persona";
import { surveyPrompt } from "../../prompts/survey";
import { chatPrompt } from "../../prompts/chat";
import { translatorPrompt } from "../../prompts/translator";
import { monologuePrompt } from "../../prompts/monologue";
import { hrSummaryPrompt } from "../../prompts/hr-summary";
import type { AiService, BossChatInput } from "./types";

export class MindlogicAiService implements AiService {
  private client=new OpenAI({apiKey:env.MINDLOGIC_API_KEY!,baseURL:env.MINDLOGIC_BASE_URL,maxRetries:0,timeout:90_000});
  private async text(model:string,prompt:string,signal?:AbortSignal){const result=await this.client.chat.completions.create({model,messages:[{role:"user",content:prompt}],temperature:.4},{signal});return result.choices[0]?.message.content??"";}
  private parse<T>(raw:string,schema:ZodType<T>){const cleaned=raw.replace(/^```json\s*|\s*```$/g,"");return schema.parse(JSON.parse(cleaned));}
  private async validateOrRepair<T>(model:string,raw:string,schema:ZodType<T>,signal?:AbortSignal){try{return this.parse(raw,schema);}catch(error){const jsonSchema=JSON.stringify(z.toJSONSchema(schema));const repaired=await this.text(model,`다음 응답을 제공된 JSON Schema에 맞는 유효한 JSON으로 한 번만 복구하라. 설명이나 Markdown 없이 JSON 객체만 반환하라.\nJSON Schema: ${jsonSchema}\n검증 오류: ${error instanceof Error?error.message:"invalid"}\n원본 응답: ${raw}`,signal);return this.parse(repaired,schema);}}
  private async structured<T>(model:string,prompt:string,schema:ZodType<T>,signal?:AbortSignal){return this.validateOrRepair(model,await this.text(model,prompt,signal),schema,signal);}
  researchCompany(name:string){return this.structured(env.AI_COMPANY_RESEARCH_MODEL,companyPrompt(name),companyResearchSchema);}
  async extractEvidence(input:{content:string;kind:string}){
    if(input.kind!=="IMAGE")return this.structured(env.AI_PRIMARY_MODEL,evidencePrompt(input.content),extractedEvidenceSchema);
    const url=input.content.replace(/^이미지 URL:\s*/,"");
    const response=await this.client.chat.completions.create({model:env.AI_PRIMARY_MODEL,temperature:.2,messages:[{role:"user",content:[{type:"text",text:evidencePrompt("첨부 이미지의 대화 내용을 분석하라.")},{type:"image_url",image_url:{url}}]}]});
    return this.validateOrRepair(env.AI_PRIMARY_MODEL,response.choices[0]?.message.content??"",extractedEvidenceSchema);
  }
  buildPersona(input:any){return this.structured(env.AI_PRIMARY_MODEL,personaPrompt(input),bossPersonaSchema);}
  generateSurvey(boss:any){return this.structured(env.AI_PRIMARY_MODEL,surveyPrompt(boss),surveyQuestionsSchema);}
  async *streamChatWithBoss(input:BossChatInput,signal?:AbortSignal){
    const {message,...context}=input;
    const stream=await this.client.chat.completions.create({model:env.AI_PRIMARY_MODEL,messages:[{role:"user",content:`${chatPrompt(context)}\n사용자: ${message}\n상사:`}],temperature:.4,stream:true},{signal});
    for await(const part of stream){
      if(signal?.aborted)throw signal.reason;
      const content=part.choices[0]?.delta?.content;
      if(content)yield content;
    }
  }
  translateBossMessage(input:any,signal?:AbortSignal){return this.structured(env.AI_PRIMARY_MODEL,translatorPrompt(input),translationResultSchema,signal);}
  generateMonologue(input:any){return this.text(env.AI_PRIMARY_MODEL,monologuePrompt(input));}
  generateHrSummary(data:any){return this.text(env.AI_PRIMARY_MODEL,hrSummaryPrompt(data));}
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
