import { useQuery } from "@tanstack/react-query"
import { getClientParticipations } from "@/lib/supabase/queries/payments"

export const CLIENT_PARTICIPATIONS_KEY = (clientId: string) =>
  ["client-participations", clientId] as const

export function useClientParticipations(clientId: string) {
  return useQuery({
    queryKey: CLIENT_PARTICIPATIONS_KEY(clientId),
    queryFn:  () => getClientParticipations(clientId),
    enabled:  Boolean(clientId),
  })
}
