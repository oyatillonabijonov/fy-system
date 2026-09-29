/* eslint-disable react-refresh/only-export-components -- useTheme hook is part of the theme context module */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

/** The mode sets the tokens: contrast = light main card on a dark ground and sidebar */
export type ThemeId = 'light' | 'dark' | 'contrast'

export const MODES: { id: ThemeId; label: string }[] = [
    { id: 'light', label: "Yorug'" },
    { id: 'contrast', label: 'Kontrast' },
    { id: 'dark', label: "Qorong'i" },
]

export type PhotoId = 'desert' | 'night' | 'field'

/** Optional photo ground, on top of any mode. It only frames the app: the sidebar
 *  and the main card stay solid in the mode's own colours, so contrast never drops. */
export const PHOTOS: { id: PhotoId; label: string }[] = [
    { id: 'desert', label: 'Sahro' },
    { id: 'night', label: 'Tun' },
    { id: 'field', label: 'Dala' },
]
export const photoThumb = (id: PhotoId) => `/images/thumb-${id}.jpg`

/** Interface language — stored only; the copy is Uzbek until translations exist */
export type LangId = 'uz' | 'ru' | 'en'

interface ThemeContextValue {
    themeId: ThemeId
    setThemeId: (id: ThemeId) => void
    photo: PhotoId | null
    setPhoto: (id: PhotoId | null) => void
    lang: LangId
    setLang: (l: LangId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_KEY = 'fy_theme'
const PHOTO_KEY = 'fy_photo'
const LANG_KEY = 'fy_lang'

function getInitialLang(): LangId {
    try {
        const saved = localStorage.getItem(LANG_KEY)
        if (saved === 'ru' || saved === 'en') return saved
    } catch { /* private browsing */ }
    return 'uz'
}

function getInitialTheme(): ThemeId {
    try {
        // Old values (neutral / black-orange / light-orange, photo*) fall back to light
        const saved = localStorage.getItem(THEME_KEY)
        if (saved === 'dark' || saved === 'contrast') return saved
    } catch { /* private browsing */ }
    return 'light'
}

function getInitialPhoto(): PhotoId | null {
    try {
        const saved = localStorage.getItem(PHOTO_KEY)
        if (PHOTOS.some((p) => p.id === saved)) return saved as PhotoId   // retired photos fall back to none
    } catch { /* private browsing */ }
    return null
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeId, setThemeId] = useState<ThemeId>(getInitialTheme)
    const [photo, setPhoto] = useState<PhotoId | null>(getInitialPhoto)
    const [lang, setLang] = useState<LangId>(getInitialLang)

    useEffect(() => {
        try { localStorage.setItem(LANG_KEY, lang) } catch { /* private browsing */ }
    }, [lang])

    useEffect(() => {
        const root = document.documentElement
        root.setAttribute('data-theme', themeId)
        // data-photo picks the ground image in index.css
        if (photo) root.setAttribute('data-photo', photo)
        else root.removeAttribute('data-photo')
        try {
            localStorage.setItem(THEME_KEY, themeId)
            if (photo) localStorage.setItem(PHOTO_KEY, photo)
            else localStorage.removeItem(PHOTO_KEY)
        } catch { /* private browsing */ }
    }, [themeId, photo])

    return (
        <ThemeContext.Provider value={{ themeId, setThemeId, photo, setPhoto, lang, setLang }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const ctx = useContext(ThemeContext)
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
    return ctx
}

/** The sidebar's token scope: dark in Kontrast (in Qorong'i the root is dark already) */
export function useSidebarScope(): 'dark' | undefined {
    return useTheme().themeId === 'contrast' ? 'dark' : undefined
}
