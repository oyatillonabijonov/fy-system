export type LeadSource = "amocrm" | "manual" | "telegram"
export type CallType = "answered" | "missed" | "none"

export interface LeadResponsible {
  name: string
  initials: string
  color: string
}

export interface Lead {
  id: string
  name: string
  company: string | null
  stage: string
  responsible: LeadResponsible
  amount: number
  lastCall: {
    time: string
    type: CallType
  }
  source: LeadSource
  createdAt: string
  amoId: string | null
  phone?: string
  email?: string
  contactName?: string
}

export interface StageConfig {
  label: string
  color: string
  bg: string
  dot: string
}

/** Color palette for dynamic stage assignment */
const STAGE_PALETTE: { color: string; bg: string; dot: string }[] = [
  { color: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-500" },
  { color: "text-cyan-600", bg: "bg-cyan-50", dot: "bg-cyan-500" },
  { color: "text-orange-600", bg: "bg-orange-50", dot: "bg-orange-500" },
  { color: "text-purple-600", bg: "bg-purple-50", dot: "bg-purple-500" },
  { color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
  { color: "text-pink-600", bg: "bg-pink-50", dot: "bg-pink-500" },
  { color: "text-indigo-600", bg: "bg-indigo-50", dot: "bg-indigo-500" },
  { color: "text-teal-600", bg: "bg-teal-50", dot: "bg-teal-500" },
]

const WON_STYLE = { color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-600" }
const LOST_STYLE = { color: "text-red-600", bg: "bg-red-50", dot: "bg-red-500" }

const FALLBACK_STAGE: StageConfig = {
  label: "Noma'lum",
  color: "text-gray-600",
  bg: "bg-gray-50",
  dot: "bg-gray-500",
}

/** Build StageConfig map from pipeline statuses */
export function buildStageConfigs(
  statuses: { id: number; name: string; type: number }[]
): Record<string, StageConfig> {
  const configs: Record<string, StageConfig> = {}
  let paletteIdx = 0

  for (const status of statuses) {
    const key = String(status.id)
    let style: { color: string; bg: string; dot: string }

    if (status.type === 142) {
      style = WON_STYLE
    } else if (status.type === 143) {
      style = LOST_STYLE
    } else {
      style = STAGE_PALETTE[paletteIdx % STAGE_PALETTE.length]
      paletteIdx++
    }

    configs[key] = { label: status.name, ...style }
  }

  return configs
}

/** Safely get stage config with fallback */
export function getStageConfig(
  configs: Record<string, StageConfig>,
  stage: string
): StageConfig {
  return configs[stage] ?? FALLBACK_STAGE
}

export function filterLeadsByStage(leads: Lead[], stage: string): Lead[] {
  return leads.filter((lead) => lead.stage === stage)
}

export function getTotalAmount(leads: Lead[]): number {
  return leads.reduce((sum, lead) => sum + lead.amount, 0)
}
