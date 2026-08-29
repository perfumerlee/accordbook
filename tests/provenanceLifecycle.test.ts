import { describe, expect, it } from 'vitest'
import type { Formula } from '../src/models/formula'
import { appendRevision, contentFingerprint, createProvenance, verifyIntegrity } from '../src/services/provenance'

const formula = (parts: number): Formula => ({ id: 'local', formulaId: 'ACC-001', date: '2026-08-29', name: '', notes: '', rows: [{ id: 'row', parts, material: 'Hedione' }], createdAt: '2026-08-29T00:00:00.000Z', updatedAt: '2026-08-29T00:00:00.000Z' })

describe('provenance revision lifecycle', () => {
  it('records a modified revision only when composition changes', async () => {
    const initial = formula(490)
    const created = { ...initial, provenance: await createProvenance(initial) }
    const unchanged = await contentFingerprint(initial)
    expect(unchanged).toBe(created.provenance?.currentFingerprint)
    const modified = await appendRevision({ ...created, rows: [{ ...created.rows[0], parts: 500 }] }, 'modified')
    expect(modified.provenance?.revisions.map((r) => r.eventType)).toEqual(['created', 'modified'])
    expect(modified.provenance?.revisions[1].previousRevisionHash).toBe(modified.provenance?.revisions[0].revisionHash)
    expect(modified.provenance?.currentFingerprint).toBe(await contentFingerprint(modified))
    expect(await verifyIntegrity(modified)).toBe('verified')
  })

  it('keeps genesis checkpoint immutable and chains export at the current fingerprint', async () => {
    const initial = formula(490)
    const created = { ...initial, provenance: await createProvenance(initial) }
    const modified = await appendRevision({ ...created, rows: [{ ...created.rows[0], parts: 500 }] }, 'modified')
    const exported = await appendRevision(modified, 'exported')
    expect(exported.provenance?.revisions.map((r) => r.eventType)).toEqual(['created', 'modified', 'exported'])
    expect(exported.provenance?.revisions[1].contentFingerprint).toBe(exported.provenance?.revisions[2].contentFingerprint)
    expect(exported.provenance?.checkpoint?.kind).toBe('genesis')
    expect(exported.provenance?.checkpoint?.fingerprint.value).not.toBe(exported.provenance?.currentFingerprint)
    expect(await verifyIntegrity(exported)).toBe('verified')
  })

  it('records origin changes separately without changing composition fingerprint', async () => {
    const initial = formula(490)
    const created = { ...initial, provenance: await createProvenance(initial, 'created', { originType: 'not_specified' }) }
    const before = await contentFingerprint(created)
    const updated = await appendRevision({ ...created, provenance: { ...created.provenance!, claimedSource: { originType: 'inspired_by', title: 'Jasmine Accord', creator: 'Jean Carles' } } }, 'source_updated', { originType: 'inspired_by', title: 'Jasmine Accord', creator: 'Jean Carles' })
    expect(updated.provenance?.revisions.map((revision) => revision.eventType)).toEqual(['created', 'source_updated'])
    expect(updated.provenance?.currentFingerprint).toBe(before)
    expect(await verifyIntegrity(updated)).toBe('verified')
  })

  it('clears source details when an origin is changed to original', async () => {
    const initial = formula(490)
    const created = { ...initial, provenance: await createProvenance(initial, 'created', { originType: 'inspired_by', title: 'Jasmine Accord', creator: 'Jean Carles', url: 'https://example.com', note: 'study' }) }
    const updated = await appendRevision({ ...created, provenance: { ...created.provenance!, claimedSource: { originType: 'original' } } }, 'source_updated', { originType: 'original' })
    expect(updated.provenance?.claimedSource).toEqual({ originType: 'original' })
    expect(updated.provenance?.revisions).toHaveLength(2)
    expect(await verifyIntegrity(updated)).toBe('verified')
  })
})
