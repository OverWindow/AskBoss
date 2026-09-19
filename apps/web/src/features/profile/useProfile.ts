import { useQuery } from "@tanstack/react-query";
import type { UserProfile } from "@askboss/shared";
import { api } from "../../services/api-client";

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ["profile"],
    queryFn: () => api<{ profile: UserProfile | null }>("/profile").then((response) => response.profile),
    enabled,
  });
}
