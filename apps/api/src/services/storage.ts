import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { env, hasStorage } from "../config/env.js";
import { safeExtension } from "../utils/security.js";

class StorageService {
  private client:SupabaseClient|null=hasStorage?createClient(env.SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}}):null;
  path(sessionId:string,bossId:string,fileName:string,contentType:string){return `${sessionId}/${bossId}/${randomUUID()}.${safeExtension(fileName,contentType)}`;}
  globalPath(bossId:string,fileName:string,contentType:string){return `global/${bossId}/${randomUUID()}.${safeExtension(fileName,contentType)}`;}
  async createSignedUpload(path:string){ if(!this.client) return {signedUrl:null,token:null}; const {data,error}=await this.client.storage.from(env.SUPABASE_STORAGE_BUCKET).createSignedUploadUrl(path,{upsert:false}); if(error) throw error; return {signedUrl:data.signedUrl,token:data.token}; }
  async createSignedDownload(path:string){ if(!this.client) return null; const {data,error}=await this.client.storage.from(env.SUPABASE_STORAGE_BUCKET).createSignedUrl(path,300); if(error) throw error; return data.signedUrl; }
  async downloadText(path:string){ if(!this.client) return `[로컬 데모 업로드: ${path}]`; const {data,error}=await this.client.storage.from(env.SUPABASE_STORAGE_BUCKET).download(path); if(error) throw error; return data.text(); }
  async verify(path:string,size:number,contentType:string){
    if(!this.client)return true;
    const parts=path.split("/");const name=parts.pop()!;const folder=parts.join("/");
    const {data,error}=await this.client.storage.from(env.SUPABASE_STORAGE_BUCKET).list(folder,{search:name,limit:2});
    if(error)throw error;
    const objects=data as Array<{name:string;metadata?:{size?:unknown;mimetype?:unknown;contentType?:unknown}}>;
    const object=objects.find((item)=>item.name===name);
    const actualSize=Number(object?.metadata?.size??-1);
    const actualType=String(object?.metadata?.mimetype??object?.metadata?.contentType??"");
    return Boolean(object&&actualSize===size&&(!actualType||actualType===contentType));
  }
  async remove(paths:string[]){ if(this.client&&paths.length){ const {error}=await this.client.storage.from(env.SUPABASE_STORAGE_BUCKET).remove(paths); if(error) throw error; } }
}
export const storage=new StorageService();
