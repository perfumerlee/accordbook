import type { Language } from './messages'

export const LANGUAGE_STORAGE_KEY = 'accordbook.locale'
export const DROP_LANGUAGE_STORAGE_KEY = 'accordbook.drop.locale'
export function savedLanguage(): Language | undefined {
  if (typeof window === 'undefined') return undefined
  const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return value === 'ko' || value === 'en' ? value : undefined
}
export function browserLanguage(): Language {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}
export function initialLanguage(): Language { return savedLanguage() ?? browserLanguage() }
export function savedDropLanguage(): Language | undefined {
  if (typeof window === 'undefined') return undefined
  const value = window.localStorage.getItem(DROP_LANGUAGE_STORAGE_KEY)
  return value === 'ko' || value === 'en' ? value : undefined
}
export function initialDropLanguage(): Language { return savedDropLanguage() ?? browserLanguage() }
export function resolveLanguage(saved: Language | undefined, browser: string | undefined): Language {
  if (saved) return saved
  return browser?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}
