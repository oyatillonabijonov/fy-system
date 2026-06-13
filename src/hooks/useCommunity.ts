import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getChannels,
  getChannelMessages,
  getDmMessages,
  sendChannelMessage,
  sendDmMessage,
  getCommunityMembers,
  setCommunityApproved,
  createChannel,
  deleteChannel,
  CHANNELS_KEY,
  MESSAGES_KEY,
} from "@/lib/supabase/queries/community"

export { CHANNELS_KEY, MESSAGES_KEY }

export function useChannels() {
  return useQuery({
    queryKey: [...CHANNELS_KEY],
    queryFn: getChannels,
  })
}

export function useChannelMessages(channelId: string | null) {
  return useQuery({
    queryKey: [...MESSAGES_KEY, "channel", channelId],
    queryFn: () => getChannelMessages(channelId!),
    enabled: !!channelId,
    refetchInterval: 5000,
  })
}

export function useDmMessages(otherUserId: string | null) {
  return useQuery({
    queryKey: [...MESSAGES_KEY, "dm", otherUserId],
    queryFn: () => getDmMessages(otherUserId!),
    enabled: !!otherUserId,
    refetchInterval: 5000,
  })
}

export function useCommunityMembers() {
  return useQuery({
    queryKey: ["community-members"],
    queryFn: getCommunityMembers,
  })
}

export function useSendChannelMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ channelId, content, imageUrl }: { channelId: string; content: string; imageUrl?: string }) =>
      sendChannelMessage(channelId, content, imageUrl),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: [...MESSAGES_KEY, "channel", vars.channelId] })
    },
  })
}

export function useSendDmMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ recipientId, content, imageUrl }: { recipientId: string; content: string; imageUrl?: string }) =>
      sendDmMessage(recipientId, content, imageUrl),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: [...MESSAGES_KEY, "dm", vars.recipientId] })
    },
  })
}

export function useCreateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      createChannel(name, description),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...CHANNELS_KEY] }),
  })
}

export function useDeleteChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteChannel(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...CHANNELS_KEY] }),
  })
}

export function useSetCommunityApproved() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, approved }: { clientId: string; approved: boolean }) =>
      setCommunityApproved(clientId, approved),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["clients"] }),
  })
}
