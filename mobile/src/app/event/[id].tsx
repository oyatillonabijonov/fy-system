import { useMemo, useState } from "react"
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router, useLocalSearchParams } from "expo-router"
import { Image } from "expo-image"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useEvent, useMyParticipations, useRegisterForEvent } from "@/hooks/useEvents"
import { formatDateTime, formatMoney } from "@/lib/format"
import { Badge, Button, Card, ErrorState, IconCircle, LoadingState } from "@/components/ui"
import { colors, font, radius, spacing } from "@/theme/tokens"

function isEventPast(date: string | null): boolean {
  return Boolean(date && new Date(date).getTime() < Date.now())
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: event, isLoading, isError, refetch } = useEvent(id ?? "")
  const participationsQuery = useMyParticipations()
  const registerMutation = useRegisterForEvent()
  const [registerError, setRegisterError] = useState<string | null>(null)

  const myParticipation = useMemo(
    () => (participationsQuery.data ?? []).find((p) => p.event_id === id),
    [participationsQuery.data, id],
  )

  const isPast = isEventPast(event?.date ?? null)

  async function handleRegister() {
    setRegisterError(null)
    try {
      await registerMutation.mutateAsync(id ?? "")
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Xatolik yuz berdi")
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Tadbir</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <LoadingState />
      ) : isError || !event ? (
        <ErrorState message="Tadbir topilmadi" onRetry={() => void refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {event.cover_image ? (
            <Image source={{ uri: event.cover_image }} style={styles.cover} contentFit="cover" />
          ) : (
            <View style={[styles.cover, styles.coverFallback]}>
              <Ionicons name="calendar" size={36} color="rgba(255,255,255,0.85)" />
            </View>
          )}

          <View style={styles.titleBlock}>
            <Text style={styles.name}>{event.name}</Text>
            {isPast && <Badge label="Yakunlangan" tone="neutral" />}
          </View>

          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <IconCircle name="time-outline" bg={colors.bg} color={colors.text} />
              <View style={styles.infoTextBlock}>
                <Text style={styles.infoLabel}>Sana va vaqt</Text>
                <Text style={styles.infoValue}>{formatDateTime(event.date)}</Text>
              </View>
            </View>
            {event.location && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <IconCircle name="location-outline" bg={colors.bg} color={colors.text} />
                  <View style={styles.infoTextBlock}>
                    <Text style={styles.infoLabel}>Manzil</Text>
                    <Text style={styles.infoValue}>{event.location}</Text>
                  </View>
                </View>
              </>
            )}
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <IconCircle name="pricetag-outline" bg={colors.bg} color={colors.text} />
              <View style={styles.infoTextBlock}>
                <Text style={styles.infoLabel}>Narxi</Text>
                <Text style={styles.infoValue}>
                  {Number(event.price) > 0 ? formatMoney(Number(event.price)) : "Bepul"}
                </Text>
              </View>
            </View>
            {Number(event.cashback_percent) > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <IconCircle name="gift-outline" bg={colors.successBg} color={colors.success} />
                  <View style={styles.infoTextBlock}>
                    <Text style={styles.infoLabel}>Cashback</Text>
                    <Text style={[styles.infoValue, { color: colors.success }]}>
                      To'lovning {Number(event.cashback_percent)}% i qaytadi
                    </Text>
                  </View>
                </View>
              </>
            )}
          </Card>

          {event.description && (
            <Card style={styles.descCard}>
              <Text style={styles.descTitle}>Tadbir haqida</Text>
              <Text style={styles.description}>{event.description}</Text>
            </Card>
          )}

          {registerError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{registerError}</Text>
            </View>
          )}

          {myParticipation ? (
            <Card style={styles.statusCard}>
              <View style={styles.statusRow}>
                {Number(myParticipation.paid) >= Number(myParticipation.price) &&
                Number(myParticipation.price) > 0 ? (
                  <Badge label="To'langan" tone="success" />
                ) : Number(myParticipation.paid) > 0 ? (
                  <Badge label="Qisman to'langan" tone="warning" />
                ) : (
                  <Badge label="So'rov yuborildi" tone="neutral" />
                )}
              </View>
              <Text style={styles.statusText}>
                {Number(myParticipation.price) > 0
                  ? `${formatMoney(Number(myParticipation.paid))} / ${formatMoney(Number(myParticipation.price))}`
                  : "Siz ro'yxatdasiz"}
              </Text>
              <Text style={styles.statusHint}>
                To'lov tafsilotlari bo'yicha klub administratori bog'lanadi
              </Text>
            </Card>
          ) : !isPast ? (
            <Button
              title="Ro'yxatdan o'tish"
              onPress={() => void handleRegister()}
              loading={registerMutation.isPending}
            />
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { ...font.bold, fontSize: 15, color: colors.text },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  cover: { width: "100%", height: 210, borderRadius: 12 },
  coverFallback: {
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { gap: spacing.sm },
  name: { ...font.bold, fontSize: 22, color: colors.text },
  infoCard: { gap: spacing.md },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  infoTextBlock: { flex: 1, gap: 1 },
  infoLabel: { ...font.medium, fontSize: 11, color: colors.muted },
  infoValue: { ...font.semibold, fontSize: 14.5, color: colors.text },
  divider: { height: 1, backgroundColor: colors.borderLight },
  descCard: { gap: spacing.sm },
  descTitle: { ...font.bold, fontSize: 15, color: colors.text },
  description: { ...font.regular, fontSize: 14, color: colors.text, lineHeight: 21 },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: radius, padding: spacing.md },
  errorText: { ...font.medium, fontSize: 12.5, color: colors.danger },
  statusCard: { gap: spacing.sm },
  statusRow: { flexDirection: "row" },
  statusText: { ...font.bold, fontSize: 17, color: colors.text },
  statusHint: { ...font.regular, fontSize: 12, color: colors.muted },
})
