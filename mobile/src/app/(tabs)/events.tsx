import { useMemo, useState } from "react"
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"
import { Image } from "expo-image"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useEvents, useMyParticipations } from "@/hooks/useEvents"
import type { EventRow } from "@/lib/supabase/queries/events"
import { formatDateTime, formatMoney } from "@/lib/format"
import { Badge, Card, EmptyState, ErrorState, LoadingState } from "@/components/ui"
import { colors, font, radius, spacing } from "@/theme/tokens"

type Segment = "upcoming" | "past"

function splitEvents(events: EventRow[]): Record<Segment, EventRow[]> {
  const now = Date.now()
  const upcoming: EventRow[] = []
  const past: EventRow[] = []
  for (const e of events) {
    if (e.date && new Date(e.date).getTime() < now) past.push(e)
    else upcoming.push(e)
  }
  // Upcoming: soonest first; past stays newest-first from the query.
  upcoming.sort((a, b) => {
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(a.date).getTime() - new Date(b.date).getTime()
  })
  return { upcoming, past }
}

function EventCard({
  event,
  participationStatus,
}: {
  event: EventRow
  participationStatus: "paid" | "partial" | "pending" | null
}) {
  return (
    <Pressable onPress={() => router.push(`/event/${event.id}`)}>
      <Card style={styles.eventCard}>
        {event.cover_image ? (
          <Image
            source={{ uri: event.cover_image }}
            style={styles.cover}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <Ionicons name="calendar" size={30} color="rgba(255,255,255,0.85)" />
          </View>
        )}
        <View style={styles.eventBody}>
          <View style={styles.titleRow}>
            <Text style={styles.eventName} numberOfLines={2}>{event.name}</Text>
            {participationStatus === "paid" && <Badge label="To'langan" tone="success" />}
            {participationStatus === "partial" && <Badge label="Qisman" tone="warning" />}
            {participationStatus === "pending" && <Badge label="Ro'yxatda" tone="neutral" />}
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color={colors.muted} />
            <Text style={styles.metaText}>{formatDateTime(event.date)}</Text>
          </View>
          {event.location && (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color={colors.muted} />
              <Text style={styles.metaText}>{event.location}</Text>
            </View>
          )}
          <View style={styles.footerRow}>
            <Text style={styles.price}>
              {Number(event.price) > 0 ? formatMoney(Number(event.price)) : "Bepul"}
            </Text>
            {Number(event.cashback_percent) > 0 && (
              <View style={styles.cashbackChip}>
                <Ionicons name="gift-outline" size={11} color={colors.success} />
                <Text style={styles.cashbackChipText}>{Number(event.cashback_percent)}%</Text>
              </View>
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  )
}

export default function EventsScreen() {
  const { data: events, isLoading, isError, refetch, isRefetching } = useEvents()
  const participationsQuery = useMyParticipations()
  const [segment, setSegment] = useState<Segment>("upcoming")

  const segments = useMemo(() => splitEvents(events ?? []), [events])
  const shown = segments[segment]

  const statusByEvent = useMemo(() => {
    const map = new Map<string, "paid" | "partial" | "pending">()
    for (const p of participationsQuery.data ?? []) {
      if (!p.event_id) continue
      const price = Number(p.price)
      const paid = Number(p.paid)
      map.set(p.event_id, price > 0 && paid >= price ? "paid" : paid > 0 ? "partial" : "pending")
    }
    return map
  }, [participationsQuery.data])

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Tadbirlar</Text>
        <View style={styles.segmentRow}>
          {(["upcoming", "past"] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSegment(s)}
              style={[styles.segmentBtn, segment === s && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, segment === s && styles.segmentTextActive]}>
                {s === "upcoming" ? "Kelgusi" : "O'tgan"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          message={segment === "upcoming" ? "Hozircha kelgusi tadbirlar yo'q" : "O'tgan tadbirlar yo'q"}
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <EventCard event={item} participationStatus={statusByEvent.get(item.id) ?? null} />
          )}
          contentContainerStyle={styles.list}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.lg, gap: spacing.md },
  title: { ...font.bold, fontSize: 22, color: colors.text },
  segmentRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius - 2,
    alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: colors.accent },
  segmentText: { ...font.bold, fontSize: 13, color: colors.muted },
  segmentTextActive: { color: "#FFFFFF" },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  eventCard: { padding: 0, overflow: "hidden" },
  cover: { width: "100%", height: 150 },
  coverFallback: {
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  eventBody: { padding: spacing.lg, gap: 6 },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  eventName: { ...font.bold, fontSize: 16, color: colors.text, flex: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { ...font.regular, fontSize: 12.5, color: colors.muted },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  price: { ...font.bold, fontSize: 15, color: colors.text },
  cashbackChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius - 2,
  },
  cashbackChipText: { ...font.bold, fontSize: 11, color: colors.success },
})
