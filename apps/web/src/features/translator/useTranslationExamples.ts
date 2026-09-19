import { useQuery } from "@tanstack/react-query";
import type { TranslationExamplesSettings } from "@askboss/shared";
import { api } from "../../services/api-client";

export function useTranslationExamples(enabled = true) {
  return useQuery({
    queryKey: ["translation-examples"],
    queryFn: () => api<Pick<TranslationExamplesSettings, "examples">>("/translation-examples"),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
