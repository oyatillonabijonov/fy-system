import type { TextStyle } from "react-native"

// Design tokens mirroring the dashboard's neutral theme
// (src/index.css [data-theme="neutral"] in the web app).
export const colors = {
  bg: "#F3F2F0",
  surface: "#FFFFFF",
  text: "#141414",
  muted: "#999999",
  border: "#E0E0E0",
  borderLight: "#F0F0F0",
  accent: "#141414",
  hover: "#F9F9F8",
  success: "#15803D",
  successBg: "#F0FDF4",
  danger: "#DC2626",
  dangerBg: "#FEF2F2",
  warning: "#C2410C",
  warningBg: "#FFF7ED",
} as const

export const radius = 8
export const radiusLg = 12

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

// System font (SF Pro on iOS) — weights instead of custom font files.
export const font: Record<"regular" | "medium" | "semibold" | "bold", TextStyle> = {
  regular: { fontWeight: "400" },
  medium: { fontWeight: "500" },
  semibold: { fontWeight: "600" },
  bold: { fontWeight: "700" },
}
