const API_PATH_QUERY = "_vercel_api_path";

/**
 * Restores the public API URL after Vercel rewrites every nested /api/* route
 * to the single api/entry.ts function.
 */
export function restoreRewrittenApiUrl(requestUrl: string | undefined): string | undefined {
  if (!requestUrl) return requestUrl;

  const url = new URL(requestUrl, "http://vercel.internal");
  const rewrittenPath = url.searchParams.get(API_PATH_QUERY);
  if (rewrittenPath === null) return requestUrl;

  url.searchParams.delete(API_PATH_QUERY);
  const apiPath = rewrittenPath.replace(/^\/+/, "");
  const query = url.searchParams.toString();
  return `/api/${apiPath}${query ? `?${query}` : ""}`;
}
