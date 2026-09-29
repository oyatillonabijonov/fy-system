import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getTelegramGroups, addTelegramGroup, updateTelegramGroup, deleteTelegramGroup, type TelegramGroup,
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
