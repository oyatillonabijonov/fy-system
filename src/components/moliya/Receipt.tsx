import { useRef, useState } from "react"
import { Paperclip, UploadSimple, X } from "@phosphor-icons/react"
import { RECEIPT_ACCEPT, RECEIPT_MAX_BYTES, receiptUrl, type ReceiptKind } from "@/lib/supabase/queries/finance"
import { useAttachReceipt } from "@/hooks/useFinance"
import { LABEL } from "@/components/moliya/PaymentActionModals"

function fileProblem(f: File): string | null {
  if (!RECEIPT_ACCEPT.split(",").includes(f.type)) return "Faqat JPG, PNG, WEBP yoki PDF fayl"
  if (f.size > RECEIPT_MAX_BYTES) return "Fayl 10 MB dan katta"
  return null
}

// Optional receipt picker for the Kirim / Chiqim modals; uploading happens after the save.
export function ReceiptInput({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <span className={LABEL}>Chek (ixtiyoriy)</span>
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-control bg-surface-sunken text-sm">
          <Paperclip size={16} className="text-ink-muted shrink-0" />
          <span className="flex-1 min-w-0 truncate text-ink">{file.name}</span>
          <span className="text-ink-muted tabular-nums shrink-0">{file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span>
          <button type="button" onClick={() => onChange(null)} aria-label="Chekni olib tashlash" className="p-0.5 rounded-full hover:bg-mute-ghost-hover transition-colors">
            <X size={16} className="text-ink-muted" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border border-dashed border-line text-sm text-ink-muted hover:bg-mute-ghost-hover transition-colors"
        >
          <Paperclip size={16} /> Fayl tanlash — JPG, PNG, PDF, 10 MB gacha
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (!f) return
          const problem = fileProblem(f)
          setError(problem)
          if (!problem) onChange(f)
        }}
      />
      {error && <span role="alert" className="text-xs text-danger-text">{error}</span>}
    </div>
  )
}

// Table cell: open the receipt (signed link, 5 min) or attach one to a row that has none.
export function ReceiptCell({ kind, id, path, canAttach }: { kind: ReceiptKind; id: string; path: string | null; canAttach: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const attach = useAttachReceipt()

  if (path) {
    return (
      <button
        onClick={async () => {
          // Open the tab inside the click (popup blockers), then point it at the signed link.
          const tab = window.open("", "_blank")
          try {
            const url = await receiptUrl(path)
            if (tab) {
              tab.opener = null
              tab.location.href = url
            }
          } catch (e) {
            tab?.close()
            window.alert(e instanceof Error ? e.message : "Chekni ochib bo'lmadi")
          }
        }}
        title="Chekni ochish"
        aria-label="Chekni ochish"
        className="inline-flex items-center justify-center size-7 rounded-full text-ink-muted hover:text-ink hover:bg-mute-ghost-hover transition-colors"
      >
        <Paperclip size={16} />
      </button>
    )
  }

  if (!canAttach) return <span className="text-ink-faint">—</span>

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={attach.isPending}
        title="Chek biriktirish"
        aria-label="Chek biriktirish"
        className="inline-flex items-center justify-center size-7 rounded-full text-ink-faint border border-dashed border-line hover:text-ink hover:bg-mute-ghost-hover transition-colors disabled:opacity-50 disabled:animate-pulse"
      >
        <UploadSimple size={16} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={RECEIPT_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (!f) return
          const problem = fileProblem(f)
          if (problem) {
            window.alert(problem)
            return
          }
          attach.mutate({ kind, id, file: f }, { onError: (err) => window.alert(err.message) })
        }}
      />
    </>
  )
}
