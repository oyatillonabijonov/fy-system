import { useEffect, useId, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { useUsers } from "@/hooks/useUsers"
import { useCreateLead } from "@/hooks/useSotuv"
import { Link } from "react-router-dom"
import { ArrowRight, WarningCircle } from "@phosphor-icons/react"
import { findClientByPhone, SOURCES, type PhoneMatch, type Stage } from "@/lib/supabase/queries/sotuv"
import { ModalShell, INPUT, LABEL } from "@/components/moliya/PaymentActionModals"
import { PhoneInput } from "@/components/ui/PhoneInput"

/** New deal: a client (a phone already in the base reuses that client), amount, source, owner */
export function LeadCreate({ pipelineId, stages, stageId, initialPhone, onClose, onCreated }: {
  pipelineId: string
  /** "+998XXXXXXXXX" — e.g. a call from the Qo'ng'iroqlar page */
  initialPhone?: string
  stages: Stage[]
  stageId: string | null
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { user } = useAuth()
  const { data: users = [] } = useUsers()
  const create = useCreateLead()
  const open = stages.filter((s) => !s.is_won && !s.is_lost)
  const [f, setF] = useState({
    client_name: "", phone: initialPhone ?? "", price: "", source: "manual",
    stage_id: stageId ?? open[0]?.id ?? "", responsible_user_id: user?.id ?? "",
  })
  const [existing, setExisting] = useState<PhoneMatch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ids = { name: useId(), phone: useId(), price: useId(), source: useId(), stage: useId(), owner: useId() }
  const set = (patch: Partial<typeof f>) => setF((c) => ({ ...c, ...patch }))

  // Same phone already in the base? The deal goes to that client — say so while typing
  useEffect(() => {
    if (f.phone.length !== 13) return
    let live = true
    findClientByPhone(f.phone).then((c) => { if (live) setExisting(c) }).catch(() => {})
    return () => { live = false; setExisting(null) }
  }, [f.phone])

  const canSubmit = !!f.stage_id && (!!f.client_name.trim() || f.phone.length === 13)
  function submit() {
    create.mutate({
      pipeline_id: pipelineId, stage_id: f.stage_id, name: "",   // the bitim is named after its client
      client_name: existing ? "" : f.client_name.trim(), phone: f.phone,
      price: Number(f.price.replace(/\D/g, "")) || 0, source: f.source, responsible_user_id: f.responsible_user_id || null,
    }, { onSuccess: onCreated, onError: (e) => setError(e.message) })
  }

  return (
    <ModalShell title="Yangi bitim" error={error} submitLabel={existing?.open.length ? "Baribir yangi ochish" : "Qo'shish"} canSubmit={canSubmit} pending={create.isPending} onSubmit={submit} onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.phone} className={LABEL}>Telefon</label>
        <PhoneInput id={ids.phone} value={f.phone} onChange={(phone) => set({ phone })} />
        {existing && !existing.open.length && <span className="text-sm text-info-text">Mavjud mijoz: <b className="font-medium">{existing.full_name}</b> — bitim unga qo'shiladi</span>}
      </div>
      {/* The client already has an open deal: open it instead of making a duplicate */}
      {existing && existing.open.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-control bg-warning-soft p-3">
          <span className="flex items-start gap-2 text-sm text-warning-dark">
            <WarningCircle size={16} className="shrink-0 mt-0.5" />
            <span><b className="font-medium">{existing.full_name}</b>ning ochiq bitimi bor — yangisi dublikat bo'ladi.</span>
          </span>
          {existing.open.map((l) => (
            <Link key={l.id} to={`/sotuv/bitim/${l.id}`} onClick={onClose}
              className="flex items-center gap-2 h-10 px-3 rounded-control bg-surface text-sm text-ink hover:bg-surface-raised transition-colors">
              <span className="flex-1 min-w-0 truncate"><span className="font-medium">{l.name}</span><span className="text-ink-muted"> · {l.pipeline} › {l.stage}</span></span>
              <span className="shrink-0 inline-flex items-center gap-1 text-ink-muted">Ochish<ArrowRight size={16} /></span>
            </Link>
          ))}
        </div>
      )}
      {!existing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.name} className={LABEL}>Mijoz ismi</label>
          <input id={ids.name} autoFocus value={f.client_name} onChange={(e) => set({ client_name: e.target.value })} placeholder="Aziz Karimov" className={INPUT} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.price} className={LABEL}>Summa</label>
          <input id={ids.price} inputMode="numeric" value={f.price} placeholder="0"
            onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); set({ price: d ? Number(d).toLocaleString("ru-RU") : "" }) }} className={INPUT} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.source} className={LABEL}>Manba</label>
          <select id={ids.source} value={f.source} onChange={(e) => set({ source: e.target.value })} className={INPUT}>
            {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.stage} className={LABEL}>Bosqich</label>
          <select id={ids.stage} value={f.stage_id} onChange={(e) => set({ stage_id: e.target.value })} className={INPUT}>
            {open.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.owner} className={LABEL}>Mas'ul</label>
          <select id={ids.owner} value={f.responsible_user_id} onChange={(e) => set({ responsible_user_id: e.target.value })} className={INPUT}>
            <option value="">Belgilanmagan</option>
            {users.filter((u) => u.is_active !== false).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
      </div>
    </ModalShell>
  )
}
