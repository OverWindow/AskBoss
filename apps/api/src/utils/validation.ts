import type { ZodIssue, ZodType } from "zod";
import { HttpError } from "./http.js";

function validationMessage(issue:ZodIssue|undefined){
  if(!issue)return "입력값을 확인해 주세요.";
  if(/[가-힣]/.test(issue.message))return issue.message;
  switch(issue.code){
    case "invalid_type":return "입력값의 형식이 올바르지 않습니다.";
    case "too_small":return "입력값이 너무 짧거나 작습니다. 최소 조건을 확인해 주세요.";
    case "too_big":return "입력값이 너무 길거나 큽니다. 최대 조건을 확인해 주세요.";
    case "invalid_format":return "입력값의 형식이 올바르지 않습니다.";
    case "invalid_value":return "허용된 값 중 하나를 선택해 주세요.";
    case "unrecognized_keys":return "허용되지 않은 입력 항목이 포함되어 있습니다.";
    default:return "입력값을 확인해 주세요.";
  }
}

export function parse<T>(schema:ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw new HttpError(400,validationMessage(result.error.issues[0]),"VALIDATION_ERROR");return result.data;}
