import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize an Uzbek phone number to +998XXXXXXXXX.
 *  Mirrors the DB function normalize_phone() in migration 032. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^+\d]/g, "")
  if (/^\+998\d{9}$/.test(cleaned)) return cleaned
  if (/^998\d{9}$/.test(cleaned)) return "+" + cleaned
  if (/^\d{9}$/.test(cleaned)) return "+998" + cleaned
  return cleaned
}
