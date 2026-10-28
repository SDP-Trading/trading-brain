import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ThemeMode } from '@shared/types'
import { api } from './util'

// El main también fija nativeTheme.themeSource (diálogos nativos y color de la ventana).
// Aquí se resuelve el tema a partir del ajuste y solo "system" consulta el sistema.
const query = () => window.matchMedia('(prefers-color-scheme: dark)')

function resolve(theme: ThemeMode): boolean {
  return theme === 'system' ? query().matches : theme === 'dark'
}

export function applyThemeClass(theme: ThemeMode = 'system'): boolean {
  const dark = resolve(theme)
  document.documentElement.classList.toggle('dark', dark)
  return dark
}

interface ThemeContextValue {
  theme: ThemeMode
  isDark: boolean
  setTheme(t: ThemeMode): void
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'system', isDark: true, setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system')
  const [isDark, setIsDark] = useState(() => applyThemeClass())

  useEffect(() => {
    api.settings.get().then((s) => setThemeState(s.theme))
  }, [])

  useEffect(() => {
    setIsDark(applyThemeClass(theme))
    if (theme !== 'system') return
    const mq = query()
    const onChange = () => setIsDark(applyThemeClass('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = (t: ThemeMode) => {
    setThemeState(t)
    api.settings.update({ theme: t })
  }

  return <ThemeContext.Provider value={{ theme, isDark, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
