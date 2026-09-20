import { useQuery } from "@tanstack/react-query";
import type { Boss } from "@askboss/shared";
import { api } from "../../services/api-client";
export function useBosses(enabled=true){return useQuery({queryKey:["bosses"],queryFn:()=>api<{bosses:Boss[]}>("/bosses").then((r)=>r.bosses),enabled,retry:false});}
