import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CLIENTS_KEY } from "@/hooks/useClients"
import { SOTUV_KEY } from "@/hooks/useSotuv"
import { useAuth } from "@/context/AuthContext"
import { anketaUrl, type AnketaFields } from "@/lib/anketa"
import {
  approveAnketa, getAnketaSubmissions, getClientAnketaToken, getPendingAnketaFor, getUniversalAnketaToken, rejectAnketa,
} from "@/lib/supabase/queries/anketa"

export const ANKETA_KEY = ["anketa"] as const

export function useAnketaSubmissions(view: "pending" | "reviewed") {
  const { hasAccess } = useAuth()
  return useQuery({ queryKey: [...ANKETA_KEY, "list", view], queryFn: () => getAnketaSubmissions(view), enabled: hasAccess("mijozlar"), refetchOnMount: true })
}

/** The client's pending anketa (only Mijozlar users can read them) */
export function usePendingAnketaFor(clientId: string | null | undefined) {
  const { hasAccess } = useAuth()
  return useQuery({ queryKey: [...ANKETA_KEY, "client", clientId], queryFn: () => getPendingAnketaFor(clientId!), enabled: !!clientId && hasAccess("mijozlar") })
}

/** The client's personal link as a full URL (made on first use) */
export const useAnketaLink = () => useMutation({ mutationFn: (clientId: string) => getClientAnketaToken(clientId).then(anketaUrl) })

export const useUniversalAnketaLink = (enabled: boolean) =>
  useQuery({ queryKey: [...ANKETA_KEY, "universal"], queryFn: () => getUniversalAnketaToken().then(anketaUrl), enabled })

export function useRegenerateUniversalAnketa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => getUniversalAnketaToken(true).then(anketaUrl),
    meta: { success: "Yangi havola yaratildi — eski havola va QR endi ishlamaydi" },
    onSuccess: (url) => qc.setQueryData([...ANKETA_KEY, "universal"], url),
  })
}

function useReview<V>(fn: (v: V) => Promise<unknown>, success: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn, meta: { success },
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ANKETA_KEY }), qc.invalidateQueries({ queryKey: CLIENTS_KEY }), qc.invalidateQueries({ queryKey: SOTUV_KEY })]),
  })
}
export const useApproveAnketa = () =>
  useReview(({ id, overrides }: { id: string; overrides: Partial<AnketaFields> & { image?: string } }) => approveAnketa(id, overrides), "Tasdiqlandi — mijoz kartochkasi yangilandi")
export const useRejectAnketa = () => useReview((id: string) => rejectAnketa(id), "Anketa rad etildi")
