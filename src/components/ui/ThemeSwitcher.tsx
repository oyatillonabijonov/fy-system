import { Sun, Moon } from '@phosphor-icons/react'
import { useTheme } from '../../context/ThemeContext'

export function ThemeSwitcher() {
    const { themeId, setThemeId } = useTheme()
    const isDark = themeId === 'dark'
    const label = isDark ? "Yorug' rejim" : "Qorong'i rejim"

    return (
        <button
            type="button"
            aria-pressed={isDark}
            onClick={() => setThemeId(isDark ? 'light' : 'dark')}
            title={label}
            aria-label={label}
            className="h-control-md w-9 flex items-center justify-center rounded-control text-ink transition-colors hover:bg-mute-ghost-hover"
        >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
    )
}
