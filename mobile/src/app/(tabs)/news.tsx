import { FlatList, Pressable, StyleSheet, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"
import { Image } from "expo-image"
import Ionicons from "@expo/vector-icons/Ionicons"
import { useNews } from "@/hooks/useNews"
import { formatDate } from "@/lib/format"
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui"
import { colors, font, spacing } from "@/theme/tokens"

export default function NewsScreen() {
  const { data: posts, isLoading, isError, refetch, isRefetching } = useNews()

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Yangiliklar</Text>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (posts ?? []).length === 0 ? (
        <EmptyState icon="newspaper-outline" message="Hozircha yangiliklar yo'q" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/news/${item.id}`)}>
              <Card style={styles.postCard}>
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverFallback]}>
                    <Ionicons name="newspaper-outline" size={26} color={colors.muted} />
                  </View>
                )}
                <View style={styles.postBody}>
                  <Text style={styles.postTitle}>{item.title}</Text>
                  {item.body && (
                    <Text style={styles.postExcerpt} numberOfLines={2}>{item.body}</Text>
                  )}
                  <View style={styles.postFooter}>
                    <Text style={styles.postDate}>{formatDate(item.published_at)}</Text>
                    <View style={styles.readMore}>
                      <Text style={styles.readMoreText}>O'qish</Text>
                      <Ionicons name="chevron-forward" size={12} color={colors.text} />
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.lg },
  title: { ...font.bold, fontSize: 22, color: colors.text },
  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  postCard: { padding: 0, overflow: "hidden" },
  cover: { width: "100%", height: 150 },
  coverFallback: {
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  postBody: { padding: spacing.lg, gap: 6 },
  postTitle: { ...font.bold, fontSize: 16, color: colors.text },
  postExcerpt: { ...font.regular, fontSize: 13, color: colors.muted, lineHeight: 19 },
  postFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  postDate: { ...font.regular, fontSize: 11.5, color: colors.muted },
  readMore: { flexDirection: "row", alignItems: "center", gap: 2 },
  readMoreText: { ...font.semibold, fontSize: 12.5, color: colors.text },
})
