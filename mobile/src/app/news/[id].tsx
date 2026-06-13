import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router, useLocalSearchParams } from "expo-router"
import { Image } from "expo-image"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useNewsPost } from "@/hooks/useNews"
import { formatDate } from "@/lib/format"
import { ErrorState, LoadingState } from "@/components/ui"
import { colors, font, spacing } from "@/theme/tokens"

export default function NewsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: post, isLoading, isError, refetch } = useNewsPost(id ?? "")

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Yangilik</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <LoadingState />
      ) : isError || !post ? (
        <ErrorState message="Yangilik topilmadi" onRetry={() => void refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {post.image_url && (
            <Image source={{ uri: post.image_url }} style={styles.cover} contentFit="cover" />
          )}
          <View style={styles.dateRow}>
            <Ionicons name="time-outline" size={13} color={colors.muted} />
            <Text style={styles.date}>{formatDate(post.published_at)}</Text>
          </View>
          <Text style={styles.title}>{post.title}</Text>
          {post.body && <Text style={styles.body}>{post.body}</Text>}
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
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  cover: { width: "100%", height: 210, borderRadius: 12 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  date: { ...font.medium, fontSize: 12, color: colors.muted },
  title: { ...font.bold, fontSize: 22, color: colors.text, lineHeight: 28 },
  body: { ...font.regular, fontSize: 15, color: colors.text, lineHeight: 23 },
})
