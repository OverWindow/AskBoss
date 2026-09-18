const base = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: "include",
    headers,
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
}

export async function ensureSession() {
  try {
    return await api<{ session: { id: string; expiresAt: string } }>("/session");
  } catch {
    return api<{ session: { id: string; expiresAt: string } }>("/session", { method: "POST" });
  }
}
