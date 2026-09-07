import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FormulaVersion, FormulaVersionSnapshot } from '../src/models/formula'
import { canShowVersionComposition, formatVersionCompositionForClipboard, getVersionComposition } from '../src/services/versionComposition'
import { VersionCompositionView } from '../src/components/VersionCompositionView'

const snapshot: FormulaVersionSnapshot = {
  name: 'Historical Citrus', formulaId: 'PRIVATE-ID', date: '2026-09-01', notes: 'PRIVATE-NOTES',
  rows: [' Hedione ', '', '   ', 'Bergamot', 'Hedione'].map((material, index) => ({
    rowId: String(index), material, parts: 987.65, cas: 'PRIVATE-CAS',
    dilution: { enabled: true, percent: 13, solvent: 'PRIVATE-SOLVENT' },
  })),
}

describe('Version composition', () => {
  it('filters blanks, trims, deduplicates and alphabetically sorts names only', () => {
    expect(getVersionComposition(snapshot)).toEqual(['Bergamot', 'Hedione'])
  })
  it('does not mutate even frozen snapshot rows', () => {
    const frozen = structuredClone(snapshot)
    frozen.rows.forEach(Object.freeze)
    Object.freeze(frozen.rows)
    Object.freeze(frozen)
    expect(getVersionComposition(frozen)).toEqual(['Bergamot', 'Hedione'])
    expect(frozen).toEqual(snapshot)
  })
  it('remains independent of changes to current formula content', () => {
    const current = structuredClone(snapshot)
    current.name = 'Current'
    current.rows.push({ rowId: 'new', material: 'Iso E Super', parts: 5 })
    expect(getVersionComposition(snapshot)).toEqual(['Bergamot', 'Hedione'])
  })
  it('returns an empty list for an empty snapshot', () => {
    expect(getVersionComposition({ ...snapshot, rows: [] })).toEqual([])
  })
  it.each(['manual', 'restore-point'] as const)('eligibility is limited to manual versions: %s', kind => {
    expect(canShowVersionComposition({ kind } as FormulaVersion)).toBe(kind === 'manual')
  })
  it.each(['en', 'ko'] as const)('renders historical name, version, unique count and no metadata: %s', language => {
    const html = renderToStaticMarkup(createElement(VersionCompositionView, { snapshot, versionNumber: 7, language }))
    expect(html).toContain('Historical Citrus')
    expect(html).toContain('v7 · 2')
    expect(html.match(/<li>/g)).toHaveLength(2)
    expect(html).toContain(language === 'en' ? 'Proportions hidden' : '함량은 표시되지 않습니다.')
    for (const secret of ['987.65', 'PRIVATE-ID', 'PRIVATE-NOTES', 'PRIVATE-CAS', 'PRIVATE-SOLVENT', '@13%']) expect(html).not.toContain(secret)
  })
  it('uses the historical untitled fallback', () => {
    const html = renderToStaticMarkup(createElement(VersionCompositionView, { snapshot: { ...snapshot, name: '' }, versionNumber: 1, language: 'en' }))
    expect(html).toContain('Untitled')
  })
  it.each(['en', 'ko'] as const)('formats a full clipboard composition without hidden data: %s', language => {
    const text = formatVersionCompositionForClipboard({ name: 'Historical Citrus', versionNumber: 7, materials: ['Bergamot', 'Hedione'], language })
    expect(text).toContain('Historical Citrus')
    expect(text).toContain('v7')
    expect(text).toContain('Bergamot\nHedione')
    expect(text).not.toContain('987.65')
    expect(text).not.toContain('PRIVATE')
    expect(text).toContain(language === 'en' ? 'Proportions hidden' : '함량은 표시되지 않습니다.')
  })
})
