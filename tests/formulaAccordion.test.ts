import { describe, expect, it } from 'vitest'
import { isAccordionAvailable, reconcileAccordionOpen } from '../src/services/formulaAccordion'

describe('formula accordion rules', () => {
  it('uses actual formula count, not filtered result count', () => {
    expect(isAccordionAvailable(0)).toBe(false)
    expect(isAccordionAvailable(10)).toBe(true)
  })

  it('closes at zero and opens when the first formula appears', () => {
    expect(reconcileAccordionOpen(true, 0)).toBe(false)
    expect(reconcileAccordionOpen(false, 1, true)).toBe(true)
  })

  it('preserves a closed state while formulas still exist', () => {
    expect(reconcileAccordionOpen(false, 10)).toBe(false)
    expect(reconcileAccordionOpen(true, 10)).toBe(true)
  })
})
