import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getClients,
  createClient,
  updateClient,
  deleteClient,
  deleteClients,
  uploadClientImage,
  createMemberAccount,
  getClientEventHistory,
  getClientJourney,
  getClientsLastEventDates,
  type ClientJourney,
} from "@/lib/supabase/queries/clients"
import type { Database } from "@/lib/supabase/types"

type ClientRow = Database["public"]["Tables"]["clients"]["Row"]
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"]
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"]

export const CLIENTS_KEY = ["clients"] as const

export function useClients() {
  return useQuery({
    queryKey: CLIENTS_KEY,
    queryFn: getClients,
  })
}

export function useCreateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ClientInsert) => createClient(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  })
}

export function useUpdateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClientUpdate }) =>
      updateClient(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: CLIENTS_KEY })
      const previous = qc.getQueryData<ClientRow[]>(CLIENTS_KEY)
      qc.setQueryData<ClientRow[]>(CLIENTS_KEY, (old) =>
        old?.map((c) => (c.id === id ? { ...c, ...data } : c))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(CLIENTS_KEY, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  })
}

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: CLIENTS_KEY })
      const previous = qc.getQueryData<ClientRow[]>(CLIENTS_KEY)
      qc.setQueryData<ClientRow[]>(CLIENTS_KEY, (old) =>
        old?.filter((c) => c.id !== id)
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(CLIENTS_KEY, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  })
}

export function useDeleteClients() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => deleteClients(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: CLIENTS_KEY })
      const previous = qc.getQueryData<ClientRow[]>(CLIENTS_KEY)
      qc.setQueryData<ClientRow[]>(CLIENTS_KEY, (old) =>
        old?.filter((c) => !ids.includes(c.id))
      )
      return { previous }
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) qc.setQueryData(CLIENTS_KEY, context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  })
}

export function useCreateMemberAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { client_id: string; email: string; password: string }) =>
      createMemberAccount(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  })
}

export function useUploadClientImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, clientId }: { file: Blob; clientId: string }) =>
      uploadClientImage(file, clientId),
    onSettled: () => qc.invalidateQueries({ queryKey: CLIENTS_KEY }),
  })
}

export const CLIENT_EVENT_HISTORY_KEY = (clientId: string) => ["client-event-history", clientId] as const

export function useClientEventHistory(clientId: string | null | undefined) {
  return useQuery({
    queryKey: CLIENT_EVENT_HISTORY_KEY(clientId ?? ""),
    queryFn: () => getClientEventHistory(clientId!),
    enabled: !!clientId,
    staleTime: 1000 * 60 * 2,
  })
}

export const CLIENTS_LAST_EVENT_DATES_KEY = ["clients-last-event-dates"] as const

export function useClientsLastEventDates() {
  return useQuery<Map<string, string>>({
    queryKey: CLIENTS_LAST_EVENT_DATES_KEY,
    queryFn: getClientsLastEventDates,
    staleTime: 1000 * 60 * 5,
  })
}

export function useClientJourney(clientId: string | null) {
  return useQuery<ClientJourney>({
    queryKey: ['client-journey', clientId],
    queryFn: () => getClientJourney(clientId!),
    enabled: !!clientId,
    staleTime: 1000 * 60,
  })
}
