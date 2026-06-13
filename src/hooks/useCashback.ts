import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getClientCashbackHistory,
  adjustCashback,
  spendCashback,
  setParticipantCashbackPercent,
  setEventCashbackPercent,
  type CashbackTransaction,
} from "@/lib/supabase/queries/cashback"
import { supabase } from "@/lib/supabase/client"
import { CLIENTS_KEY } from "@/hooks/useClients"
import { EVENTS_KEY, PARTICIPANTS_KEY } from "@/hooks/useEvents"

export const CLIENT_CASHBACK_KEY = ["client-cashback"] as const

export const CASHBACK_HISTORY_KEY = ["cashback", "history"] as const

export function useCashbackHistory(clientId: string | null | undefined) {
  return useQuery<CashbackTransaction[]>({
    queryKey: [...CASHBACK_HISTORY_KEY, clientId],
    queryFn: () => getClientCashbackHistory(clientId!),
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useAdjustCashback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { clientId: string; amount: number; type: "add" | "subtract"; description: string }) =>
      adjustCashback(vars.clientId, vars.amount, vars.type, vars.description),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...CASHBACK_HISTORY_KEY, vars.clientId] })
      qc.invalidateQueries({ queryKey: CLIENTS_KEY })
      qc.invalidateQueries({ queryKey: ['client-journey', vars.clientId] })
    },
  })
}

export function useSetParticipantCashbackPercent(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { participantId: string; percent: number | null }) =>
      setParticipantCashbackPercent(vars.participantId, vars.percent),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PARTICIPANTS_KEY, eventId] })
    },
  })
}

export function useSetEventCashbackPercent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { eventId: string; percent: number }) =>
      setEventCashbackPercent(vars.eventId, vars.percent),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: [...EVENTS_KEY, vars.eventId] })
      qc.invalidateQueries({ queryKey: EVENTS_KEY })
    },
  })
}

export function useSpendCashback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: spendCashback,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: CLIENTS_KEY })
      qc.invalidateQueries({ queryKey: [...CASHBACK_HISTORY_KEY, vars.clientId] })
      qc.invalidateQueries({ queryKey: [...CLIENT_CASHBACK_KEY, vars.clientId] })
      qc.invalidateQueries({ queryKey: PARTICIPANTS_KEY })
      qc.invalidateQueries({ queryKey: ['client-journey', vars.clientId] })
    },
  })
}

export function useClientCashbackBalance(clientId: string | null | undefined) {
  return useQuery<number>({
    queryKey: [...CLIENT_CASHBACK_KEY, clientId],
    queryFn: async () => {
      if (!clientId) return 0
      const { data } = await supabase
        .from("clients")
        .select("cashback_balance")
        .eq("id", clientId)
        .single()
      return Number(data?.cashback_balance ?? 0)
    },
    enabled: !!clientId,
    staleTime: 1000 * 30,
  })
}
