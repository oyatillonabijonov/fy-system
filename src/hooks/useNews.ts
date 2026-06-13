import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getNewsPosts,
  createNewsPost,
  updateNewsPost,
  deleteNewsPost,
  type NewsPostInput,
} from "@/lib/supabase/queries/news"

export const NEWS_KEY = ["news"] as const

export function useNewsPosts() {
  return useQuery({
    queryKey: NEWS_KEY,
    queryFn: getNewsPosts,
  })
}

export function useCreateNewsPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewsPostInput) => createNewsPost(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: NEWS_KEY }),
  })
}

export function useUpdateNewsPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<NewsPostInput> }) =>
      updateNewsPost(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: NEWS_KEY }),
  })
}

export function useDeleteNewsPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteNewsPost(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NEWS_KEY }),
  })
}
