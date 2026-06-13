import "react-native-url-polyfill/auto"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { createClient } from "@supabase/supabase-js"
import { AppState, Platform } from "react-native"
import type { Database } from "./types"

// The app is iOS/Android-only (app.json platforms), but if a web/SSR bundle
// ever runs this module, AsyncStorage is unavailable there and would crash
// the process — fall back to supabase's in-memory storage instead.
const isNative = Platform.OS === "ios" || Platform.OS === "android"

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL va EXPO_PUBLIC_SUPABASE_ANON_KEY o'rnatilmagan (mobile/.env)",
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(isNative ? { storage: AsyncStorage } : {}),
    persistSession: isNative,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

// Refresh tokens only while the app is foregrounded (Supabase RN guidance).
if (isNative) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void supabase.auth.startAutoRefresh()
    } else {
      void supabase.auth.stopAutoRefresh()
    }
  })
}
