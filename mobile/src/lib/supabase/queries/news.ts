import { supabase } from "../client"
import type { Database } from "../types"

export type NewsPostRow = Database["public"]["Tables"]["news_posts"]["Row"]

/** Published club news (RLS hides drafts from members). */
export async function getNews(): Promise<NewsPostRow[]> {
  const { data, error } = await supabase
    .from("news_posts")
    .select("*")
    .order("published_at", { ascending: false })

  if (error) throw error
  return data
}

export async function getNewsPost(id: string): Promise<NewsPostRow | null> {
  const { data, error } = await supabase
    .from("news_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error) throw error
  return data
}
