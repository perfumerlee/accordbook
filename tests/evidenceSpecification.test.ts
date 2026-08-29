import { describe, expect, it } from 'vitest'
import vectors from '../docs/test-vectors/canonicalization-v1.json'
import revisionVector from '../docs/test-vectors/revision-hash-payload-v1.json'
import { appendRevision, canonicalComposition, createProvenance, revisionHashPayloadV1, sha256, verifyIntegrity } from '../src/services/provenance'
import type { Formula } from '../src/models/formula'

const formula = (rows: Formula['rows']): Formula => ({ id: 'local', formulaId: 'ACC-TEST', date: '2026-01-01', name: 'ignored', notes: 'ignored', rows, createdAt: '', updatedAt: '' })

describe('frozen evidence specifications', () => {
  it('matches every canonicalization v1 official vector', async () => {
    for (const vector of vectors) {
      const payload = canonicalComposition(formula(vector.input.rows as Formula['rows']))
      expect(payload).toBe(vector.canonicalPayload)
      expect(await sha256(payload)).toBe(vector.expectedFingerprint)
    }
  })

  it('matches the revision hash payload v1 official vector', async () => {
    const input = { recordId: 'record-vector-001', revisionId: 'revision-vector-002', sequence: 2, eventType: 'modified' as const, recordedAt: '2026-08-29T12:00:00.000Z', contentFingerprint: 'a'.repeat(64), previousRevisionHash: 'b'.repeat(64) }
    expect(revisionHashPayloadV1(input)).toBe(revisionVector.payload)
    expect(await sha256(revisionHashPayloadV1(input))).toBe(revisionVector.expectedHash)
  })

  it('verifies legacy and mixed revision chains as payload version 1', async () => {
    const initial = formula([{ id: 'row', material: 'Hedione', parts: 490 }])
    const created = { ...initial, provenance: await createProvenance(initial) }
    const modified = await appendRevision({ ...created, rows: [{ ...created.rows[0], parts: 500 }] }, 'modified')
    const exported = await appendRevision(modified, 'exported')
    const mixed = { ...exported, provenance: { ...exported.provenance!, revisions: exported.provenance!.revisions.map((revision, index) => index < 2 ? (() => { const { revisionHashPayloadVersion: _version, ...legacy } = revision; return legacy })() : revision) } }
    expect(await verifyIntegrity(mixed)).toBe('verified')
  })

  it('rejects unsupported payload versions without mutating evidence', async () => {
    const initial = formula([{ id: 'row', material: 'Hedione', parts: 490 }])
    const created = { ...initial, provenance: await createProvenance(initial) }
    const before = JSON.stringify(created)
    const unsupported = { ...created, provenance: { ...created.provenance!, revisions: created.provenance!.revisions.map((revision) => ({ ...revision, revisionHashPayloadVersion: 999 as 1 })) } }
    expect(await verifyIntegrity(unsupported)).toBe('unavailable')
    expect(JSON.stringify(created)).toBe(before)
  })

  it('excludes rowId from canonical payload and fingerprint', async () => {
    const rows = [{ id: 'row-a', material: 'Hedione', cas: '24851-98-7', parts: 500 }, { id: 'row-b', material: 'Jasmine', parts: 20 }]
    const withRowIds = rows.map((row, index) => ({ ...row, rowId: `different-${index}` }))
    const a = canonicalComposition(formula(rows))
    const b = canonicalComposition(formula(withRowIds))
    expect(b).toBe(a)
    expect(await sha256(b)).toBe(await sha256(a))
  })
})
