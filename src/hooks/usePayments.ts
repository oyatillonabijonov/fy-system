import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getParticipantPayments,
  getEventPayments,
  getRecentPayments,
  getClientParticipations,
  addPayment,
  deletePayment,
} from "@/lib/supabase/queries/payments"
import { PARTICIPANTS_KEY, EVENTS_KEY, EVENT_COUNTS_KEY } from "@/hooks/useEvents"
import { CLIENTS_KEY } from "@/hooks/useClients"

export const PAYMENTS_KEY = (participantId: string) =>
  ["payments", participantId] as const
export const EVENT_PAYMENTS_KEY = (eventId: string) =>
  ["event-payments", eventId] as const
export const RECENT_PAYMENTS_KEY = ["recent-payments"] as const

// Money must never look stale: invalidate every place a payment is reflected.
function invalidatePaymentViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["event-payments"] })
  qc.invalidateQueries({ queryKey: RECENT_PAYMENTS_KEY })
  qc.invalidateQueries({ queryKey: PARTICIPANTS_KEY })
  qc.invalidateQueries({ queryKey: CLIENTS_KEY })          // cashback balances / total_spent
  qc.invalidateQueries({ queryKey: ["client-journey"] })
  qc.invalidateQueries({ queryKey: EVENTS_KEY })
  qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
}

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

export function useRecentPayments(limit = 50) {
  return useQuery({
    queryKey: [...RECENT_PAYMENTS_KEY, limit] as const,
    queryFn:  () => getRecentPayments(limit),
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

export function useAddPayment(participantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addPayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(participantId) })
      invalidatePaymentViews(qc)
    },
  })
}

export function useDeletePayment(participantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(participantId) })
      invalidatePaymentViews(qc)
    },
  })
}
