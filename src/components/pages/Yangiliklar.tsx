import { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Newspaper,
  Plus,
  PencilSimple,
  Trash,
  X,
  UploadSimple,
  Eye,
  EyeSlash,
} from "@phosphor-icons/react"
import {
  useNewsPosts,
  useCreateNewsPost,
  useUpdateNewsPost,
  useDeleteNewsPost,
} from "@/hooks/useNews"
import { uploadNewsImage, type NewsPost } from "@/lib/supabase/queries/news"

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}.${d.getFullYear()}`
}

interface PostFormProps {
  editPost: NewsPost | null
  onClose: () => void
}

function PostFormModal({ editPost, onClose }: PostFormProps) {
  const [title, setTitle] = useState(editPost?.title ?? "")
  const [body, setBody] = useState(editPost?.body ?? "")
  const [isPublished, setIsPublished] = useState(editPost?.is_published ?? true)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(editPost?.image_url ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createMutation = useCreateNewsPost()
  const updateMutation = useUpdateNewsPost()

  const isEdit = Boolean(editPost)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError("Rasm hajmi 5MB dan oshmasligi kerak")
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    if (!title.trim()) return
    setSaving(true)
    setError(null)

    try {
      if (isEdit && editPost) {
        let imageUrl = editPost.image_url
        if (imageFile) {
          imageUrl = await uploadNewsImage(imageFile, editPost.id)
        }
        await updateMutation.mutateAsync({
          id: editPost.id,
          updates: {
            title: title.trim(),
            body: body.trim() || null,
            image_url: imageUrl,
            is_published: isPublished,
          },
        })
      } else {
        const post = await createMutation.mutateAsync({
          title: title.trim(),
          body: body.trim() || null,
          is_published: isPublished,
        })
        if (imageFile) {
          const imageUrl = await uploadNewsImage(imageFile, post.id)
          await updateMutation.mutateAsync({ id: post.id, updates: { image_url: imageUrl } })
        }
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[110]"
        onClick={() => !saving && onClose()}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed inset-0 flex items-center justify-center z-[110] pointer-events-none"
      >
        <div
          className="bg-white rounded-[12px] w-full max-w-md shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0F0]">
            <h2 className="text-[16px] font-bold text-[#141414]">
              {isEdit ? "Yangilikni tahrirlash" : "Yangi post"}
            </h2>
            <button
              onClick={() => !saving && onClose()}
              className="p-1.5 rounded-[6px] hover:bg-[#F5F5F5] transition-colors"
            >
              <X size={20} className="text-[#999]" weight="bold" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {error && (
              <div className="px-3 py-2 rounded-[8px] text-[12px] font-medium bg-red-50 text-red-700 border border-red-200">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Sarlavha *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Masalan: Yangi tadbir e'lon qilindi"
                autoFocus
                className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Matn</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Yangilik matni..."
                rows={5}
                className="w-full border border-[#E0E0E0] rounded-[8px] px-3 py-2 text-[13px] text-[#141414] placeholder:text-[#CCC] focus:outline-none focus:border-[#141414] transition-colors resize-none"
              />
            </div>

            {/* Image upload */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[#999]">Rasm</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-[#E0E0E0] rounded-[8px] p-5 cursor-pointer hover:bg-[#F9F9F8] transition-colors"
              >
                {preview ? (
                  <img src={preview} alt="Rasm" className="w-full h-32 object-cover rounded-[8px]" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-[#999]">
                    <UploadSimple size={22} weight="bold" />
                    <span className="text-[12px]">Rasm yuklash uchun bosing</span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Publish toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 accent-[#141414]"
              />
              <span className="text-[13px] font-medium text-[#141414]">
                Darhol e'lon qilish (a'zolar ilovada ko'radi)
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F0F0F0]">
            <button
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#999] hover:text-[#666] transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !title.trim()}
              className={`px-5 py-2 rounded-[8px] text-[13px] font-bold text-white transition-colors ${
                saving || !title.trim()
                  ? "bg-[#CCCCCC] cursor-not-allowed"
                  : "bg-[#141414] hover:bg-[#333]"
              }`}
            >
              {saving ? "Saqlanmoqda..." : isEdit ? "Saqlash" : "E'lon qilish"}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

export function Yangiliklar() {
  const { data: posts = [], isLoading } = useNewsPosts()
  const updateMutation = useUpdateNewsPost()
  const deleteMutation = useDeleteNewsPost()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editPost, setEditPost] = useState<NewsPost | null>(null)
  const [postToDelete, setPostToDelete] = useState<NewsPost | null>(null)

  function openCreate() {
    setEditPost(null)
    setIsFormOpen(true)
  }

  function openEdit(post: NewsPost) {
    setEditPost(post)
    setIsFormOpen(true)
  }

  async function togglePublish(post: NewsPost) {
    await updateMutation.mutateAsync({
      id: post.id,
      updates: { is_published: !post.is_published },
    })
  }

  async function confirmDelete() {
    if (!postToDelete) return
    await deleteMutation.mutateAsync(postToDelete.id)
    setPostToDelete(null)
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#141414]">
          <Newspaper size={20} weight="bold" />
          <span className="text-[15px] font-bold">
            Klub yangiliklari {posts.length > 0 && `(${posts.length})`}
          </span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#141414] hover:bg-[#333] text-white rounded-[8px] text-[13px] font-bold transition-colors"
        >
          <Plus size={16} weight="bold" />
          Yangi post
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-[13px] text-[#999] italic py-8 text-center">Yuklanmoqda...</div>
      ) : posts.length === 0 ? (
        <div className="bg-white border border-[#F0F0F0] rounded-[12px] py-16 flex flex-col items-center gap-3 text-[#999]">
          <Newspaper size={32} weight="bold" />
          <span className="text-[13px]">Hozircha yangiliklar yo'q</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden flex flex-col"
            >
              {post.image_url && (
                <img
                  src={post.image_url}
                  alt={post.title}
                  className="w-full h-36 object-cover"
                />
              )}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[14px] font-bold text-[#141414] leading-snug">{post.title}</h3>
                  <span
                    className={`flex-shrink-0 inline-flex px-2 py-0.5 rounded-[4px] text-[10px] font-bold ${
                      post.is_published ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
                    }`}
                  >
                    {post.is_published ? "E'lon qilingan" : "Qoralama"}
                  </span>
                </div>
                {post.body && (
                  <p className="text-[12px] text-[#666] leading-snug line-clamp-3">{post.body}</p>
                )}
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="text-[11px] text-[#999]">{formatDate(post.published_at)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void togglePublish(post)}
                      className="p-1.5 hover:bg-[#F3F2F0] rounded-[6px] transition-colors text-[#999] hover:text-[#141414]"
                      title={post.is_published ? "Yashirish" : "E'lon qilish"}
                    >
                      {post.is_published ? <EyeSlash size={16} weight="bold" /> : <Eye size={16} weight="bold" />}
                    </button>
                    <button
                      onClick={() => openEdit(post)}
                      className="p-1.5 hover:bg-[#F3F2F0] rounded-[6px] transition-colors text-[#999] hover:text-[#141414]"
                      title="Tahrirlash"
                    >
                      <PencilSimple size={16} weight="bold" />
                    </button>
                    <button
                      onClick={() => setPostToDelete(post)}
                      className="p-1.5 hover:bg-red-50 rounded-[6px] transition-colors text-[#999] hover:text-red-600"
                      title="O'chirish"
                    >
                      <Trash size={16} weight="bold" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      <AnimatePresence>
        {isFormOpen && (
          <PostFormModal
            editPost={editPost}
            onClose={() => {
              setIsFormOpen(false)
              setEditPost(null)
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {postToDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[110]"
              onClick={() => setPostToDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 flex items-center justify-center z-[110] pointer-events-none"
            >
              <div
                className="bg-white rounded-[12px] w-full max-w-sm shadow-2xl pointer-events-auto p-5 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-[15px] font-bold text-[#141414]">Postni o'chirish</h3>
                <p className="text-[13px] text-[#666]">
                  "{postToDelete.title}" o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setPostToDelete(null)}
                    className="px-4 py-2 rounded-[8px] text-[13px] font-medium text-[#999] hover:text-[#666] transition-colors"
                  >
                    Bekor qilish
                  </button>
                  <button
                    onClick={() => void confirmDelete()}
                    disabled={deleteMutation.isPending}
                    className="px-4 py-2 rounded-[8px] text-[13px] font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    {deleteMutation.isPending ? "O'chirilmoqda..." : "O'chirish"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
