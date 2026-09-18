import { useQuery } from "@tanstack/react-query";
import { ensureSession } from "../../services/api-client";
export function useSession(){return useQuery({queryKey:["session"],queryFn:ensureSession,staleTime:Infinity});}
