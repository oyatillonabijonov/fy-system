import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CLIENTS_KEY } from "@/hooks/useClients"
import {
  getSmsRecipients, getEventClientIds, getPipelineClientIds, getSmsTemplates, saveSmsTemplate, submitSmsTemplate, hideSmsTemplate,
  deleteSmsTemplate, syncSmsTemplates, sendSmsTemplate, cancelSmsCampaign, getSmsCampaigns, getSmsMessages, getClientSms, setSmsOptOut,
} from "@/lib/supabase/queries/sms"

export const SMS_KEY = ["sms"] as const

export const useSmsRecipients = () =>
  useQuery({ queryKey: [...SMS_KEY, "recipients"], queryFn: getSmsRecipients, refetchOnMount: true })

export const useEventClientIds = (eventId: string | null) =>
  useQuery({ queryKey: [...SMS_KEY, "event", eventId], queryFn: () => getEventClientIds(eventId!), enabled: !!eventId })

export const usePipelineClientIds = (pipelineId: string | null, stageId: string | null) =>
  useQuery({ queryKey: [...SMS_KEY, "pipeline", pipelineId, stageId], queryFn: () => getPipelineClientIds(pipelineId!, stageId), enabled: !!pipelineId })

/** Polls while a template waits for Eskiz, so the state changes by itself */
export const useSmsTemplates = () =>
  useQuery({
    queryKey: [...SMS_KEY, "templates"], queryFn: getSmsTemplates, refetchOnMount: true,
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === "moderation") ? 30_000 : false),
  })

function useSmsMutation<V>(fn: (v: V) => Promise<unknown>, success?: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, meta: success ? { success } : undefined, onSettled: () => qc.invalidateQueries({ queryKey: SMS_KEY }) })
}

export const useSaveSmsTemplate = () =>
  useSmsMutation((t: Parameters<typeof saveSmsTemplate>[0]) => saveSmsTemplate(t).then(() => (t.submit ? syncSmsTemplates().catch(() => {}) : undefined)), "Shablon saqlandi")
export const useSubmitSmsTemplate = () =>
  useSmsMutation((id: string) => submitSmsTemplate(id).then(() => syncSmsTemplates().catch(() => {})), "Eskiz'ga tasdiqlashga yuborildi")
export const useHideSmsTemplate = () => useSmsMutation(({ id, hidden }: { id: string; hidden: boolean }) => hideSmsTemplate(id, hidden))
export const useDeleteSmsTemplate = () => useSmsMutation((id: string) => deleteSmsTemplate(id), "Shablon o'chirildi")
export const useSyncSmsTemplates = () => useSmsMutation(() => syncSmsTemplates())

export function useSendSmsTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: sendSmsTemplate,
    meta: { success: (r, v) => (v as { sendAt: string | null }).sendAt ? `${(r as { queued: number }).queued} ta SMS rejalashtirildi` : `${(r as { queued: number }).queued} ta SMS navbatga qo'yildi` },
    onSettled: () => qc.invalidateQueries({ queryKey: SMS_KEY }),
  })
}

export const useCancelSmsCampaign = () => useSmsMutation((id: string) => cancelSmsCampaign(id), "Rejalashtirilgan SMS bekor qilindi")

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

/** Polls while an SMS is still on its way (no realtime for sms_messages: a bulk send would flood the live channel) */
export const useClientSms = (clientId: string | null) =>
  useQuery({
    queryKey: [...SMS_KEY, "client", clientId], queryFn: () => getClientSms(clientId!), enabled: !!clientId, refetchOnMount: true,
    refetchInterval: (q) => (q.state.data?.some((m) => m.status === "queued" || m.status === "sent") ? 15_000 : false),
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
