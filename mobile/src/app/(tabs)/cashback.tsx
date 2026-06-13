import { FlatList, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useAuth } from "@/context/AuthContext"
import { useMyCashbackHistory } from "@/hooks/useCashback"
import type { CashbackType } from "@/lib/supabase/queries/cashback"
import { formatDate, formatMoney } from "@/lib/format"
import { Card, EmptyState, ErrorState, IconCircle, LoadingState } from "@/components/ui"
import { colors, font, radiusLg, spacing } from "@/theme/tokens"

const TYPE_META: Record<
  CashbackType,
  { label: string; sign: "+" | "-"; icon: "gift-outline" | "cart-outline" | "add-outline" | "remove-outline" }
> = {
  earned: { label: "Tadbirdan", sign: "+", icon: "gift-outline" },
  used: { label: "Ishlatildi", sign: "-", icon: "cart-outline" },
  manual_add: { label: "Qo'shildi", sign: "+", icon: "add-outline" },
  manual_subtract: { label: "Ayirildi", sign: "-", icon: "remove-outline" },
}

export default function CashbackScreen() {
  const { client } = useAuth()
  const { data: history, isLoading, isError, refetch, isRefetching } = useMyCashbackHistory()

  const balance = Number(client?.cashback_balance ?? 0)
  const totalEarned = (history ?? [])
    .filter((t) => t.type === "earned" || t.type === "manual_add")
    .reduce((sum, t) => sum + Number(t.amount), 0)

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Cashback</Text>

        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <Text style={styles.balanceLabel}>JORIY BALANS</Text>
            <View style={styles.balanceIcon}>
              <Ionicons name="wallet-outline" size={16} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.balanceValue}>{formatMoney(balance)}</Text>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceFooter}>
            <Text style={styles.balanceFooterLabel}>Jami yig'ilgan</Text>
            <Text style={styles.balanceFooterValue}>{formatMoney(totalEarned)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Tranzaksiyalar</Text>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (history ?? []).length === 0 ? (
        <EmptyState icon="wallet-outline" message="Hozircha tranzaksiyalar yo'q" />
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type as CashbackType] ?? TYPE_META.earned
            const positive = meta.sign === "+"
            return (
              <Card style={styles.txCard}>
                <IconCircle
                  name={meta.icon}
                  bg={positive ? colors.successBg : colors.dangerBg}
                  color={positive ? colors.success : colors.danger}
                />
                <View style={styles.txLeft}>
                  <Text style={styles.txType}>{meta.label}</Text>
                  <Text style={styles.txDesc} numberOfLines={1}>
                    {item.description ?? formatDate(item.created_at)}
                  </Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[styles.txAmount, { color: positive ? colors.success : colors.danger }]}>
                    {meta.sign}{formatMoney(Number(item.amount))}
                  </Text>
                  <Text style={styles.txDate}>{formatDate(item.created_at)}</Text>
                </View>
              </Card>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.lg, gap: spacing.lg },
  title: { ...font.bold, fontSize: 22, color: colors.text },
  balanceCard: {
    backgroundColor: colors.accent,
    borderRadius: radiusLg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  balanceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceLabel: {
    ...font.bold,
    fontSize: 10,
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 1,
  },
  balanceIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  balanceValue: { ...font.bold, fontSize: 30, color: "#FFFFFF", letterSpacing: -0.5 },
  balanceDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.12)" },
  balanceFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceFooterLabel: { ...font.regular, fontSize: 12, color: "rgba(255,255,255,0.6)" },
  balanceFooterValue: { ...font.semibold, fontSize: 13, color: "#FFFFFF" },
  sectionTitle: { ...font.bold, fontSize: 17, color: colors.text },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  txLeft: { flex: 1, gap: 2 },
  txType: { ...font.semibold, fontSize: 14, color: colors.text },
  txDesc: { ...font.regular, fontSize: 12, color: colors.muted },
  txRight: { alignItems: "flex-end", gap: 2 },
  txAmount: { ...font.bold, fontSize: 14 },
  txDate: { ...font.regular, fontSize: 11, color: colors.muted },
})
