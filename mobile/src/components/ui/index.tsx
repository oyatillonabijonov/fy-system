import type { ReactNode } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import Ionicons from "@expo/vector-icons/Ionicons"
import { colors, font, radius, radiusLg, spacing } from "@/theme/tokens"

// ── Button ──────────────────────────────────────────────

interface ButtonProps {
  title: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: "primary" | "secondary" | "danger"
  style?: StyleProp<ViewStyle>
}

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = "primary",
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading
  const bg =
    variant === "primary" ? colors.accent
    : variant === "danger" ? colors.danger
    : colors.surface
  const fg = variant === "secondary" ? colors.text : "#FFFFFF"

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: isDisabled ? "#CCCCCC" : bg, opacity: pressed ? 0.85 : 1 },
        variant === "secondary" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: isDisabled ? "#FFFFFF" : fg }]}>{title}</Text>
      )}
    </Pressable>
  )
}

// ── Card ────────────────────────────────────────────────

export function Card({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return <View style={[styles.card, style]}>{children}</View>
}

// ── Badge ───────────────────────────────────────────────

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string
  tone?: "neutral" | "success" | "danger" | "warning"
}) {
  const palette = {
    neutral: { bg: colors.bg, fg: colors.muted },
    success: { bg: colors.successBg, fg: colors.success },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    warning: { bg: colors.warningBg, fg: colors.warning },
  }[tone]

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  )
}

// ── Section header (dashboard-style uppercase label) ────

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={8} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.muted} />
        </Pressable>
      )}
    </View>
  )
}

// ── Icon circle (transaction / list leading icon) ───────

export function IconCircle({
  name,
  bg,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap
  bg: string
  color: string
}) {
  return (
    <View style={[styles.iconCircle, { backgroundColor: bg }]}>
      <Ionicons name={name} size={17} color={color} />
    </View>
  )
}

// ── Loading & empty states ──────────────────────────────

export function LoadingState() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent} />
    </View>
  )
}

export function EmptyState({
  message,
  icon = "file-tray-outline",
}: {
  message: string
  icon?: keyof typeof Ionicons.glyphMap
}) {
  return (
    <View style={styles.centered}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color={colors.muted} />
      </View>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyText}>{message ?? "Ma'lumotlarni yuklashda xatolik"}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={{ marginTop: spacing.md }}>
          <Text style={styles.retryText}>Qayta urinish</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: radius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  buttonText: {
    ...font.bold,
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radiusLg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeText: {
    ...font.bold,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { ...font.bold, fontSize: 17, color: colors.text },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  sectionActionText: { ...font.semibold, fontSize: 13, color: colors.muted },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    minHeight: 180,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    ...font.medium,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  retryText: {
    ...font.bold,
    fontSize: 13,
    color: colors.text,
    textDecorationLine: "underline",
  },
})
