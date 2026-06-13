import { useMemo } from "react"
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"
import { Image } from "expo-image"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useAuth } from "@/context/AuthContext"
import { useEvents, useMyParticipations } from "@/hooks/useEvents"
import { useNews } from "@/hooks/useNews"
import type { EventRow } from "@/lib/supabase/queries/events"
import { formatDate, formatDateTime, formatMoney } from "@/lib/format"
import { Card, SectionHeader } from "@/components/ui"
import { colors, font, radius, radiusLg, spacing } from "@/theme/tokens"

function nextUpcoming(events: EventRow[]): EventRow | null {
  const now = Date.now()
  const upcoming = events
    .filter((e) => !e.date || new Date(e.date).getTime() >= now)
    .sort((a, b) => {
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })
  return upcoming[0] ?? null
}

export default function HomeScreen() {
  const { client } = useAuth()
  const eventsQuery = useEvents()
  const newsQuery = useNews()
  const participationsQuery = useMyParticipations()

  const upcomingEvent = useMemo(
    () => nextUpcoming(eventsQuery.data ?? []),
    [eventsQuery.data],
  )
  const latestNews = (newsQuery.data ?? []).slice(0, 2)
  const eventsCount = (participationsQuery.data ?? []).length

  const firstName = client?.full_name.split(" ")[0] ?? ""
  const balance = Number(client?.cashback_balance ?? 0)

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.greeting}>Salom, {firstName} 👋</Text>
            <Text style={styles.greetingSub}>Fikr Yetakchilari klubi</Text>
          </View>
          <Pressable onPress={() => router.push("/(tabs)/profile")}>
            {client?.image ? (
              <Image source={{ uri: client.image }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{firstName.charAt(0)}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Balance card */}
        <Pressable onPress={() => router.push("/(tabs)/cashback")}>
          <View style={styles.balanceCard}>
            <View style={styles.balanceTop}>
              <Text style={styles.balanceLabel}>CASHBACK BALANS</Text>
              <View style={styles.balanceIcon}>
                <Ionicons name="wallet-outline" size={16} color="#FFFFFF" />
              </View>
            </View>
            <Text style={styles.balanceValue}>{formatMoney(balance)}</Text>
            <View style={styles.balanceBottom}>
              <Text style={styles.balanceHint}>Tadbir to'lovlarida ishlatiladi</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.6)" />
            </View>
          </View>
        </Pressable>

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{eventsCount}</Text>
            <Text style={styles.statLabel}>Tadbirlarim</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{client?.status ?? "—"}</Text>
            <Text style={styles.statLabel}>A'zolik holati</Text>
          </Card>
        </View>

        {/* Next event */}
        <SectionHeader
          title="Keyingi tadbir"
          actionLabel="Barchasi"
          onAction={() => router.push("/(tabs)/events")}
        />
        {upcomingEvent ? (
          <Pressable onPress={() => router.push(`/event/${upcomingEvent.id}`)}>
            <Card style={styles.eventCard}>
              {upcomingEvent.cover_image ? (
                <Image
                  source={{ uri: upcomingEvent.cover_image }}
                  style={styles.eventCover}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={[styles.eventCover, styles.eventCoverFallback]}>
                  <Ionicons name="calendar" size={28} color="rgba(255,255,255,0.85)" />
                </View>
              )}
              <View style={styles.eventBody}>
                <Text style={styles.eventName}>{upcomingEvent.name}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={14} color={colors.muted} />
                  <Text style={styles.metaText}>{formatDateTime(upcomingEvent.date)}</Text>
                </View>
                {upcomingEvent.location && (
                  <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={14} color={colors.muted} />
                    <Text style={styles.metaText}>{upcomingEvent.location}</Text>
                  </View>
                )}
                <View style={styles.eventFooter}>
                  <Text style={styles.eventPrice}>
                    {Number(upcomingEvent.price) > 0
                      ? formatMoney(Number(upcomingEvent.price))
                      : "Bepul"}
                  </Text>
                  {Number(upcomingEvent.cashback_percent) > 0 && (
                    <View style={styles.cashbackChip}>
                      <Ionicons name="gift-outline" size={11} color={colors.success} />
                      <Text style={styles.cashbackChipText}>
                        {Number(upcomingEvent.cashback_percent)}% cashback
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </Card>
          </Pressable>
        ) : (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>Hozircha kelgusi tadbirlar yo'q</Text>
          </Card>
        )}

        {/* Latest news */}
        <SectionHeader
          title="So'nggi yangiliklar"
          actionLabel="Barchasi"
          onAction={() => router.push("/(tabs)/news")}
        />
        {latestNews.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>Hozircha yangiliklar yo'q</Text>
          </Card>
        ) : (
          latestNews.map((post) => (
            <Pressable key={post.id} onPress={() => router.push(`/news/${post.id}`)}>
              <Card style={styles.newsCard}>
                {post.image_url ? (
                  <Image source={{ uri: post.image_url }} style={styles.newsThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.newsThumb, styles.newsThumbFallback]}>
                    <Ionicons name="newspaper-outline" size={18} color={colors.muted} />
                  </View>
                )}
                <View style={styles.newsBody}>
                  <Text style={styles.newsTitle} numberOfLines={2}>{post.title}</Text>
                  <Text style={styles.newsDate}>{formatDate(post.published_at)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.border} />
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },

  greetingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  greeting: { ...font.bold, fontSize: 22, color: colors.text },
  greetingSub: { ...font.medium, fontSize: 13, color: colors.muted },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { ...font.bold, fontSize: 18, color: "#FFFFFF" },

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
  balanceBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balanceHint: { ...font.regular, fontSize: 11, color: "rgba(255,255,255,0.6)" },

  statsRow: { flexDirection: "row", gap: spacing.md },
  statCard: { flex: 1, gap: 2, paddingVertical: spacing.md },
  statValue: { ...font.bold, fontSize: 18, color: colors.text },
  statLabel: { ...font.medium, fontSize: 11, color: colors.muted },

  eventCard: { padding: 0, overflow: "hidden" },
  eventCover: { width: "100%", height: 150 },
  eventCoverFallback: {
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  eventBody: { padding: spacing.lg, gap: 6 },
  eventName: { ...font.bold, fontSize: 16, color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { ...font.regular, fontSize: 12.5, color: colors.muted },
  eventFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  eventPrice: { ...font.bold, fontSize: 15, color: colors.text },
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

  newsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  newsThumb: { width: 52, height: 52, borderRadius: radius },
  newsThumbFallback: {
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  newsBody: { flex: 1, gap: 3 },
  newsTitle: { ...font.semibold, fontSize: 14, color: colors.text },
  newsDate: { ...font.regular, fontSize: 11, color: colors.muted },

  emptyCard: { alignItems: "center", paddingVertical: spacing.xl },
  emptyText: { ...font.medium, fontSize: 13, color: colors.muted },
})
