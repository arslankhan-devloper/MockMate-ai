export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'mockmate.theme'

export interface ThemeStorage {
  getItem: (key: string) => string | null
}

export function browserThemeStorage(): ThemeStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'dark' || value === 'system' || value === 'light' ? value : 'light'
}

export function loadThemeMode(storage: ThemeStorage | null | undefined): ThemeMode {
  if (!storage) return 'light'
  try {
    return parseThemeMode(storage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'light'
  }
}

export function resolveThemeDark(themeMode: ThemeMode, systemDark: boolean): boolean {
  return themeMode === 'system' ? systemDark : themeMode === 'dark'
}
