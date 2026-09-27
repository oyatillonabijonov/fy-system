/* eslint-disable react-refresh/only-export-components -- useTheme hook is part of the theme context module */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

/** contrast = light main card on a dark ground and sidebar */
export type ThemeId = 'light' | 'dark' | 'contrast'

interface ThemeContextValue {
    themeId: ThemeId
    setThemeId: (id: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_KEY = 'fy_theme'

function getInitialTheme(): ThemeId {
    try {
        // Old values (neutral / black-orange / light-orange) fall back to light
        const saved = localStorage.getItem(THEME_KEY)
        if (saved === 'dark' || saved === 'contrast') return saved
    } catch { /* private browsing */ }
    return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeId, setThemeId] = useState<ThemeId>(getInitialTheme)

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', themeId)
        try { localStorage.setItem(THEME_KEY, themeId) } catch { /* private browsing */ }
    }, [themeId])

    return (
        <ThemeContext.Provider value={{ themeId, setThemeId }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const ctx = useContext(ThemeContext)
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
    return ctx
}
