import type { FastifyInstance } from "fastify";
export async function requestContext(app:FastifyInstance){app.addHook("onRequest",async(request,reply)=>{reply.header("x-request-id",request.id);reply.header("x-content-type-options","nosniff");reply.header("referrer-policy","same-origin");});}
