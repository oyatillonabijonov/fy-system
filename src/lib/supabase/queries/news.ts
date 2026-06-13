import { supabase } from "../client"

export interface NewsPost {
  id: string
  title: string
  body: string | null
  image_url: string | null
  is_published: boolean
  published_at: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface NewsPostInput {
  title: string
  body?: string | null
  image_url?: string | null
  is_published?: boolean
}

const NEWS_COLUMNS =
  "id, title, body, image_url, is_published, published_at, created_by, created_at, updated_at"

export async function getNewsPosts(): Promise<NewsPost[]> {
  const { data, error } = await supabase
    .from("news_posts")
    .select(NEWS_COLUMNS)
    .order("published_at", { ascending: false })

  if (error) throw error
  return data as NewsPost[]
}

export async function createNewsPost(input: NewsPostInput): Promise<NewsPost> {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("news_posts")
    .insert({
      title: input.title,
      body: input.body ?? null,
      image_url: input.image_url ?? null,
      is_published: input.is_published ?? true,
      created_by: user?.id ?? null,
    })
    .select(NEWS_COLUMNS)
    .single()

  if (error) throw error
  return data as NewsPost
}

export async function updateNewsPost(
  id: string,
  updates: Partial<NewsPostInput>,
): Promise<void> {
  const { error } = await supabase
    .from("news_posts")
    .update(updates)
    .eq("id", id)

  if (error) throw error
}

export async function deleteNewsPost(id: string): Promise<void> {
  const { error } = await supabase.from("news_posts").delete().eq("id", id)
  if (error) throw error
}

export async function uploadNewsImage(file: Blob, postId: string): Promise<string> {
  const path = `${postId}_${Date.now()}.jpg`

  const { error } = await supabase.storage
    .from("news-images")
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" })

  if (error) throw error

  const { data } = supabase.storage.from("news-images").getPublicUrl(path)
  return data.publicUrl
}
