/* eslint-disable react-refresh/only-export-components -- useTheme hook is part of the theme context module */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

/** contrast = light main card on a dark ground and sidebar; photo = the same on the login photo */
export type ThemeId = 'light' | 'dark' | 'contrast' | 'photo'

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
        if (saved === 'dark' || saved === 'contrast' || saved === 'photo') return saved
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
        document.documentElement.setAttribute('data-theme', themeId)
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
