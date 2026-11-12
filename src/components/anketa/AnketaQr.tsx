// The universal anketa link as a QR code (097) — to print for an event or show on a screen
import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Sheet } from "@/components/ui/Sheet"

export function AnketaQrSheet({ url, open, onClose }: { url: string | undefined; open: boolean; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => { if (url && open) void QRCode.toDataURL(url, { width: 512, margin: 2 }).then(setQr) }, [url, open])
  return (
    <Sheet open={open && !!qr} onClose={onClose} title="Anketa QR kodi">
      <div className="flex flex-col items-center gap-3">
        {qr && <img src={qr} alt="Anketa havolasining QR kodi" className="w-64 h-64 rounded-control bg-white" />}
        <p className="text-sm text-ink-muted text-center">Telefon kamerasi bilan skanerlansa, anketa ochiladi.</p>
        {qr && <a href={qr} download="anketa-qr.png"
          className="h-10 px-5 inline-flex items-center rounded-full bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover">Yuklab olish (PNG)</a>}
      </div>
    </Sheet>
  )
}
