import { useState, useRef, useId } from "react"
import { StatusBadge } from '@/components/ui/StatusBadge'
import { motion, AnimatePresence } from "framer-motion"
import { useDialog } from "@/hooks/useDialog"
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
import { formatDate } from "@/lib/format"

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
  const uid = useId()
  const titleId = useId()
  const panelRef = useDialog<HTMLDivElement>(() => !saving && onClose())

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
        className="fixed inset-0 bg-surface-overlay backdrop-blur-[2px] z-[110]"
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
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="bg-surface-raised rounded-overlay w-full max-w-md pointer-events-auto max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <h2 id={titleId} className="text-md font-bold text-ink">
              {isEdit ? "Yangilikni tahrirlash" : "Yangi post"}
            </h2>
            <button
              onClick={() => !saving && onClose()}
              aria-label="Yopish"
              className="p-1.5 rounded-control-sm hover:bg-mute-ghost-hover transition-colors"
            >
              <X size={20} className="text-ink-faint" weight="bold" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4">
            {error && (
              <div className="px-3 py-2 rounded-control text-sm font-medium bg-danger-soft text-danger-dark border border-line">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-title`} className="text-sm font-medium text-ink-faint">Sarlavha *</label>
              <input
                id={`${uid}-title`}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Masalan: Yangi tadbir e'lon qilindi"
                autoFocus
                className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-body`} className="text-sm font-medium text-ink-faint">Matn</label>
              <textarea
                id={`${uid}-body`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Yangilik matni..."
                rows={5}
                className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors resize-none"
              />
            </div>

            {/* Image upload */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-image`} className="text-sm font-medium text-ink-faint">Rasm</label>
              <button
                id={`${uid}-image`}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-line rounded-control p-5 cursor-pointer hover:bg-mute-ghost-hover transition-colors"
              >
                {preview ? (
                  <img src={preview} alt="Rasm" className="w-full h-32 object-cover rounded-control" />
                ) : (
                  <span className="flex flex-col items-center gap-2 text-ink-faint">
                    <UploadSimple size={22} weight="bold" />
                    <span className="text-sm">Rasm yuklash uchun bosing</span>
                  </span>
                )}
              </button>
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
                className="w-4 h-4 accent-accent"
              />
              <span className="text-base font-medium text-ink">
                Darhol e'lon qilish (a'zolar ilovada ko'radi)
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-line">
            <button
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="px-4 py-2 rounded-control text-base font-medium text-ink-faint hover:text-ink-muted transition-colors"
            >
              Bekor qilish
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !title.trim()}
              className={`px-5 py-2 rounded-control text-base font-bold text-ink-on-accent transition-colors ${
                saving || !title.trim()
                  ? "bg-mute-soft cursor-not-allowed"
                  : "bg-accent hover:bg-accent-hover"
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
  const deleteTitleId = useId()
  const deletePanelRef = useDialog<HTMLDivElement>(() => setPostToDelete(null), Boolean(postToDelete))

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
        <div className="flex items-center gap-2 text-ink">
          <Newspaper size={20} weight="bold" />
          <span className="text-base font-bold">
            Klub yangiliklari {posts.length > 0 && `(${posts.length})`}
          </span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-ink-on-accent rounded-control text-base font-bold transition-colors"
        >
          <Plus size={16} weight="bold" />
          Yangi post
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-base text-ink-faint italic py-8 text-center">Yuklanmoqda...</div>
      ) : posts.length === 0 ? (
        <div className="bg-surface border border-line rounded-surface py-16 flex flex-col items-center gap-3 text-ink-faint">
          <Newspaper size={32} weight="bold" />
          <span className="text-base">Hozircha yangiliklar yo'q</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-surface border border-line rounded-surface overflow-hidden flex flex-col"
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
                  <h3 className="text-md font-bold text-ink leading-snug">{post.title}</h3>
                  <StatusBadge label={post.is_published ? "E'lon qilingan" : "Qoralama"} variant={post.is_published ? 'success' : 'warning'} />
                </div>
                {post.body && (
                  <p className="text-sm text-ink-muted leading-snug line-clamp-3">{post.body}</p>
                )}
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="text-xs text-ink-faint">{formatDate(post.published_at)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void togglePublish(post)}
                      className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm transition-colors text-ink-faint hover:text-ink"
                      title={post.is_published ? "Yashirish" : "E'lon qilish"}
                      aria-label={post.is_published ? "Yashirish" : "E'lon qilish"}
                      aria-pressed={post.is_published}
                    >
                      {post.is_published ? <EyeSlash size={16} weight="bold" /> : <Eye size={16} weight="bold" />}
                    </button>
                    <button
                      onClick={() => openEdit(post)}
                      className="p-1.5 hover:bg-mute-ghost-hover rounded-control-sm transition-colors text-ink-faint hover:text-ink"
                      title="Tahrirlash"
                      aria-label="Tahrirlash"
                    >
                      <PencilSimple size={16} weight="bold" />
                    </button>
                    <button
                      onClick={() => setPostToDelete(post)}
                      className="p-1.5 hover:bg-danger-soft rounded-control-sm transition-colors text-ink-faint hover:text-danger-text"
                      title="O'chirish"
                      aria-label="O'chirish"
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
              className="fixed inset-0 bg-surface-overlay backdrop-blur-[2px] z-[110]"
              onClick={() => setPostToDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 flex items-center justify-center z-[110] pointer-events-none"
            >
              <div
                ref={deletePanelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={deleteTitleId}
                tabIndex={-1}
                className="bg-surface-raised rounded-overlay w-full max-w-sm pointer-events-auto p-5 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id={deleteTitleId} className="text-base font-bold text-ink">Postni o'chirish</h3>
                <p className="text-base text-ink-muted">
                  "{postToDelete.title}" o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setPostToDelete(null)}
                    className="px-4 py-2 rounded-control text-base font-medium text-ink-faint hover:text-ink-muted transition-colors"
                  >
                    Bekor qilish
                  </button>
                  <button
                    onClick={() => void confirmDelete()}
                    disabled={deleteMutation.isPending}
                    className="px-4 py-2 rounded-control text-base font-bold text-white bg-danger hover:bg-danger/90 transition-colors"
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
