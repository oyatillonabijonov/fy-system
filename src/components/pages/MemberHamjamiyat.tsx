import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/context/AuthContext"
import {
  useChannels,
  useChannelMessages,
  useDmMessages,
  useCommunityMembers,
  useSendChannelMessage,
  useSendDmMessage,
} from "@/hooks/useCommunity"
import { supabase } from "@/lib/supabase/client"
import { Hash, ChatTeardropDots, PaperPlaneRight, Lock, Users } from "@phosphor-icons/react"

type ChatMode = { type: "channel"; id: string } | { type: "dm"; userId: string } | null

export function MemberHamjamiyat() {
  const { memberClient } = useAuth()
  const [activeChat, setActiveChat] = useState<ChatMode>(null)
  const [msgInput, setMsgInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: channels = [] } = useChannels()
  const { data: members = [] } = useCommunityMembers()

  const channelId = activeChat?.type === "channel" ? activeChat.id : null
  const dmUserId = activeChat?.type === "dm" ? activeChat.userId : null

  const { data: channelMessages = [] } = useChannelMessages(channelId)
  const { data: dmMessages = [] } = useDmMessages(dmUserId)

  const messages = activeChat?.type === "channel" ? channelMessages : dmMessages

  const sendChannel = useSendChannelMessage()
  const sendDm = useSendDmMessage()

  // Select first channel by default
  useEffect(() => {
    if (!activeChat && channels.length > 0) {
      setActiveChat({ type: "channel", id: channels[0].id })
    }
  }, [channels, activeChat])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Real-time subscription
  useEffect(() => {
    if (!activeChat) return

    const channel = supabase
      .channel(`messages-${activeChat.type}-${activeChat.type === "channel" ? activeChat.id : activeChat.userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        // Invalidation handled by polling interval in hook
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [activeChat])

  if (!memberClient?.community_approved) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--header-hover)" }}>
          <Lock size={28} style={{ color: "var(--header-muted)" }} />
        </div>
        <div className="text-center max-w-sm">
          <p className="text-[16px] font-bold mb-2" style={{ color: "var(--header-text)" }}>Hamjamiyat yopiq</p>
          <p className="text-[13px]" style={{ color: "var(--header-muted)" }}>
            Hamjamiyatga kirish uchun administrator tasdiqlashi kutilmoqda.
          </p>
        </div>
      </div>
    )
  }

  function getActiveName() {
    if (!activeChat) return ""
    if (activeChat.type === "channel") {
      return channels.find(c => c.id === activeChat.id)?.name ?? ""
    }
    return members.find(m => m.auth_user_id === activeChat.userId)?.full_name ?? ""
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = msgInput.trim()
    if (!text || !activeChat) return
    setMsgInput("")

    if (activeChat.type === "channel") {
      await sendChannel.mutateAsync({ channelId: activeChat.id, content: text })
    } else {
      await sendDm.mutateAsync({ recipientId: activeChat.userId, content: text })
    }
  }

  return (
    <div className="flex h-[calc(100vh-140px)] rounded-[8px] overflow-hidden border" style={{ borderColor: "var(--header-border)" }}>
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r" style={{ background: "var(--main-bg)", borderColor: "var(--header-border)" }}>
        {/* Channels */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--header-muted)" }}>Kanallar</p>
          <div className="flex flex-col gap-0.5">
            {channels.map(ch => (
              <button key={ch.id}
                onClick={() => setActiveChat({ type: "channel", id: ch.id })}
                className="flex items-center gap-2 px-3 py-2 rounded-[8px] text-left text-[13px] transition-colors w-full"
                style={{
                  background: activeChat?.type === "channel" && activeChat.id === ch.id ? "var(--accent)" : "transparent",
                  color: activeChat?.type === "channel" && activeChat.id === ch.id ? "#fff" : "var(--header-text)",
                }}
              >
                <Hash size={14} weight="bold" className="flex-shrink-0" />
                <span className="truncate font-medium">{ch.name}</span>
              </button>
            ))}
            {channels.length === 0 && (
              <p className="text-[12px] px-3 py-2" style={{ color: "var(--header-muted)" }}>Hozircha kanal yo'q</p>
            )}
          </div>
        </div>

        <div className="mx-4 h-px my-3" style={{ background: "var(--header-border)" }} />

        {/* DMs */}
        <div className="px-4 pb-4 flex-1 overflow-y-auto no-scrollbar">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--header-muted)" }}>
            <Users size={11} className="inline mr-1" />To'g'ridan-to'g'ri
          </p>
          <div className="flex flex-col gap-0.5">
            {members.map(m => (
              <button key={m.auth_user_id}
                onClick={() => setActiveChat({ type: "dm", userId: m.auth_user_id })}
                className="flex items-center gap-2 px-3 py-2 rounded-[8px] text-left transition-colors w-full"
                style={{
                  background: activeChat?.type === "dm" && activeChat.userId === m.auth_user_id ? "var(--accent)" : "transparent",
                  color: activeChat?.type === "dm" && activeChat.userId === m.auth_user_id ? "#fff" : "var(--header-text)",
                }}
              >
                <div className="w-6 h-6 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: "var(--accent)" }}>
                  {m.image
                    ? <img src={m.image} alt={m.full_name} className="w-full h-full object-cover" />
                    : m.full_name[0]?.toUpperCase()}
                </div>
                <span className="truncate text-[13px] font-medium">{m.full_name}</span>
              </button>
            ))}
            {members.length === 0 && (
              <p className="text-[12px] px-3 py-2" style={{ color: "var(--header-muted)" }}>Boshqa a'zolar yo'q</p>
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "var(--main-bg)" }}>
        {activeChat ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0" style={{ borderColor: "var(--header-border)" }}>
              {activeChat.type === "channel"
                ? <Hash size={18} weight="bold" style={{ color: "var(--accent)" }} />
                : <ChatTeardropDots size={18} weight="bold" style={{ color: "var(--accent)" }} />
              }
              <span className="font-semibold text-[15px]" style={{ color: "var(--header-text)" }}>{getActiveName()}</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 flex flex-col gap-3">
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[13px]" style={{ color: "var(--header-muted)" }}>Hali xabar yo'q. Birinchi bo'lib yozing!</p>
                </div>
              )}
              {messages.map(msg => {
                const isOwn = msg.sender_id === (memberClient as { auth_user_id: string } | null)?.auth_user_id
                return (
                  <div key={msg.id} className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
                    <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ background: "var(--accent)" }}>
                      {(msg.sender_name ?? "A")[0]?.toUpperCase()}
                    </div>
                    <div className={`max-w-[70%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-1`}>
                      {!isOwn && (
                        <span className="text-[11px] font-semibold px-1" style={{ color: "var(--header-muted)" }}>{msg.sender_name}</span>
                      )}
                      <div className="px-4 py-2.5 rounded-[8px] text-[14px]"
                        style={{
                          background: isOwn ? "var(--accent)" : "var(--header-hover)",
                          color: isOwn ? "#fff" : "var(--header-text)",
                        }}>
                        {msg.content}
                        {msg.image_url && <img src={msg.image_url} alt="" className="mt-2 rounded-[6px] max-w-[240px]" />}
                      </div>
                      <span className="text-[10px] px-1" style={{ color: "var(--header-muted)" }}>
                        {new Date(msg.created_at).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="flex items-center gap-3 px-5 py-4 border-t flex-shrink-0"
              style={{ borderColor: "var(--header-border)" }}>
              <input
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
                placeholder="Xabar yozing..."
                className="flex-1 px-4 py-2.5 rounded-[8px] text-[14px] outline-none border transition-colors"
                style={{
                  background: "var(--header-input-bg)",
                  borderColor: "var(--header-border)",
                  color: "var(--header-text)",
                }}
              />
              <button type="submit"
                disabled={!msgInput.trim()}
                className="w-10 h-10 rounded-[8px] flex items-center justify-center transition-all disabled:opacity-40"
                style={{ background: "var(--accent)" }}>
                <PaperPlaneRight size={18} weight="bold" color="#fff" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[14px]" style={{ color: "var(--header-muted)" }}>Kanal yoki a'zo tanlang</p>
          </div>
        )}
      </div>
    </div>
  )
}
