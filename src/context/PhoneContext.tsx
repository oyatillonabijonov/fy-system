/* eslint-disable react-refresh/only-export-components -- usePhone is co-located with its provider */
// Browser phone (OnlinePBX over Verto/WebRTC, migration 074). amo-sync hands the signed-in
// staff member the login of THEIR internal number (/hooks/pbx/me); calls then go straight
// between the browser and the PBX. No internal number set → the phone stays off.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useAuth } from "@/context/AuthContext"
import { pbxApi, findCallContact } from "@/lib/supabase/queries/sotuv"
import { preloadRing, startRing } from "@/lib/phoneAudio"

export type PhoneStatus = "off" | "connecting" | "ready" | "offline"
export interface ActiveCall {
  id: string
  dir: "in" | "out"
  phone: string
  state: "ringing" | "dialing" | "active" | "ended"
  answeredAt: number | null
  muted: boolean
  contact: { name: string; leadId: string | null; leadName: string | null } | null
}

interface PhoneCtx {
  status: PhoneStatus
  ext: string | null
  call: ActiveCall | null
  dial: (phone: string) => Promise<void>
  answer: () => Promise<void>
  hangup: () => void
  toggleMute: () => void
  dismiss: () => void
  /** the other side's audio, for the visualizer */
  remoteStream: () => MediaStream | null
}

// The library's own types are mostly `any`; this is the part we touch
interface Dialog {
  callID: string
  params: Record<string, string | undefined>
  state: { name: string }
  direction: { name: string }
  answer: (o: object) => void
  hangup: (o?: object) => void
  setMute: (what: "toggle") => void
}
interface VertoClient {
  newCall: (args: object, cb?: object) => Dialog | undefined
  logout: () => void
}
interface Creds { ext: string; login: string; password: string; socketUrl: string }

const Ctx = createContext<PhoneCtx | null>(null)
const END = ["hangup", "destroy", "purge"]

/** PBX dial string: Uzbek numbers as 9 local digits (how the team's calls go out today), others as digits */
const dialString = (phone: string) => {
  const d = phone.replace(/\D/g, "")
  return d.length === 12 && d.startsWith("998") ? d.slice(3) : d
}

const mic = () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })

export function PhoneProvider({ children }: { children: ReactNode }) {
  const { user, hasAccess } = useAuth()
  const enabled = !!user && hasAccess("sotuv-crmn")
  const [status, setStatus] = useState<PhoneStatus>("off")
  const [ext, setExt] = useState<string | null>(null)
  const [call, setCall] = useState<ActiveCall | null>(null)
  const client = useRef<VertoClient | null>(null)
  const dialog = useRef<Dialog | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const ring = useRef<(() => void) | null>(null)
  const audio = useRef<HTMLAudioElement>(null)

  const stopRing = () => { ring.current?.(); ring.current = null }
  const stopMic = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null }
  const patch = useCallback((id: string, p: Partial<ActiveCall>) => setCall((c) => (c && c.id === id ? { ...c, ...p } : c)), [])

  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let verto: VertoClient | null = null

    const onDialogState = (d: Dialog) => {
      if (disposed) return
      const state = d.state?.name
      const id = d.callID
      if (d.direction?.name === "inbound" && ["new", "requesting", "trying", "ringing"].includes(state)) {
        // One line: a second incoming call while busy is turned away
        if (dialog.current && dialog.current.callID !== id) { d.hangup({ cause: "USER_BUSY" }); return }
        if (dialog.current?.callID === id) return
        dialog.current = d
        const phone = d.params.caller_id_number ?? ""
        setCall({ id, dir: "in", phone, state: "ringing", answeredAt: null, muted: false, contact: null })
        ring.current ??= startRing()
        void findCallContact(phone).then((contact) => patch(id, { contact }))
        return
      }
      if (dialog.current?.callID !== id) return
      if (state === "active") { stopRing(); patch(id, { state: "active", answeredAt: Date.now() }) }
      else if (state === "early" || state === "ringing") patch(id, { state: "dialing" })
      else if (END.includes(state)) {
        stopRing(); stopMic(); dialog.current = null
        patch(id, { state: "ended" })
        setTimeout(() => setCall((c) => (c?.id === id && c.state === "ended" ? null : c)), 4000)
      }
    }

    ;(async () => {
      setStatus("connecting")
      let creds: Creds
      try { creds = await pbxApi<Creds>("me") } catch { if (!disposed) setStatus("off"); return }
      if (disposed) return
      setExt(creds.ext)
      void preloadRing().catch(() => { /* the fallback ring is used */ })
      const { Verto } = await import("@xswitch/rtc")
      if (disposed) return
      verto = new Verto({
        login: creds.login, passwd: creds.password, socketUrl: creds.socketUrl,
        // No keepAlive: the library pings with XSwitch's "Uas.Ping", which OnlinePBX rejects
        // (-32601), so it dropped the line every ~30 s. The PBX pings us (verto.ping) instead.
        autoReconnect: true,
        tag: () => audio.current, ringer_tag: null, useVideo: false, useStereo: false,
        deviceParams: { useCamera: false, useMic: "any", useSpeak: "any" },
      }, {
        onWSLogin: (_v: unknown, ok: boolean) => { if (!disposed) setStatus(ok ? "ready" : "offline") },
        onWSClose: (v: { purge: () => void }) => { v.purge(); if (!disposed) setStatus("offline") },   // purge = the library's own default
        onDialogState,
      }) as unknown as VertoClient
      client.current = verto
    })()

    return () => {
      disposed = true
      stopRing(); stopMic()
      try { verto?.logout() } catch { /* socket already gone */ }
      client.current = null; dialog.current = null
      setStatus("off"); setExt(null); setCall(null)
    }
  }, [enabled, patch])

  const dial = useCallback(async (phone: string) => {
    if (!client.current || !ext || dialog.current) return
    stream.current = await mic()   // asks for the microphone once
    const d = client.current.newCall({
      destination_number: dialString(phone), caller_id_number: ext, useVideo: false, useStereo: false,
      useMic: "any", useSpeak: "any", useStream: stream.current, tag: () => audio.current,
    })
    if (!d) { stopMic(); setStatus("offline"); return }
    dialog.current = d
    setCall({ id: d.callID, dir: "out", phone, state: "dialing", answeredAt: null, muted: false, contact: null })
    void findCallContact(phone).then((contact) => patch(d.callID, { contact }))
  }, [ext, patch])

  const answer = useCallback(async () => {
    const d = dialog.current
    if (!d) return
    stopRing()
    stream.current = await mic()
    d.answer({ useVideo: false, useStereo: false, useMic: "any", useSpeak: "any", useStream: stream.current })
  }, [])

  const hangup = useCallback(() => {
    stopRing()
    dialog.current?.hangup({ cause: call?.state === "ringing" && call.dir === "in" ? "CALL_REJECTED" : "NORMAL_CLEARING" })
  }, [call])

  const toggleMute = useCallback(() => {
    if (!dialog.current || !call) return
    dialog.current.setMute("toggle")
    patch(call.id, { muted: !call.muted })
  }, [call, patch])

  const dismiss = useCallback(() => setCall((c) => (c?.state === "ended" ? null : c)), [])
  const remoteStream = useCallback(() => (audio.current?.srcObject instanceof MediaStream ? audio.current.srcObject : null), [])

  return (
    <Ctx.Provider value={{ status, ext, call, dial, answer, hangup, toggleMute, dismiss, remoteStream }}>
      {children}
      <audio ref={audio} autoPlay playsInline className="hidden" />
    </Ctx.Provider>
  )
}

export function usePhone(): PhoneCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error("usePhone must be used within PhoneProvider")
  return c
}
