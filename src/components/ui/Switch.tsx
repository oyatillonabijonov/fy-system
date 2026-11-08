export function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
      className={`relative inline-flex h-5 w-9 max-lg:h-7 max-lg:w-12 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--switch-on)]" : "bg-mute-soft-hover"}`}>
      <span className={`absolute top-0.5 size-4 max-lg:size-6 rounded-full bg-surface max-lg:bg-surface-raised transition-all ${on ? "left-[18px] max-lg:left-[22px]" : "left-0.5"}`} />
    </button>
  )
}
