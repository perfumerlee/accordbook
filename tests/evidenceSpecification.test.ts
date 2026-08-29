import { describe, expect, it } from 'vitest'
import vectors from '../docs/test-vectors/canonicalization-v1.json'
import revisionVector from '../docs/test-vectors/revision-hash-payload-v1.json'
import { canonicalComposition, revisionHashPayloadV1, sha256 } from '../src/services/provenance'
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
})
