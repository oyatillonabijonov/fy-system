import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { pbxApi } from "@/lib/supabase/queries/sotuv"
import { USERS_KEY } from "@/hooks/useUsers"
import {
  getTelegramGroups, addTelegramGroup, updateTelegramGroup, deleteTelegramGroup, type TelegramGroup,
  getLeadSources, updateLeadSource, setStaffExt, type LeadSource, type PbxExt,
} from "@/lib/supabase/queries/integrations"

export const TELEGRAM_GROUPS_KEY = ["telegram-groups"] as const

// Groups appear when the bot is added to a chat — fetch fresh on every visit
export const useTelegramGroups = () =>
  useQuery({ queryKey: TELEGRAM_GROUPS_KEY, queryFn: getTelegramGroups, refetchOnMount: true, refetchOnWindowFocus: true })

export function useAddTelegramGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addTelegramGroup,
    meta: { success: "Guruh qo'shildi", silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: TELEGRAM_GROUPS_KEY }),
  })
}

/** Optimistic, so a switch flips at once */
export function useUpdateTelegramGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { chatId: number; patch: Partial<TelegramGroup> }) => updateTelegramGroup(v.chatId, v.patch),
    onMutate: async ({ chatId, patch }) => {
      await qc.cancelQueries({ queryKey: TELEGRAM_GROUPS_KEY })
      const prev = qc.getQueryData<TelegramGroup[]>(TELEGRAM_GROUPS_KEY)
      qc.setQueryData<TelegramGroup[]>(TELEGRAM_GROUPS_KEY, (old) => old?.map((g) => (g.chat_id === chatId ? { ...g, ...patch } : g)))
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(TELEGRAM_GROUPS_KEY, ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: TELEGRAM_GROUPS_KEY }),
  })
}

export function useDeleteTelegramGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteTelegramGroup,
    meta: { success: "Guruh ro'yxatdan olib tashlandi" },
    onSettled: () => qc.invalidateQueries({ queryKey: TELEGRAM_GROUPS_KEY }),
  })
}

export const LEAD_SOURCES_KEY = ["lead-sources"] as const

// Counters move as leads arrive — fetch fresh on every visit
export const useLeadSources = (enabled: boolean) =>
  useQuery({ queryKey: LEAD_SOURCES_KEY, queryFn: getLeadSources, enabled, refetchOnMount: true, refetchOnWindowFocus: true })

/** Optimistic, so the switch flips at once */
export function useUpdateLeadSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<Pick<LeadSource, "pipeline_id" | "enabled">> }) => updateLeadSource(v.id, v.patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: LEAD_SOURCES_KEY })
      const prev = qc.getQueryData<LeadSource[]>(LEAD_SOURCES_KEY)
      qc.setQueryData<LeadSource[]>(LEAD_SOURCES_KEY, (old) => old?.map((s) => (s.id === id ? { ...s, ...patch } : s)))
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(LEAD_SOURCES_KEY, ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: LEAD_SOURCES_KEY }),
  })
}

/** The PBX's internal numbers, live from OnlinePBX through amo-sync (admin) */
export const usePbxExts = (enabled: boolean) =>
  useQuery({ queryKey: ["pbx-exts"], queryFn: () => pbxApi<PbxExt[]>("exts"), enabled, refetchOnMount: true, retry: false })

export function useSetStaffExt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { userId: string; ext: string | null }) => setStaffExt(v.userId, v.ext),
    meta: { success: "Ichki raqam saqlandi" },
    onSettled: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}
