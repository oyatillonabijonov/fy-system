import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getParticipantPayments, addPayment, deletePayment } from "@/lib/supabase/queries/payments"
import { PARTICIPANTS_KEY } from "@/hooks/useEvents"

export const PAYMENTS_KEY = (participantId: string) =>
  ["payments", participantId] as const

export function useParticipantPayments(participantId: string) {
  return useQuery({
    queryKey: PAYMENTS_KEY(participantId),
    queryFn:  () => getParticipantPayments(participantId),
    enabled:  Boolean(participantId),
  })
}

export function useAddPayment(participantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addPayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(participantId) })
      qc.invalidateQueries({ queryKey: PARTICIPANTS_KEY })
    },
  })
}

export function useDeletePayment(participantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENTS_KEY(participantId) })
      qc.invalidateQueries({ queryKey: PARTICIPANTS_KEY })
    },
  })
}
