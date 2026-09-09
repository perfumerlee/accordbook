import { describe, expect, it } from 'vitest'
import { formatFormulaDropDate } from '../src/services/formulaDropDate'
describe('Formula Drop date presentation', () => {
  it('uses 24-hour KST output consistently', () => { expect(formatFormulaDropDate('2026-12-31T14:59:00.000Z', true)).toBe('DEC 31 · 23:59 KST'); expect(formatFormulaDropDate('2026-12-31T14:59:00.000Z')).toBe('DEC 31') })
  it('fails safely for empty or invalid dates', () => { expect(formatFormulaDropDate(null, true)).toBe(''); expect(formatFormulaDropDate('invalid', true)).toBe('') })
})
