import type { ZodType } from "zod";
import { HttpError } from "./http.js";
export function parse<T>(schema:ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new HttpError(400,result.error.issues[0]?.message??"입력값을 확인해 주세요.","VALIDATION_ERROR");return result.data;}
