import { useState } from "react"
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Image } from "expo-image"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useAuth } from "@/context/AuthContext"
import { useUpdateProfile } from "@/hooks/useProfile"
import { useMyParticipations } from "@/hooks/useEvents"
import { signOut } from "@/lib/supabase/queries/profile"
import { formatDate, formatMoney } from "@/lib/format"
import { Badge, Button, Card, IconCircle, SectionHeader } from "@/components/ui"
import { colors, font, radius, spacing } from "@/theme/tokens"

interface EditState {
  full_name: string
  phone: string
  company: string
  activity: string
  industry: string
}

export default function ProfileScreen() {
  const { client } = useAuth()
  const updateMutation = useUpdateProfile()
  const participationsQuery = useMyParticipations()

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditState | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!client) return null

  function startEdit() {
    if (!client) return
    setForm({
      full_name: client.full_name,
      phone: client.phone ?? "",
      company: client.company ?? "",
      activity: client.activity ?? "",
      industry: client.industry ?? "",
    })
    setEditing(true)
    setError(null)
  }

  async function saveEdit() {
    if (!form) return
    if (!form.full_name.trim()) {
      setError("Ism bo'sh bo'lishi mumkin emas")
      return
    }
    try {
      await updateMutation.mutateAsync({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || undefined,
        company: form.company.trim() || undefined,
        activity: form.activity.trim() || undefined,
        industry: form.industry.trim() || undefined,
      })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    }
  }

  function confirmSignOut() {
    Alert.alert("Chiqish", "Hisobdan chiqmoqchimisiz?", [
      { text: "Bekor qilish", style: "cancel" },
      { text: "Chiqish", style: "destructive", onPress: () => void signOut() },
    ])
  }

  const participations = participationsQuery.data ?? []
  const totalPaid = participations.reduce((sum, p) => sum + Number(p.paid), 0)

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Profil</Text>
          <Pressable onPress={confirmSignOut} hitSlop={8} style={styles.signOutBtn}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={styles.signOutText}>Chiqish</Text>
          </Pressable>
        </View>

        {/* Identity card */}
        <Card style={styles.identityCard}>
          {client.image ? (
            <Image source={{ uri: client.image }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{client.full_name.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.identityInfo}>
            <Text style={styles.name}>{client.full_name}</Text>
            {client.company && <Text style={styles.company}>{client.company}</Text>}
            <Badge label={client.status} tone={client.status === "Faol" ? "success" : "danger"} />
          </View>
          {!editing && (
            <Pressable onPress={startEdit} hitSlop={8} style={styles.editBtn}>
              <Ionicons name="pencil-outline" size={17} color={colors.text} />
            </Pressable>
          )}
        </Card>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{participations.length}</Text>
            <Text style={styles.statLabel}>Tadbirlar</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{formatMoney(totalPaid)}</Text>
            <Text style={styles.statLabel}>Jami to'lovlar</Text>
          </Card>
        </View>

        {/* Edit form / details */}
        {editing && form ? (
          <Card style={styles.formCard}>
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            {(
              [
                { key: "full_name", label: "Ism familiya" },
                { key: "phone", label: "Telefon" },
                { key: "company", label: "Kompaniya" },
                { key: "activity", label: "Faoliyat" },
                { key: "industry", label: "Soha" },
              ] as const
            ).map(({ key, label }) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  value={form[key]}
                  onChangeText={(v) => setForm({ ...form, [key]: v })}
                  style={styles.input}
                  placeholderTextColor="#CCCCCC"
                />
              </View>
            ))}
            <View style={styles.formActions}>
              <Button
                title="Bekor qilish"
                variant="secondary"
                onPress={() => setEditing(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Saqlash"
                onPress={() => void saveEdit()}
                loading={updateMutation.isPending}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        ) : (
          <Card style={styles.detailsCard}>
            <DetailRow icon="call-outline" label="Telefon" value={client.phone} />
            <View style={styles.divider} />
            <DetailRow icon="mail-outline" label="Email" value={client.email} />
            <View style={styles.divider} />
            <DetailRow icon="briefcase-outline" label="Faoliyat" value={client.activity} />
            <View style={styles.divider} />
            <DetailRow icon="business-outline" label="Soha" value={client.industry} />
          </Card>
        )}

        {/* Payment history */}
        <SectionHeader title="To'lovlar tarixi" />
        {participations.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>Hozircha tadbirlarda qatnashmagansiz</Text>
          </Card>
        ) : (
          <View style={styles.historyList}>
            {participations.map((p) => {
              const price = Number(p.price)
              const paid = Number(p.paid)
              const fullyPaid = price > 0 && paid >= price
              return (
                <Card key={p.id} style={styles.historyCard}>
                  <IconCircle
                    name={fullyPaid ? "checkmark-outline" : "time-outline"}
                    bg={fullyPaid ? colors.successBg : colors.bg}
                    color={fullyPaid ? colors.success : colors.muted}
                  />
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyEvent} numberOfLines={1}>
                      {p.events?.name ?? "Tadbir"}
                    </Text>
                    <Text style={styles.historyDate}>
                      {formatDate(p.events?.date ?? p.created_at)}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyAmount}>
                      {price > 0 ? `${formatMoney(paid)} / ${formatMoney(price)}` : "Bepul"}
                    </Text>
                    {price > 0 && (
                      <Badge
                        label={fullyPaid ? "To'langan" : paid > 0 ? "Qisman" : "Kutilmoqda"}
                        tone={fullyPaid ? "success" : paid > 0 ? "warning" : "neutral"}
                      />
                    )}
                  </View>
                </Card>
              )
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string | null
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...font.bold, fontSize: 22, color: colors.text },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius,
    backgroundColor: colors.dangerBg,
  },
  signOutText: { ...font.semibold, fontSize: 12.5, color: colors.danger },

  identityCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { ...font.bold, fontSize: 22, color: "#FFFFFF" },
  identityInfo: { flex: 1, gap: 4 },
  name: { ...font.bold, fontSize: 17, color: colors.text },
  company: { ...font.regular, fontSize: 13, color: colors.muted },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },

  statsRow: { flexDirection: "row", gap: spacing.md },
  statCard: { flex: 1, gap: 2, paddingVertical: spacing.md },
  statValue: { ...font.bold, fontSize: 16, color: colors.text },
  statLabel: { ...font.medium, fontSize: 11, color: colors.muted },

  detailsCard: { gap: spacing.md },
  detailRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  detailLabel: { ...font.medium, fontSize: 13, color: colors.muted, width: 72 },
  detailValue: { ...font.medium, fontSize: 14, color: colors.text, flex: 1 },
  divider: { height: 1, backgroundColor: colors.borderLight },

  formCard: { gap: spacing.md },
  field: { gap: 6 },
  label: { ...font.medium, fontSize: 12, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingHorizontal: spacing.md,
    height: 46,
    ...font.regular,
    fontSize: 15,
    color: colors.text,
  },
  formActions: { flexDirection: "row", gap: spacing.sm },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: radius, padding: spacing.md },
  errorText: { ...font.medium, fontSize: 12, color: colors.danger },

  historyList: { gap: spacing.sm },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  historyLeft: { flex: 1, gap: 2 },
  historyEvent: { ...font.semibold, fontSize: 14, color: colors.text },
  historyDate: { ...font.regular, fontSize: 11.5, color: colors.muted },
  historyRight: { alignItems: "flex-end", gap: 4 },
  historyAmount: { ...font.medium, fontSize: 12.5, color: colors.text },

  emptyCard: { alignItems: "center", paddingVertical: spacing.xl },
  emptyText: { ...font.medium, fontSize: 13, color: colors.muted },
})
