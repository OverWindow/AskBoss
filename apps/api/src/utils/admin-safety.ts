export function safeJobFailureReason(value: string | null | undefined): string | null {
  if (!value) return null;
  const message = value.toLocaleLowerCase("en");
  if (message.includes("timeout") || message.includes("timed out") || message.includes("abort")) return "AI 응답 시간 초과";
  if (message.includes("429") || message.includes("rate limit") || message.includes("quota")) return "AI 호출 한도 초과";
  if (message.includes("401") || message.includes("403") || message.includes("api key") || message.includes("unauthorized")) return "AI 인증 또는 권한 오류";
  if (message.includes("json") || message.includes("zod") || message.includes("parse") || message.includes("schema") || message.includes("validation")) return "AI 응답 형식 오류";
  if (message.includes("storage") || message.includes("upload") || message.includes("file")) return "파일 처리 오류";
  if (message.includes("postgres") || message.includes("database") || message.includes("connect") || message.includes("econn")) return "데이터베이스 연결 오류";
  return "처리 중 알 수 없는 오류";
}

export function summarizeJobFailures(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const reason = safeJobFailureReason(value) ?? "처리 중 알 수 없는 오류";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((left, right) => right.count - left.count);
}
