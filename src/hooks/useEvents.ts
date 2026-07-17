import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getEvents,
  getEvent,
  getParticipants,
  getParticipantCounts,
  createEvent,
  deleteEvent,
  deleteParticipant,
  reorderParticipants,
  updateParticipant,
  addExistingContactToEvent,
  type Event,
  type Participant,
  type CreateEventInput,
  type ClientContact,
} from "@/lib/supabase/queries/events"
import { addPayment, type PaymentMethod } from "@/lib/supabase/queries/payments"

export const EVENTS_KEY = ["events"] as const
export const EVENT_COUNTS_KEY = ["event-participant-counts"] as const
export const PARTICIPANTS_KEY = ["participants"] as const

export function useEvents() {
  return useQuery({
    queryKey: EVENTS_KEY,
    queryFn: getEvents,
    staleTime: 1000 * 60 * 3,
  })
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: [...EVENTS_KEY, eventId],
    queryFn: () => getEvent(eventId),
    staleTime: 1000 * 60 * 3,
    enabled: !!eventId,
  })
}

export function useParticipants(eventId: string) {
  return useQuery({
    queryKey: [...PARTICIPANTS_KEY, eventId],
    queryFn: () => getParticipants(eventId),
    staleTime: 1000 * 60 * 2,
    enabled: !!eventId,
  })
}

export function useParticipantCounts(eventIds: string[]) {
  return useQuery({
    queryKey: [...EVENT_COUNTS_KEY, eventIds],
    queryFn: () => getParticipantCounts(eventIds),
    enabled: eventIds.length > 0,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateEventInput) => createEvent(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY })
      qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
    },
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: EVENTS_KEY })
      const previous = qc.getQueryData<Event[]>(EVENTS_KEY)
      qc.setQueryData<Event[]>(EVENTS_KEY, (old) =>
        old?.filter((e) => e.id !== id)
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(EVENTS_KEY, context.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY })
      qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
    },
  })
}

// Enroll an existing client into an event with an agreed price + optional first
// payment. The payment (if any) flows through the Sprint A chain (paid + cashback).
export function useEnrollParticipant(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      client: ClientContact
      price: number
      initialAmount: number
      method: PaymentMethod
      note?: string
    }) => {
      const participantId = await addExistingContactToEvent(eventId, vars.client, vars.price)
      if (vars.initialAmount > 0) {
        await addPayment({
          participantId,
          amount: vars.initialAmount,
          method: vars.method,
          paidAt: new Date().toISOString(),
          note: vars.note,
        })
      }
      return participantId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PARTICIPANTS_KEY, eventId] })
      qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
      qc.invalidateQueries({ queryKey: EVENTS_KEY })
      qc.invalidateQueries({ queryKey: ["clients"] })
      qc.invalidateQueries({ queryKey: ["client-journey"] })
      qc.invalidateQueries({ queryKey: ["client-participations"] })
      qc.invalidateQueries({ queryKey: ["recent-payments"] })
      qc.invalidateQueries({ queryKey: ["event-payments"] })
    },
  })
}

// Update a participant (e.g. inline-edit the agreed price). Debt = price - paid
// is derived, so the log/table refresh on price change too.
export function useUpdateParticipant(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; updates: Parameters<typeof updateParticipant>[1] }) =>
      updateParticipant(vars.id, vars.updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...PARTICIPANTS_KEY, eventId] })
      qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
      qc.invalidateQueries({ queryKey: ["clients"] })
      qc.invalidateQueries({ queryKey: ["recent-payments"] })
      qc.invalidateQueries({ queryKey: ["event-payments"] })
    },
  })
}

export function useDeleteParticipant(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteParticipant(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: [...PARTICIPANTS_KEY, eventId] })
      const previous = qc.getQueryData<Participant[]>([...PARTICIPANTS_KEY, eventId])
      qc.setQueryData<Participant[]>([...PARTICIPANTS_KEY, eventId], (old) =>
        old?.filter((p) => p.id !== id)
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData([...PARTICIPANTS_KEY, eventId], context.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [...PARTICIPANTS_KEY, eventId] })
      qc.invalidateQueries({ queryKey: EVENT_COUNTS_KEY })
    },
  })
}

export function useReorderParticipants(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: { id: string; sort_order: number }[]) => reorderParticipants(items),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: [...PARTICIPANTS_KEY, eventId] })
      const previous = qc.getQueryData<Participant[]>([...PARTICIPANTS_KEY, eventId])
      // Apply optimistic reorder
      qc.setQueryData<Participant[]>([...PARTICIPANTS_KEY, eventId], (old) => {
        if (!old) return old
        const orderMap = new Map(items.map((i) => [i.id, i.sort_order]))
        return [...old].sort((a, b) => (orderMap.get(a.id) ?? a.sort_order) - (orderMap.get(b.id) ?? b.sort_order))
      })
      return { previous }
    },
    onError: (_err, _items, context) => {
      if (context?.previous) qc.setQueryData([...PARTICIPANTS_KEY, eventId], context.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [...PARTICIPANTS_KEY, eventId] })
    },
  })
}
