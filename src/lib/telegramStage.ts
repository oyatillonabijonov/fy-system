// 101: a bitim entered a stage that carries a Telegram template → ask the seller, then send. Never without the
// click: a wrong drag must not message a client (the owner's choice, 2026-11-18).
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase/client"
import { tgHook } from "@/lib/supabase/queries/telegram"
import { confirmAction } from "@/lib/confirm"
import { toast } from "@/lib/toast"

const db = supabase as unknown as SupabaseClient

export async function offerStageTelegram(leadId: string, stageId: string): Promise<void> {
  const { data: stage } = await db.from("crm_stages").select("template:tg_template_id(id, title, body)").eq("id", stageId).maybeSingle()
  const t = (stage as { template: { id: string; title: string; body: string } | null } | null)?.template
  if (!t) return
  const { data: lead } = await db.from("crm_leads").select("client:client_id(full_name)").eq("id", leadId).maybeSingle()
  const who = (lead as { client: { full_name: string } | null } | null)?.client?.full_name ?? "Mijoz"
  const ok = await confirmAction({ title: "Telegram xabari", message: `${who}ga «${t.title}» Telegramda yuborilsinmi?`, confirmLabel: "Yuborish" })
  if (!ok) return
  try {
    await tgHook("send", { lead_id: leadId, text: t.body, template_id: t.id })
    toast.success("Telegramga yuborildi", t.title)
  } catch (e) {
    toast.error("Telegram xabari ketmadi", (e as Error).message)
  }
}
