import { describe, expect, it } from 'vitest'
import { resolveLanguage } from '../src/i18n/language'
import { formulaDropCopy } from '../src/components/FormulaDropLanguage'

describe('Formula Drop language precedence', () => {
  it.each([
    [undefined, 'ko-KR', 'ko'],
    [undefined, 'en-US', 'en'],
    ['en', 'ko-KR', 'en'],
    ['ko', 'en-US', 'ko'],
  ] as const)('resolves saved=%s browser=%s to %s', (saved, browser, expected) => {
    expect(resolveLanguage(saved, browser)).toBe(expected)
  })
})

it('does not treat the general Accordbook locale as an explicit Drop choice', () => {
  expect(resolveLanguage(undefined, 'ko-KR')).toBe('ko')
  expect(resolveLanguage(undefined, 'en-US')).toBe('en')
})

it('provides coherent Korean Drop CTA and instructions', () => {
  expect(formulaDropCopy['DOWNLOAD FORMULA FILE']).toBe('포뮬러 다운로드')
  expect(formulaDropCopy['Download the .accordbook file. Then open Accordbook and choose “Open .accordbook file” to continue.']).toContain('.accordbook 파일')
})
