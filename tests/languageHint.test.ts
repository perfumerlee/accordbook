import { afterEach, expect, it, vi } from 'vitest'
import { hasExplicitLanguageChoice, persistExplicitLanguageChoice, shouldShowKoreanLanguageHint } from '../src/i18n/languageHint'

afterEach(() => vi.unstubAllGlobals())
it.each([
  ['ko-KR', 'en', false, true], ['ko', 'en', true, false],
  ['ko-KR', 'ko', false, false], ['ko', 'ko', true, false],
  ['en-US', 'en', false, false],
] as const)('eligibility: %s / %s / explicit %s', (browserLanguage, currentLanguage, explicit, expected) => {
  expect(shouldShowKoreanLanguageHint({ browserLanguage, currentLanguage, hasExplicitLanguageChoice: explicit })).toBe(expected)
})
it.each(['en', 'ko'] as const)('persists intentional %s separately from legacy/default EN', language => {
  const values = new Map([['accordbook.locale', 'en']])
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } })
  expect(hasExplicitLanguageChoice()).toBe(false)
  persistExplicitLanguageChoice(language)
  expect(values.get('accordbook.locale')).toBe(language)
  expect(values.get('accordbook.locale.explicit')).toBe(language)
  expect(hasExplicitLanguageChoice()).toBe(true)
})
