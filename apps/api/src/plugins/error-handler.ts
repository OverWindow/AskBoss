import type { FastifyInstance } from "fastify";
import { HttpError } from "../utils/http";
export async function errorHandler(app:FastifyInstance){app.setErrorHandler((error,_request,reply)=>{if(error instanceof HttpError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});if((error as any).code==="23505")return reply.code(409).send({error:{code:"CONFLICT",message:"이미 사용 중인 값입니다."}});app.log.error(error);return reply.code(500).send({error:{code:"INTERNAL_ERROR",message:"요청을 처리하지 못했습니다."}});});}
