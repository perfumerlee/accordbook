import { LANGUAGE_STORAGE_KEY } from './language'
import type { Language } from './messages'

export const EXPLICIT_LANGUAGE_STORAGE_KEY = 'accordbook.locale.explicit'
export function hasExplicitLanguageChoice(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const value = window.localStorage.getItem(EXPLICIT_LANGUAGE_STORAGE_KEY)
    return value === 'en' || value === 'ko'
  } catch {
    return false
  }
}
export function persistExplicitLanguageChoice(language: Language) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    window.localStorage.setItem(EXPLICIT_LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Keep the in-memory language change usable when storage is unavailable.
  }
}
export function shouldShowKoreanLanguageHint({ browserLanguage, currentLanguage, hasExplicitLanguageChoice }: {
  browserLanguage: string; currentLanguage: Language; hasExplicitLanguageChoice: boolean
}) {
  return browserLanguage.toLowerCase().startsWith('ko') && currentLanguage === 'en' && !hasExplicitLanguageChoice
}
