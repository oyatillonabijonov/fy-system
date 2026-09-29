import { useState, useRef, useId } from "react"
import { toast as notify } from "@/lib/toast"
import { soundOn, setSoundOn } from "@/lib/sound"
import { PhoneInput } from "@/components/ui/PhoneInput"
import { User as UserIcon, Camera } from "@phosphor-icons/react"
import { useAuth } from "@/context/AuthContext"
import { useTheme, MODES, PHOTOS, photoThumb, type ThemeId, type LangId } from "@/context/ThemeContext"
import { ImageCropModal } from "@/components/ui/ImageCropModal"
import {
  ROLE_LABELS,
  updateMyProfile,
  updatePassword,
  uploadUserAvatar,
  type UserProfile,
} from "@/lib/supabase/queries/auth"

export function Sozlamalar() {
  const { user } = useAuth()
  // App-wide notification (components/ui/Toaster)
  function showToast(message: string, type: "success" | "error" = "success") {
    if (type === "success") notify.success(message)
    else notify.error(message)
  }

  return (
    <div className="flex flex-col pb-10 max-w-[960px]">

      {user && <ProfileTab key={user.id} user={user} showToast={showToast} />}
      <PreferencesRows />
    </div>
  )
}

// ─── Profile Form ───────────────────────────────────────

/** "username", "@username" or a t.me link → "@username"; empty → null */
function normTelegram(v: string): string | null {
  const u = v.trim().replace(/^(https?:\/\/)?t\.me\//i, "").replace(/^@/, "")
  return u ? `@${u}` : null
}

function ProfileTab({
  user,
  showToast,
}: {
  user: UserProfile
  showToast: (msg: string, type?: "success" | "error") => void
}) {
  const { refreshProfile } = useAuth()
  const uid = useId()
  const [fullName, setFullName] = useState(user.full_name)
  const [phone, setPhone] = useState(user.phone ?? "")
  const [telegram, setTelegram] = useState(user.telegram ?? "")
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url)
  const [saving, setSaving] = useState(false)

  // Password change
  // Opened straight away when coming from the "change your temporary password" banner
  const [showPasswordForm, setShowPasswordForm] = useState(() => user.must_change_password || window.location.hash === "#parol")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwdSaving, setPwdSaving] = useState(false)

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string>("")
  const [showCrop, setShowCrop] = useState(false)
  const [uploading, setUploading] = useState(false)

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      showToast("Rasm hajmi 5MB dan oshmasligi kerak", "error")
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      setCropSrc(reader.result as string)
      setShowCrop(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  async function handleCropped(blob: Blob) {
    setShowCrop(false)
    setUploading(true)
    try {
      const url = await uploadUserAvatar(blob, user.id)
      await updateMyProfile({ avatar_url: url })
      setAvatarUrl(url)
      await refreshProfile()
      showToast("Avatar yangilandi")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Avatar yuklashda xatolik", "error")
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateMyProfile({
        full_name: fullName.trim() || user.full_name,
        phone: phone.trim() || null,
        telegram: normTelegram(telegram),
      })
      await refreshProfile()
      showToast("Profil saqlandi")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Saqlashda xatolik", "error")
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordChange() {
    if (newPassword.length < 6) {
      showToast("Parol kamida 6 belgidan iborat bo'lishi kerak", "error")
      return
    }
    if (newPassword !== confirmPassword) {
      showToast("Parollar mos kelmadi", "error")
      return
    }
    setPwdSaving(true)
    try {
      await updatePassword(newPassword)
      await refreshProfile()  // clears the first-login banner
      setNewPassword("")
      setConfirmPassword("")
      setShowPasswordForm(false)
      showToast("Parol o'zgartirildi")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Parolni o'zgartirishda xatolik", "error")
    } finally {
      setPwdSaving(false)
    }
  }

  const dirty = fullName.trim() !== user.full_name || (phone.trim() || null) !== (user.phone ?? null) || normTelegram(telegram) !== (user.telegram ?? null)

  return (
    <div className="flex flex-col">
      {/* Photo */}
      <SettingsRow title="Profil rasmi" desc="Sidebar'da va jurnal yozuvlarida ko'rinadi. JPG yoki PNG, 5MB gacha.">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Rasmni o'zgartirish"
            className="relative size-16 rounded-full bg-mute-soft flex items-center justify-center overflow-hidden cursor-pointer group flex-shrink-0"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={28} weight="light" className="text-ink-muted" />
            )}
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera size={20} className="text-white" />
            </span>
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className={softBtn}>
            {uploading ? "Yuklanmoqda…" : avatarUrl ? "Rasmni almashtirish" : "Rasm yuklash"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
        </div>
      </SettingsRow>

      {/* Personal info */}
      <SettingsRow title="Shaxsiy ma'lumotlar" desc="Ism, telefon va Telegram'ni o'zingiz o'zgartira olasiz. Email va rolni administrator belgilaydi.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-full-name`} className={labelCls}>Ism familiya</label>
            <input id={`${uid}-full-name`} type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-phone`} className={labelCls}>Telefon</label>
            <PhoneInput id={`${uid}-phone`} value={phone} onChange={setPhone} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-telegram`} className={labelCls}>Telegram username</label>
            <input id={`${uid}-telegram`} type="text" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" className={inputCls} />
            <span className="text-xs text-ink-muted">Vazifa eslatmalarida guruhda shu username bilan belgilanasiz</span>
          </div>
          <ReadOnly label="Email" value={user.email} />
          <ReadOnly label="Rol" value={ROLE_LABELS[user.role]} />
        </div>
        <div className="flex justify-end mt-5">
          <button type="button" onClick={handleSave} disabled={saving || !dirty} className={primaryBtn}>
            {saving ? "Saqlanmoqda…" : "O'zgarishlarni saqlash"}
          </button>
        </div>
      </SettingsRow>

      {/* Password */}
      <SettingsRow id="parol" title="Parol" desc="Kamida 6 belgi. O'zgartirgach, keyingi kirishda yangi paroldan foydalaning.">
        {user.must_change_password && (
          <p role="alert" className="mb-4 px-3.5 py-2.5 rounded-control bg-danger-soft text-base text-danger-text">
            Siz administrator bergan vaqtincha parol bilan kirdingiz. Iltimos, o'zingizning parolingizni o'rnating.
          </p>
        )}
        {showPasswordForm ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${uid}-pwd`} className={labelCls}>Yangi parol</label>
                <input id={`${uid}-pwd`} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${uid}-pwd2`} className={labelCls}>Parolni tasdiqlang</label>
                <input id={`${uid}-pwd2`} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowPasswordForm(false); setNewPassword(""); setConfirmPassword("") }}
                disabled={pwdSaving || user.must_change_password}
                className={softBtn}
              >
                Bekor qilish
              </button>
              <button type="button" onClick={handlePasswordChange} disabled={pwdSaving || !newPassword} className={primaryBtn}>
                {pwdSaving ? "Saqlanmoqda…" : "Parolni yangilash"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <span className="text-base text-ink-muted tracking-widest">••••••••</span>
            <button type="button" onClick={() => setShowPasswordForm(true)} className={softBtn}>
              Parolni o'zgartirish
            </button>
          </div>
        )}
      </SettingsRow>

      <ImageCropModal
        isOpen={showCrop}
        imageSrc={cropSrc}
        onClose={() => setShowCrop(false)}
        onCropped={handleCropped}
      />
    </div>
  )
}

// ─── Appearance + language (device preferences, not saved to the profile) ───

const PREVIEW: Record<ThemeId, { ground: string; card: string }> = {
  light:    { ground: "#f2f2f2", card: "#ffffff" },
  contrast: { ground: "#0b0b0c", card: "#ffffff" },
  dark:     { ground: "#0b0b0c", card: "#141416" },
}
const THEME_OPTIONS = MODES.map((m) => ({ ...m, ...PREVIEW[m.id] }))

const LANG_OPTIONS: { id: LangId; label: string }[] = [
  { id: "uz", label: "O'zbekcha" },
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
]

function PreferencesRows() {
  const { themeId, setThemeId, photo, setPhoto, lang, setLang } = useTheme()
  const [sound, setSound] = useState(soundOn)
  return (
    <>
      <SettingsRow title="Ko'rinish" desc="Rejim va ixtiyoriy fon rasmi. Tanlov shu qurilmada saqlanadi.">
        <div role="radiogroup" aria-label="Rejim" className="grid grid-cols-3 gap-3 max-w-[480px]">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={themeId === t.id}
              onClick={() => setThemeId(t.id)}
              className={`flex flex-col gap-2 p-2 rounded-surface border transition-colors ${themeId === t.id ? "border-line-focus" : "border-line hover:bg-mute-ghost-hover"}`}
            >
              {/* mini preview: ground + sidebar strip + main card (fixed colours on purpose) */}
              <span className="h-14 rounded-control flex gap-1 p-1" style={{ background: t.ground }}>
                <span className="w-1/4 rounded-sm" style={{ background: t.id === "light" ? "#e4e4e4" : "#1c1c1f" }} />
                <span className="flex-1 rounded-sm" style={{ background: t.card }} />
              </span>
              <span className="text-base font-medium text-ink">{t.label}</span>
            </button>
          ))}
        </div>
        <span className="block text-sm font-medium text-ink-muted mt-5 mb-2">Fon rasmi</span>
        <div role="radiogroup" aria-label="Fon rasmi" className="grid grid-cols-3 sm:grid-cols-5 gap-3 max-w-[640px]">
          <button type="button" role="radio" aria-checked={!photo} onClick={() => setPhoto(null)}
            className={`h-16 rounded-control bg-surface-sunken border text-base text-ink-muted transition-colors ${!photo ? "border-line-focus text-ink" : "border-line hover:text-ink"}`}>
            Yo'q
          </button>
          {PHOTOS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={photo === p.id} onClick={() => setPhoto(p.id)}
              className={`relative h-16 rounded-control border bg-cover bg-center overflow-hidden ${photo === p.id ? "border-line-focus ring-2 ring-[var(--switch-on)]" : "border-line"}`}
              style={{ backgroundImage: `url(${photoThumb(p.id)})` }}>
              <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-sm font-medium text-white bg-black/35 text-left">{p.label}</span>
            </button>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow title="Ovozlar" desc="Vazifa, mijoz, hodim qo'shilganda yoki xatolik bo'lganda yumshoq ovoz. Tanlov shu qurilmada saqlanadi.">
        <div role="radiogroup" aria-label="Ovozlar" className="inline-grid grid-cols-2 gap-1 p-1 rounded-control bg-surface-sunken">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={sound === v}
              onClick={() => { setSound(v); setSoundOn(v) }}
              className={`h-8 px-4 rounded-item text-base font-medium transition-colors ${sound === v ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}>
              {v ? "Yoqilgan" : "O'chirilgan"}
            </button>
          ))}
        </div>
      </SettingsRow>

      <SettingsRow title="Til" desc="Interfeys tili. Hozircha tarjimalar tayyorlanmoqda — matnlar o'zbekcha qoladi." last>
        <div role="radiogroup" aria-label="Til" className="inline-grid grid-cols-3 gap-1 p-1 rounded-control bg-surface-sunken">
          {LANG_OPTIONS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={lang === l.id}
              onClick={() => setLang(l.id)}
              className={`h-8 px-4 rounded-item text-base font-medium transition-colors ${lang === l.id ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </SettingsRow>
    </>
  )
}

// ─── Layout pieces ──────────────────────────────────────

const labelCls = "text-sm font-medium text-ink-muted"
const inputCls =
  "w-full h-control-md border border-line rounded-control px-3 text-base text-ink bg-surface placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
const softBtn =
  "flex items-center gap-2 px-3.5 h-control-md rounded-full bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50"
const primaryBtn =
  "px-4 h-control-md rounded-full bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"

/** One settings group: title + hint on the left, controls on the right, hairline between groups */
function SettingsRow({ id, title, desc, last, children }: { id?: string; title: string; desc: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={`grid grid-cols-1 md:grid-cols-[260px_1fr] gap-x-10 gap-y-4 py-7 first:pt-2 ${last ? "" : "border-b border-line"}`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink-muted leading-relaxed">{desc}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <span className="h-control-md px-3 flex items-center rounded-control bg-surface-sunken text-base text-ink-muted truncate">{value}</span>
    </div>
  )
}
