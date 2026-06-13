export type Department =
  | "marketing"
  | "sotuv"
  | "buxgalteriya"
  | "operatsion"
  | "it"
  | "hr"

export const DEPARTMENTS: { value: Department; label: string; color: string }[] = [
  { value: "marketing",    label: "Marketing",    color: "#EC4899" },
  { value: "sotuv",        label: "Sotuv",        color: "#3B82F6" },
  { value: "buxgalteriya", label: "Buxgalteriya", color: "#10B981" },
  { value: "operatsion",   label: "Operatsion",   color: "#F59E0B" },
  { value: "it",           label: "IT",           color: "#8B5CF6" },
  { value: "hr",           label: "HR",           color: "#06B6D4" },
]

export function departmentLabel(d: Department | null | undefined): string {
  if (!d) return "—"
  return DEPARTMENTS.find((x) => x.value === d)?.label ?? d
}

export function departmentColor(d: Department | null | undefined): string {
  if (!d) return "#999999"
  return DEPARTMENTS.find((x) => x.value === d)?.color ?? "#999999"
}

// Suggested positions (admin can type custom)
export const POSITION_SUGGESTIONS = [
  "CEO", "CTO", "CFO", "COO",
  "Manager", "Senior Manager", "Lead",
  "Senior Specialist", "Specialist", "Junior Specialist",
  "Coordinator", "Assistant", "Intern",
]
