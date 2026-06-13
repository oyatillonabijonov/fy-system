import { useState } from "react"
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import Ionicons from "@expo/vector-icons/Ionicons"
import { signIn } from "@/lib/supabase/queries/profile"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui"
import { colors, font, radius, radiusLg, spacing } from "@/theme/tokens"

export default function LoginScreen() {
  const { authError } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError(null)
    if (!email.trim() || !password) {
      setError("Email va parolni kiriting")
      return
    }
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      // AuthContext picks up the session and the router guard switches stacks.
    } catch (err) {
      const message = err instanceof Error ? err.message : ""
      setError(
        message.includes("Invalid login credentials")
          ? "Email yoki parol noto'g'ri"
          : message || "Kirishda xatolik yuz berdi",
      )
    } finally {
      setLoading(false)
    }
  }

  const shownError = error ?? authError

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>FY</Text>
          </View>
          <Text style={styles.logo}>Fikr Yetakchilari</Text>
          <Text style={styles.subtitle}>Klub a'zolari uchun ilova</Text>
        </View>

        <View style={styles.form}>
          {shownError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{shownError}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="azo@example.uz"
              placeholderTextColor="#CCCCCC"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Parol</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••"
              placeholderTextColor="#CCCCCC"
              secureTextEntry
              style={styles.input}
            />
          </View>

          <Button title="Kirish" onPress={() => void handleLogin()} loading={loading} />

          <Text style={styles.hint}>
            Akkaunt klub administratori tomonidan beriladi
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: "center", padding: spacing.xl },
  header: { alignItems: "center", marginBottom: spacing.xxl, gap: spacing.xs },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  logoMarkText: { ...font.bold, fontSize: 20, color: "#FFFFFF", letterSpacing: 0.5 },
  logo: { ...font.bold, fontSize: 24, color: colors.text },
  subtitle: { ...font.medium, fontSize: 13, color: colors.muted },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radiusLg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  field: { gap: 6 },
  label: { ...font.medium, fontSize: 12.5, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingHorizontal: spacing.md,
    height: 50,
    ...font.regular,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius,
    padding: spacing.md,
  },
  errorText: { ...font.medium, fontSize: 12.5, color: colors.danger, flex: 1 },
  hint: {
    ...font.regular,
    fontSize: 11.5,
    color: colors.muted,
    textAlign: "center",
  },
})
