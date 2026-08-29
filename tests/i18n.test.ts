import { describe, expect, it } from 'vitest'
import { messages } from '../src/i18n/messages'

describe('i18n dictionary', () => {
  it('defaults to English content and provides Korean translations', () => { expect(messages.en.newFormula).toBe('+ New formula'); expect(messages.ko.newFormula).toBe('+ 새 포뮬러'); expect(messages.ko.footer).toBe('모든 것은 기본기에서 시작된다.') })
  it('keeps technical tokens and user data independent of language', () => { expect('Jasmine Study').toBe('Jasmine Study'); expect(messages.ko.parts).toBe('배합량'); expect(messages.ko.date).toBe('날짜'); expect(messages.ko.actions).toBe('동작'); expect(messages.ko.percent).toBe('배합비율'); expect(messages.ko.cas).toBe('CAS / 참조'); expect('SOLVENT').toBe('SOLVENT'); expect('DIL').toBe('DIL') })
  it('translates dynamic total and autosave messages', () => { expect(messages.en.addParts(50)).toBe('Add 50 more parts.'); expect(messages.ko.addParts(50)).toBe('50 parts를 더 추가하세요.'); expect(messages.en.savedLocally).not.toBe(messages.ko.savedLocally) })
})
