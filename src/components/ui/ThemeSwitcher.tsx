import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Swatches, Check } from '@phosphor-icons/react'
import { useTheme, themes, type ThemeId } from '../../context/ThemeContext'

const themeSwatches: Record<ThemeId, { sidebar: string; accent: string; bg: string }> = {
    neutral: { sidebar: '#F3F2F0', accent: '#141414', bg: '#FFFFFF' },
    'black-orange': { sidebar: '#1A1A1A', accent: '#D13328', bg: '#FFFFFF' },
    'light-orange': { sidebar: '#FFFFFF', accent: '#D13328', bg: '#FFF8F6' },
}

export function ThemeSwitcher() {
    const { themeId, setThemeId } = useTheme()
    const [isOpen, setIsOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setIsOpen(v => !v)}
                title="Mavzuni o'zgartirish"
                className={`p-2 rounded-[8px] transition-colors group ${isOpen ? 'bg-[var(--header-hover)]' : 'hover:bg-[var(--header-hover)]'}`}
            >
                <Swatches size={24} className="text-[var(--header-icon)]" weight="bold" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute top-full right-0 mt-2 w-[220px] rounded-[10px] shadow-[0_12px_40px_rgba(0,0,0,0.12)] overflow-hidden z-50 border"
                        style={{
                            background: 'var(--dropdown-bg)',
                            borderColor: 'var(--dropdown-border)',
                        }}
                    >
                        <div
                            className="px-4 py-3 border-b flex items-center gap-2"
                            style={{ borderColor: 'var(--dropdown-border)' }}
                        >
                            <Swatches size={16} style={{ color: 'var(--dropdown-muted)' }} weight="bold" />
                            <span className="text-[13px] font-bold" style={{ color: 'var(--dropdown-text)' }}>
                                Mavzu tanlash
                            </span>
                        </div>

                        <div className="py-1.5">
                            {themes.map(theme => {
                                const swatch = themeSwatches[theme.id]
                                const isActive = themeId === theme.id
                                return (
                                    <button
                                        key={theme.id}
                                        onClick={() => {
                                            setThemeId(theme.id)
                                            setIsOpen(false)
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left"
                                        style={{
                                            background: isActive ? 'var(--dropdown-active-bg)' : 'transparent',
                                            color: 'var(--dropdown-text)',
                                        }}
                                        onMouseEnter={e => {
                                            if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--dropdown-hover-bg)'
                                        }}
                                        onMouseLeave={e => {
                                            if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                                        }}
                                    >
                                        {/* Swatch preview */}
                                        <div className="flex-shrink-0 w-8 h-8 rounded-[6px] overflow-hidden border flex"
                                            style={{ borderColor: 'var(--dropdown-border)' }}>
                                            <div className="w-1/2 h-full" style={{ background: swatch.sidebar }} />
                                            <div className="w-1/2 h-full flex flex-col">
                                                <div className="flex-1" style={{ background: swatch.bg }} />
                                                <div className="h-2" style={{ background: swatch.accent }} />
                                            </div>
                                        </div>

                                        <span className="flex-1 text-[13px] font-medium">{theme.label}</span>

                                        {isActive && (
                                            <Check size={16} className="flex-shrink-0" style={{ color: 'var(--accent)' }} weight="bold" />
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
