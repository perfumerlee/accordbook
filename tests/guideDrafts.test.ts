import { describe, expect, it } from 'vitest'
import { guideFingerprint, isGuideDraftEnvelope } from '../src/services/guideDrafts'
const document = { schemaVersion: 1 as const, guideId: 'time-machine', slug: 'time-machine', order: 3, metadata: { lastUpdated: '2026-09-14' }, locales: { en: { status: 'PUBLISHED' as const, title: 'Time Machine', subtitle: 'Guide', seo: { title: 'Time Machine', description: 'Guide' } } }, blocks: [] }
describe('Guide draft contract', () => {
  it('accepts only the controlled draft envelope shape', () => { expect(isGuideDraftEnvelope({ format: 'accordbook-guide-draft', formatVersion: 1, guideId: 'time-machine', revision: 1, updatedAt: '2026-09-14T00:00:00.000Z', basePublishedFingerprint: 'abc', document })).toBe(true); expect(isGuideDraftEnvelope({ format: 'other', revision: 1 })).toBe(false) })
  it('fingerprints the same document deterministically and changes on content edits', async () => { const first = await guideFingerprint(document); expect(first).toBe(await guideFingerprint(JSON.parse(JSON.stringify(document)))); expect(first).not.toBe(await guideFingerprint({ ...document, metadata: { lastUpdated: 'changed' } })) })
})
