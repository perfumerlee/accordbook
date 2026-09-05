import { describe, expect, it } from 'vitest'
import { orderFormulasWithPinned } from '../src/services/formulaOrdering'
import type { Formula } from '../src/models/formula'

const formula = (id: string): Formula => ({ id, formulaId: id, date: '', name: id, notes: '', rows: [], createdAt: id, updatedAt: id })

describe('orderFormulasWithPinned', () => {
  it('stable partitions pinned formulas without mutating input', () => {
    const input = ['a', 'b', 'c', 'd'].map(formula)
    const result = orderFormulasWithPinned(input, ['c', 'a'])
    expect(result.map((item) => item.id)).toEqual(['a', 'c', 'b', 'd'])
    expect(input.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ignores stale pin references', () => {
    expect(orderFormulasWithPinned(['a', 'b'].map(formula), ['missing', 'b']).map((item) => item.id)).toEqual(['b', 'a'])
  })
})
