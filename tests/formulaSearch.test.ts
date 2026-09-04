import { describe, expect, it } from 'vitest'
import { filterFormulasByQuery, matchesFormulaSearch } from '../src/services/formulaSearch'
import type { Formula } from '../src/models/formula'

const formula = (name: string, formulaId: string): Formula => ({ id: formulaId, formulaId, date: '2026-09-04', name, notes: '', rows: [], createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:00:00.000Z' })

describe('formula search', () => {
  const formulas = [formula('Soft Floral Study', 'ACC-2609-001'), formula('Woody Musk Study', 'ACC-2610-014'), formula('Citrus Accord', 'ACC-2609-018')]
  it('matches empty, title, id, case-insensitive, and trimmed queries', () => {
    expect(filterFormulasByQuery(formulas, '')).toEqual(formulas)
    expect(matchesFormulaSearch(formulas[1], '  MUSK ')).toBe(true)
    expect(matchesFormulaSearch(formulas[2], '018')).toBe(true)
  })
  it('returns no match without mutating input or changing order', () => {
    expect(filterFormulasByQuery(formulas, 'missing')).toEqual([])
    expect(filterFormulasByQuery(formulas, '2609').map((item) => item.formulaId)).toEqual(['ACC-2609-001', 'ACC-2609-018'])
    expect(formulas.map((item) => item.formulaId)).toEqual(['ACC-2609-001', 'ACC-2610-014', 'ACC-2609-018'])
  })
})
