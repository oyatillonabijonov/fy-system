import { useQuery } from "@tanstack/react-query"
import {
  getParticipantPayments,
  getEventPayments,
  getClientParticipations,
} from "@/lib/supabase/queries/payments"

export const PAYMENTS_KEY = (participantId: string) =>
  ["payments", participantId] as const
export const EVENT_PAYMENTS_KEY = (eventId: string) =>
  ["event-payments", eventId] as const

export function useParticipantPayments(participantId: string) {
  return useQuery({
    queryKey: PAYMENTS_KEY(participantId),
    queryFn:  () => getParticipantPayments(participantId),
    enabled:  Boolean(participantId),
  })
}

export function useEventPayments(eventId: string) {
  return useQuery({
    queryKey: EVENT_PAYMENTS_KEY(eventId),
    queryFn:  () => getEventPayments(eventId),
    enabled:  Boolean(eventId),
  })
}

export const CLIENT_PARTICIPATIONS_KEY = (clientId: string) =>
  ["client-participations", clientId] as const

export function useClientParticipations(clientId: string) {
  return useQuery({
    queryKey: CLIENT_PARTICIPATIONS_KEY(clientId),
    queryFn:  () => getClientParticipations(clientId),
    enabled:  Boolean(clientId),
  })
}
