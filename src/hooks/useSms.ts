import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CLIENTS_KEY } from "@/hooks/useClients"
import {
  getSmsRecipients, getEventClientIds, getSmsTemplates, addSmsTemplate, deleteSmsTemplate,
  sendSms, getSmsCampaigns, getSmsMessages, setSmsOptOut, getEskizTemplates,
} from "@/lib/supabase/queries/sms"

export const SMS_KEY = ["sms"] as const

export const useSmsRecipients = () =>
  useQuery({ queryKey: [...SMS_KEY, "recipients"], queryFn: getSmsRecipients, refetchOnMount: true })

export const useEventClientIds = (eventId: string | null) =>
  useQuery({ queryKey: [...SMS_KEY, "event", eventId], queryFn: () => getEventClientIds(eventId!), enabled: !!eventId })

export const useSmsTemplates = () => useQuery({ queryKey: [...SMS_KEY, "templates"], queryFn: getSmsTemplates })

export const useEskizTemplates = () =>
  useQuery({ queryKey: [...SMS_KEY, "eskiz-templates"], queryFn: getEskizTemplates, refetchOnMount: true, retry: false })

export function useAddSmsTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addSmsTemplate,
    meta: { success: "Tayyor matn saqlandi" },
    onSettled: () => qc.invalidateQueries({ queryKey: [...SMS_KEY, "templates"] }),
  })
}

export function useDeleteSmsTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteSmsTemplate,
    onSettled: () => qc.invalidateQueries({ queryKey: [...SMS_KEY, "templates"] }),
  })
}

export function useSendSms() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: sendSms,
    meta: { success: (r) => `${(r as { queued: number }).queued} ta SMS navbatga qo'yildi` },
    onSettled: () => qc.invalidateQueries({ queryKey: SMS_KEY }),
  })
}

/** Polls while anything is still on its way, so statuses fill in by themselves */
export const useSmsCampaigns = (page: number) =>
  useQuery({
    queryKey: [...SMS_KEY, "campaigns", page],
    queryFn: () => getSmsCampaigns(page),
    refetchOnMount: true,
    refetchInterval: (q) => (q.state.data?.rows.some((c) => c.queued + c.sent > 0) ? 5000 : false),
  })

export const useSmsMessages = (filter: { campaignId?: string; clientId?: string }) =>
  useQuery({
    queryKey: [...SMS_KEY, "messages", filter],
    queryFn: () => getSmsMessages(filter),
    enabled: !!(filter.campaignId || filter.clientId),
    refetchOnMount: true,
  })

export function useSetSmsOptOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { clientId: string; optOut: boolean }) => setSmsOptOut(v.clientId, v.optOut),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: CLIENTS_KEY })
      qc.invalidateQueries({ queryKey: SMS_KEY })
    },
  })
}
