import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getEvent,
  getEvents,
  getMyParticipations,
  registerForEvent,
} from "@/lib/supabase/queries/events"

export const EVENTS_KEY = ["events"] as const
export const PARTICIPATIONS_KEY = ["my-participations"] as const

export function useEvents() {
  return useQuery({ queryKey: EVENTS_KEY, queryFn: getEvents })
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: [...EVENTS_KEY, id],
    queryFn: () => getEvent(id),
    enabled: Boolean(id),
  })
}

export function useMyParticipations() {
  return useQuery({ queryKey: PARTICIPATIONS_KEY, queryFn: getMyParticipations })
}

export function useRegisterForEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (eventId: string) => registerForEvent(eventId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PARTICIPATIONS_KEY })
    },
  })
}
