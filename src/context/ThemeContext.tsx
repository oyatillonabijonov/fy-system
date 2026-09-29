/* eslint-disable react-refresh/only-export-components -- useTheme hook is part of the theme context module */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

/** contrast = light main card on a dark ground and sidebar; photo* = the same on a photo */
export type ThemeId = 'light' | 'dark' | 'contrast' | 'photo' | 'photo-sky' | 'photo-car' | 'photo-city'

/** Every theme, for the pickers. `swatch` is a CSS background for the little preview;
 *  photo themes also get data-photo=<id> on <html>, which picks the image in index.css. */
export const THEMES: { id: ThemeId; label: string; swatch: string; photo?: true }[] = [
    { id: 'light', label: "Yorug'", swatch: 'linear-gradient(135deg, #f2f2f2 50%, #ffffff 50%)' },
    { id: 'contrast', label: 'Kontrast', swatch: 'linear-gradient(135deg, #0b0b0c 50%, #ffffff 50%)' },
    { id: 'dark', label: "Qorong'i", swatch: 'linear-gradient(135deg, #0b0b0c 50%, #202024 50%)' },
    { id: 'photo', label: 'Dengiz', swatch: 'url(/images/thumb-sea.jpg) center / cover', photo: true },
    { id: 'photo-sky', label: 'Bulut', swatch: 'url(/images/thumb-sky.jpg) center / cover', photo: true },
    { id: 'photo-car', label: 'Avto', swatch: 'url(/images/thumb-car.jpg) center / cover', photo: true },
    { id: 'photo-city', label: 'Shahar', swatch: 'url(/images/thumb-city.jpg) center / cover', photo: true },
]
export const isPhotoTheme = (id: ThemeId) => id.startsWith('photo')

/** Interface language — stored only; the copy is Uzbek until translations exist */
export type LangId = 'uz' | 'ru' | 'en'

interface ThemeContextValue {
    themeId: ThemeId
    setThemeId: (id: ThemeId) => void
    lang: LangId
    setLang: (l: LangId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_KEY = 'fy_theme'
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
        // Old values (neutral / black-orange / light-orange) fall back to light
        const saved = localStorage.getItem(THEME_KEY)
        const known = THEMES.find((t) => t.id === saved)
        if (known) return known.id
    } catch { /* private browsing */ }
    return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeId, setThemeId] = useState<ThemeId>(getInitialTheme)
    const [lang, setLang] = useState<LangId>(getInitialLang)

    useEffect(() => {
        try { localStorage.setItem(LANG_KEY, lang) } catch { /* private browsing */ }
    }, [lang])

    useEffect(() => {
        // All photo themes share one look (data-theme="photo"); data-photo picks the image
        const root = document.documentElement
        root.setAttribute('data-theme', isPhotoTheme(themeId) ? 'photo' : themeId)
        if (isPhotoTheme(themeId)) root.setAttribute('data-photo', themeId)
        else root.removeAttribute('data-photo')
        try { localStorage.setItem(THEME_KEY, themeId) } catch { /* private browsing */ }
    }, [themeId])

    return (
        <ThemeContext.Provider value={{ themeId, setThemeId, lang, setLang }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const ctx = useContext(ThemeContext)
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
    return ctx
}
