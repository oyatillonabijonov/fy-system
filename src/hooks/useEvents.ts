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
  type Event,
  type Participant,
  type CreateEventInput,
} from "@/lib/supabase/queries/events"

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
