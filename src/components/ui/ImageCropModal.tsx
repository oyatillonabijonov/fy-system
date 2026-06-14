import { useState, useRef, useCallback } from "react"
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "@phosphor-icons/react"

interface ImageCropModalProps {
  isOpen: boolean
  imageSrc: string
  onClose: () => void
  onCropped: (blob: Blob) => void
  /** Crop aspect ratio (width/height). Default 1 (square). */
  aspect?: number
  /** Round crop overlay. Default true (avatars). Set false for banners. */
  circular?: boolean
  /** Output dimensions in px. Default 512×512. */
  outputWidth?: number
  outputHeight?: number
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  )
}

export function ImageCropModal({
  isOpen,
  imageSrc,
  onClose,
  onCropped,
  aspect = 1,
  circular = true,
  outputWidth,
  outputHeight,
}: ImageCropModalProps) {
  const outW = outputWidth ?? 512
  const outH = outputHeight ?? 512
  const [crop, setCrop] = useState<Crop>()
  const imgRef = useRef<HTMLImageElement>(null)

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = e.currentTarget
      setCrop(centerAspectCrop(naturalWidth, naturalHeight, aspect))
    },
    [aspect]
  )

  async function handleDone() {
    const image = imgRef.current
    if (!image || !crop) return

    const canvas = document.createElement("canvas")
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    const pixelCrop = {
      x: (crop.x / 100) * image.width * scaleX,
      y: (crop.y / 100) * image.height * scaleY,
      width: (crop.width / 100) * image.width * scaleX,
      height: (crop.height / 100) * image.height * scaleY,
    }

    canvas.width = outW
    canvas.height = outH

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      outW,
      outH
    )

    canvas.toBlob(
      (blob) => {
        if (blob) onCropped(blob)
      },
      "image/jpeg",
      0.9
    )
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-white rounded-[12px] shadow-2xl w-full max-w-lg relative overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between">
              <h3 className="text-[16px] font-bold text-[#141414]">
                Rasmni kesish
              </h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-[#F5F5F5] rounded-full transition-all"
              >
                <X size={20} className="text-[#999999]" weight="bold" />
              </button>
            </div>

            {/* Crop area */}
            <div className="p-5 flex items-center justify-center bg-[#F5F5F5] max-h-[60vh] overflow-hidden">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                aspect={aspect}
                circularCrop={circular}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop"
                  onLoad={onImageLoad}
                  className="max-h-[55vh] max-w-full"
                />
              </ReactCrop>
            </div>

            {/* Footer */}
            <div className="p-5 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#F5F5F5] text-[#141414] rounded-[8px] text-[13px] font-bold hover:bg-[#EAEAEA] transition-all"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleDone}
                className="flex-1 px-4 py-2.5 bg-[#141414] text-white rounded-[8px] text-[13px] font-bold hover:bg-black transition-all shadow-md active:scale-95"
              >
                Tasdiqlash
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
