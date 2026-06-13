import { useState, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import {
  User,
  Buildings,
  Phone,
  CheckCircle,
  Clock,
  Camera,
  FloppyDisk,
  SpinnerGap,
} from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase/client"
import { ImageCropModal } from "@/components/ui/ImageCropModal"

type SaveState = "idle" | "saving" | "success" | "error"
type UploadState = "idle" | "uploading" | "error"

export default function MemberProfile() {
  const { memberClient, refreshProfile } = useAuth()

  const [fullName, setFullName] = useState(memberClient?.full_name ?? "")
  const [phone, setPhone] = useState(memberClient?.phone ?? "")
  const [company, setCompany] = useState(memberClient?.company ?? "")
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setCropSrc(reader.result)
        }
      }
      reader.readAsDataURL(file)
      // Reset input so same file can be re-selected
      e.target.value = ""
    },
    [],
  )

  const handleCropped = useCallback(
    async (blob: Blob) => {
      setCropSrc(null)
      if (!memberClient) return

      setUploadState("uploading")
      setUploadError(null)

      try {
        const path = `member-avatars/${memberClient.auth_user_id}.jpg`
        const file = new File([blob], "avatar.jpg", { type: "image/jpeg" })

        const { error: uploadErr } = await supabase.storage
          .from("client-images")
          .upload(path, file, { upsert: true, contentType: "image/jpeg" })

        if (uploadErr) throw uploadErr

        const { data: urlData } = supabase.storage
          .from("client-images")
          .getPublicUrl(path)

        const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`

        const { error: updateErr } = await supabase
          .from("clients")
          .update({ image: publicUrl })
          .eq("auth_user_id", memberClient.auth_user_id)

        if (updateErr) throw updateErr

        await refreshProfile()
        setUploadState("idle")
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Rasm yuklashda xatolik",
        )
        setUploadState("error")
      }
    },
    [memberClient, refreshProfile],
  )

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!memberClient) return

      setSaveState("saving")
      setSaveError(null)

      try {
        const { error } = await supabase.rpc("member_update_profile", {
          p_full_name: fullName.trim(),
          p_phone: phone.trim() || undefined,
          p_company: company.trim() || undefined,
        })

        if (error) throw error

        await refreshProfile()
        setSaveState("success")
        setTimeout(() => setSaveState("idle"), 2500)
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : "Saqlashda xatolik yuz berdi",
        )
        setSaveState("error")
      }
    },
    [memberClient, fullName, phone, company, refreshProfile],
  )

  if (!memberClient) {
    return (
      <div
        className="flex items-center justify-center h-64 text-sm"
        style={{ color: "var(--header-muted)" }}
      >
        Ma&apos;lumotlar yuklanmoqda…
      </div>
    )
  }

  const avatarUrl = memberClient.image
  const initials = memberClient.full_name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      {/* ── Profile header ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-[8px] border p-6 flex flex-col items-center gap-4 text-center"
        style={{
          background: "var(--main-bg)",
          borderColor: "var(--header-border)",
        }}
      >
        {/* Avatar with camera overlay */}
        <div className="relative group">
          <div
            className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-2xl font-bold select-none shrink-0"
            style={{
              background: "var(--header-border)",
              color: "var(--header-muted)",
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={memberClient.full_name}
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>

          {/* Upload overlay */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState === "uploading"}
            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.45)" }}
            title="Rasmni o'zgartirish"
          >
            {uploadState === "uploading" ? (
              <SpinnerGap
                size={24}
                weight="bold"
                className="text-white animate-spin"
              />
            ) : (
              <Camera size={24} weight="bold" className="text-white" />
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

        {uploadState === "error" && uploadError && (
          <p className="text-xs text-red-500">{uploadError}</p>
        )}

        {/* Name & company */}
        <div className="space-y-1">
          <h2
            className="text-[18px] font-bold leading-tight"
            style={{ color: "var(--header-text)" }}
          >
            {memberClient.full_name}
          </h2>
          {memberClient.company && (
            <p
              className="text-[13px] flex items-center justify-center gap-1"
              style={{ color: "var(--header-muted)" }}
            >
              <Buildings size={14} />
              {memberClient.company}
            </p>
          )}
        </div>

        {/* Community status badge */}
        {memberClient.community_approved ? (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[8px] text-[12px] font-semibold"
            style={{ background: "#DCFCE7", color: "#15803D" }}
          >
            <CheckCircle size={14} weight="fill" />
            Hamjamiyat: Tasdiqlangan
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[8px] text-[12px] font-semibold"
            style={{ background: "#FEF3C7", color: "#B45309" }}
          >
            <Clock size={14} weight="fill" />
            Hamjamiyat: Kutilmoqda
          </span>
        )}
      </motion.div>

      {/* ── Edit form ─────────────────────────────────── */}
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        onSubmit={(e) => { void handleSave(e) }}
        className="rounded-[8px] border p-6 space-y-4"
        style={{
          background: "var(--main-bg)",
          borderColor: "var(--header-border)",
        }}
      >
        <h3
          className="text-[14px] font-bold"
          style={{ color: "var(--header-text)" }}
        >
          Ma&apos;lumotlarni tahrirlash
        </h3>

        {/* Full name */}
        <div className="space-y-1.5">
          <label
            className="text-[12px] font-medium"
            style={{ color: "var(--header-muted)" }}
          >
            To&apos;liq ism
          </label>
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-[8px] border focus-within:ring-2"
            style={{
              borderColor: "var(--header-border)",
              // @ts-expect-error -- CSS custom property
              "--tw-ring-color": "var(--accent)",
            }}
          >
            <User
              size={16}
              style={{ color: "var(--header-muted)" }}
              className="shrink-0"
            />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="To'liq ismingiz"
              className="flex-1 bg-transparent outline-none text-[13px]"
              style={{ color: "var(--header-text)" }}
            />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label
            className="text-[12px] font-medium"
            style={{ color: "var(--header-muted)" }}
          >
            Telefon
          </label>
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-[8px] border focus-within:ring-2"
            style={{
              borderColor: "var(--header-border)",
              // @ts-expect-error -- CSS custom property
              "--tw-ring-color": "var(--accent)",
            }}
          >
            <Phone
              size={16}
              style={{ color: "var(--header-muted)" }}
              className="shrink-0"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 000 00 00"
              className="flex-1 bg-transparent outline-none text-[13px]"
              style={{ color: "var(--header-text)" }}
            />
          </div>
        </div>

        {/* Company */}
        <div className="space-y-1.5">
          <label
            className="text-[12px] font-medium"
            style={{ color: "var(--header-muted)" }}
          >
            Kompaniya
          </label>
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-[8px] border focus-within:ring-2"
            style={{
              borderColor: "var(--header-border)",
              // @ts-expect-error -- CSS custom property
              "--tw-ring-color": "var(--accent)",
            }}
          >
            <Buildings
              size={16}
              style={{ color: "var(--header-muted)" }}
              className="shrink-0"
            />
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Kompaniya nomi"
              className="flex-1 bg-transparent outline-none text-[13px]"
              style={{ color: "var(--header-text)" }}
            />
          </div>
        </div>

        {/* Error message */}
        {saveState === "error" && saveError && (
          <p className="text-xs text-red-500">{saveError}</p>
        )}

        {/* Success message */}
        {saveState === "success" && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs font-medium flex items-center gap-1.5"
            style={{ color: "#15803D" }}
          >
            <CheckCircle size={14} weight="fill" />
            Ma&apos;lumotlar muvaffaqiyatli saqlandi
          </motion.p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={saveState === "saving"}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[8px] text-[13px] font-bold text-white transition-opacity disabled:opacity-60 active:scale-[0.98]"
          style={{ background: "var(--accent)" }}
        >
          {saveState === "saving" ? (
            <>
              <SpinnerGap size={16} weight="bold" className="animate-spin" />
              Saqlanmoqda…
            </>
          ) : (
            <>
              <FloppyDisk size={16} weight="bold" />
              Saqlash
            </>
          )}
        </button>
      </motion.form>

      {/* ── Image crop modal ──────────────────────────── */}
      <ImageCropModal
        isOpen={cropSrc !== null}
        imageSrc={cropSrc ?? ""}
        onClose={() => setCropSrc(null)}
        onCropped={(blob) => { void handleCropped(blob) }}
      />
    </div>
  )
}
