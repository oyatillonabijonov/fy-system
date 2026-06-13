import { useQuery } from "@tanstack/react-query"
import { getNews, getNewsPost } from "@/lib/supabase/queries/news"

export const NEWS_KEY = ["news"] as const

export function useNews() {
  return useQuery({ queryKey: NEWS_KEY, queryFn: getNews })
}

export function useNewsPost(id: string) {
  return useQuery({
    queryKey: [...NEWS_KEY, id],
    queryFn: () => getNewsPost(id),
    enabled: Boolean(id),
  })
}
