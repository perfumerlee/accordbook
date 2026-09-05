import { describe, expect, it } from 'vitest'
import type { Formula } from '../src/models/formula'
import { collectMaterialCandidates, filterMaterialSuggestions } from '../src/services/materialMemory'

const formula = (id: string, materials: string[]): Formula => ({ id, formulaId: id, date: '', name: id, notes: '', rows: materials.map((material, index) => ({ id: `${id}-${index}`, material, parts: 1 })), createdAt: id, updatedAt: id })

describe('material memory', () => {
  it('collects notebook and archive names with stable, case-insensitive dedupe', () => {
    const notebook = [formula('a', [' Hedione ', 'hedione', '', '  '])]
    const archive = [formula('b', ['Linalool', 'DPG'])]
    expect(collectMaterialCandidates(notebook, archive)).toEqual(['Hedione', 'Linalool', 'DPG'])
    expect(notebook[0].rows[0].material).toBe(' Hedione ')
  })

  it('ranks prefix matches before contains matches and excludes exact matches', () => {
    expect(filterMaterialSuggestions(['Ethyl Linalool', 'Linalool', 'Linalyl acetate', 'Linalool HC'], 'lin')).toEqual(['Linalool', 'Linalyl acetate', 'Linalool HC', 'Ethyl Linalool'])
    expect(filterMaterialSuggestions(['Hedione'], ' hedione ')).toEqual([])
  })

  it('limits results to five', () => {
    expect(filterMaterialSuggestions(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], 'a')).toHaveLength(5)
  })
})
