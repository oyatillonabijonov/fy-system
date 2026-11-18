import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/context/AuthContext"
import {
  deleteTgTemplate, getClientLeadId, getClientTelegram, getTgInbox, getTgAccounts, getTgTemplates, getTgUnread, saveTgTemplate, tgHook,
  type LoginState, type TgFileRef, type TgTemplate,
} from "@/lib/supabase/queries/telegram"

export const TG_KEY = ["telegram"] as const

export const useClientTelegram = (clientId: string | null) =>
  useQuery({ queryKey: [...TG_KEY, "client", clientId], queryFn: () => getClientTelegram(clientId!), enabled: !!clientId, refetchOnMount: true })
export const useTgInbox = () => useQuery({ queryKey: [...TG_KEY, "inbox"], queryFn: getTgInbox, refetchOnMount: true })
export const useClientLeadId = (clientId: string | null) =>
  useQuery({ queryKey: [...TG_KEY, "client-lead", clientId], queryFn: () => getClientLeadId(clientId!), enabled: !!clientId })

/** Unread chats on the bitimlar I own plus unowned ones: total, per bitim, and the list for "Javob kutyapti" */
export function useTgUnread() {
  const { user, hasAccess } = useAuth()
  const q = useQuery({ queryKey: [...TG_KEY, "unread"], queryFn: getTgUnread, enabled: hasAccess("sotuv-crmn"), refetchOnMount: true })
  return useMemo(() => {
    const mine = (q.data ?? []).filter((c) => !c.lead?.responsible_user_id || c.lead.responsible_user_id === user?.id)
    const byLead = new Map<string, number>()
    for (const c of q.data ?? []) byLead.set(c.lead_id, (byLead.get(c.lead_id) ?? 0) + c.unread)
    return { mine, byLead, total: mine.reduce((s, c) => s + c.unread, 0) }
  }, [q.data, user?.id])
}

export const useTgTemplates = () => useQuery({ queryKey: [...TG_KEY, "templates"], queryFn: getTgTemplates })
export const useTgAccounts = () => useQuery({ queryKey: [...TG_KEY, "accounts"], queryFn: getTgAccounts })
/** Is the Telegram widget configured on the server (TELEGRAM_API_ID/HASH)? */
export const useTgStatus = () =>
  useQuery({ queryKey: [...TG_KEY, "status"], queryFn: () => tgHook<{ ok: boolean }>("status").then(() => true, () => false), staleTime: 10 * 60_000 })

function useTgMutation<V, R = unknown>(fn: (v: V) => Promise<R>, success?: string, silent = false) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, meta: silent ? { silent: true } : success ? { success } : undefined, onSettled: () => qc.invalidateQueries({ queryKey: TG_KEY }) })
}

export const useSaveTgTemplate = () => useTgMutation((t: Omit<TgTemplate, "id"> & { id?: string }) => saveTgTemplate(t), "Shablon saqlandi")
export const useDeleteTgTemplate = () => useTgMutation((id: string) => deleteTgTemplate(id), "Shablon o'chirildi")
export const useSendTelegram = () =>
  useTgMutation((v: { lead_id: string; text: string; template_id?: string | null; files?: TgFileRef[] }) => tgHook("send", v), undefined, true)
export const useReadTelegram = () => useTgMutation((clientId: string) => tgHook("read", { client_id: clientId }), undefined, true)
export const useTgLogout = () => useTgMutation((id: string) => tgHook(`logout/${id}`, {}), "Telegram akkaunt uzildi")
export const tgBeginLogin = (title: string, profileId: string | null) => tgHook<{ id: string }>("login", { title, profile_id: profileId })
export const tgLoginState = (id: string) => tgHook<LoginState>(`login/${id}`)
export const tgSubmitPassword = (id: string, password: string) => tgHook(`login/${id}/password`, { password })
