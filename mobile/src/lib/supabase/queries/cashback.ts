import { supabase } from "../client"
import type { Database } from "../types"

export type CashbackTransactionRow =
  Database["public"]["Tables"]["cashback_transactions"]["Row"]

export type CashbackType = "earned" | "used" | "manual_add" | "manual_subtract"

/** The member's own cashback history (RLS limits to own client). */
export async function getMyCashbackHistory(): Promise<CashbackTransactionRow[]> {
  const { data, error } = await supabase
    .from("cashback_transactions")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}
