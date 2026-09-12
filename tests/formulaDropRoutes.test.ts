import { describe, expect, it } from 'vitest'
import { resolveAccordbookRoute } from '../src/services/formulaDropRoutes'
import { selectFeaturedDrop } from '../src/components/FormulaDropIndexPage'
import { parsePublicComposition, parsePublicDropContent } from '../src/components/FormulaDropDetailPage'
describe('Formula Drop routes', () => {
  it.each(['/'])('keeps the root route', path => expect(resolveAccordbookRoute(path)).toEqual({ kind: 'root' }))
  it.each(['/drop', '/drop/'])('resolves the index route', path => expect(resolveAccordbookRoute(path)).toEqual({ kind: 'drop-index' }))
  it.each(['/drop/2026-001', '/drop/2026-001/'])('derives canonical detail ID', path => expect(resolveAccordbookRoute(path)).toEqual({ kind: 'drop-detail', slug: '2026-001', dropId: 'DROP-2026-001' }))
  it.each(['/drop/26-001', '/drop/2026-1', '/drop/DROP-2026-001', '/drop/2026-0000', '/drop/foo', '/admin'])('rejects malformed routes', path => expect(resolveAccordbookRoute(path).kind).toBe('unknown'))
})
describe('Formula Drop index selection', () => {
  const base = { year: 2026, sequence: 1, title: 'Study', subtitle: '', description: '', startAt: null, expiresAt: null }
  it('selects an active drop and no item for an empty list', () => {
    const expired = { ...base, dropId: 'DROP-2026-001', slug: '2026-001', status: 'EXPIRED' as const }
    const active = { ...base, dropId: 'DROP-2026-002', slug: '2026-002', status: 'ACTIVE' as const }
    expect(selectFeaturedDrop([expired, active])).toBe(active)
    expect(selectFeaturedDrop([])).toBeUndefined()
  })
})
describe('Formula Drop public composition', () => {
  it('extracts published composition names without inventing parts', () => {
    expect(parsePublicComposition('FORMULA COMPOSITION\n2 Materials\nNeroli\nDPG\n\nㅡ\n\nNotes')).toEqual(['Neroli', 'DPG'])
    expect(parsePublicComposition('No composition')).toEqual([])
  })
})
describe('Formula Drop content separation', () => {
  it('keeps surrounding notes without repeating the composition marker or entries', () => {
    expect(parsePublicDropContent('Intro text\n\nFORMULA COMPOSITION\nMaterial A\nMaterial B\n\nㅡ\n\nAdditional notes')).toEqual({ composition: ['Material A', 'Material B'], notes: 'Intro text\n\nAdditional notes' })
  })
  it('omits empty notes and preserves descriptions without a composition marker', () => {
    expect(parsePublicDropContent('FORMULA COMPOSITION\nMaterial A')).toEqual({ composition: ['Material A'], notes: '' })
    expect(parsePublicDropContent('Public note only')).toEqual({ composition: [], notes: 'Public note only' })
    expect(parsePublicDropContent('')).toEqual({ composition: [], notes: '' })
  })
})
