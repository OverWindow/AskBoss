const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

export async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  if (requestOptions.body !== undefined && !(requestOptions.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    const response = await fetch(`${base}${path}`, {
      ...requestOptions,
      credentials: "include",
      headers,
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
      throw new ApiError(
        response.status,
        data?.error?.code ?? "REQUEST_ERROR",
        data?.error?.message ?? "요청을 처리하지 못했습니다.",
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError(0, "REQUEST_TIMEOUT", "응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
    if (externalSignal?.aborted) throw new ApiError(0, "REQUEST_ABORTED", "요청이 취소되었습니다.");
    throw new ApiError(0, "API_UNAVAILABLE", "API 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function ensureSession() {
  try {
    return await api<{ session: { id: string; expiresAt: string } }>("/session");
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    return api<{ session: { id: string; expiresAt: string } }>("/session", { method: "POST" });
  }
}
