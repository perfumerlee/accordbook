import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { confirmPublishIntent, getPublishEligibility } from '../src/services/guidePublisher'
import { loadGuideDocuments } from '../src/services/guideContent'

const document = loadGuideDocuments().find(item => item.guideId === 'time-machine')!
const base = { connected: true, draftExists: true, dirty: false, historical: false, conflict: false, publishedChanged: false, document }

describe('GuideEditor Publisher UI contract', () => {
  it('binds RECOVER BASE to invoke the recovery handler', () => {
    const source = readFileSync(new URL('../src/components/guide/GuideLegacyRecovery.tsx', import.meta.url), 'utf8')
    expect(source).toContain('onClick={() => void recover()}')
    expect(source).not.toContain('onClick={() => void recover}')
  })
  it.each([
    ['disconnected', { connected: false }], ['no Draft', { draftExists: false }], ['dirty', { dirty: true }],
    ['historical', { historical: true }], ['revision conflict', { conflict: true }], ['published source changed', { publishedChanged: true }],
  ])('%s disables publication without a request', (_name, change) => expect(getPublishEligibility({ ...base, ...change }).enabled).toBe(false))
  it('enables a clean current valid Draft', () => expect(getPublishEligibility(base)).toEqual({ enabled: true }))
  it('keeps the request boundary to publication intent', () => { const request = { guideId: document.guideId, expectedDraftRevision: 8 }; expect(request).toEqual({ guideId: 'time-machine', expectedDraftRevision: 8 }); expect(request).not.toHaveProperty('document'); expect(request).not.toHaveProperty('token'); expect(request).not.toHaveProperty('branch') })
  it('uses production EN/KO links, never localhost', () => { const links = [`https://accordbook.org/guide/en/${document.slug}/`, `https://accordbook.org/guide/ko/${document.slug}/`]; expect(links).toEqual(['https://accordbook.org/guide/en/time-machine/', 'https://accordbook.org/guide/ko/time-machine/']); expect(links.join(' ')).not.toContain('localhost') })
  it('reaches confirmation before the publisher request and preserves cancel', () => { const confirm = vi.fn().mockReturnValue(false); expect(confirmPublishIntent('Time Machine', 'time-machine', 2, 'PUBLISHED', 'PUBLISHED', confirm)).toBe(false); expect(confirm).toHaveBeenCalledOnce(); expect(confirm.mock.calls[0][0]).toContain('r2'); expect(confirm.mock.calls[0][0]).toContain('This will update the public Accordbook Guide through GitHub.') })
})
