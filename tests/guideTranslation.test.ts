import { describe, expect, it } from 'vitest'
import { calculateGuideEnTranslationFingerprint, getGuideEnTranslationSource, guideTranslationFreshness, markGuideKoTranslationForReview, markGuideKoTranslationReady, startGuideKoTranslation, validateGuideTranslationMetadata } from '../src/services/guideTranslation'
import type { GuideDocument } from '../src/models/guide'
import { resolveGuideHrefForLocale } from '../src/services/guideRoutes'

const doc = (): GuideDocument => ({ schemaVersion: 1, guideId: 'faq', slug: 'faq', order: 8, metadata: { lastUpdated: '2026-09-16', productVersion: '1.07' }, locales: { en: { status: 'DRAFT', title: 'FAQ', subtitle: 'Answers', seo: { title: 'FAQ', description: 'Answers' } }, ko: { status: 'DRAFT', title: 'FAQ', subtitle: '답변', seo: { title: 'FAQ', description: '답변' } } }, blocks: [{ blockId: 'p', type: 'paragraph', content: { en: { text: 'Hello' }, ko: { text: '안녕' } } }, { blockId: 'd', type: 'divider' }] })

describe('guide translation foundation', () => {
  it('localizes only recognized Guide routes and preserves suffixes', () => {
    expect(resolveGuideHrefForLocale('/guide/en/time-machine?x=1#top', 'ko')).toBe('/guide/ko/time-machine?x=1#top')
    expect(resolveGuideHrefForLocale('/guide/ko/time-machine', 'en')).toBe('/guide/en/time-machine')
    expect(resolveGuideHrefForLocale('https://example.com/guide/en/time-machine', 'ko')).toBe('https://example.com/guide/en/time-machine')
    expect(resolveGuideHrefForLocale('/drop/2026-001', 'ko')).toBe('/drop/2026-001')
  })
  it('projects only EN translation source and fingerprints it deterministically', async () => {
    const source = getGuideEnTranslationSource(doc())
    expect(source.blocks).toHaveLength(2)
    expect(await calculateGuideEnTranslationFingerprint(doc())).toMatch(/^v1:[a-f0-9]{64}$/)
    const koChanged = doc(); koChanged.locales.ko!.title = '변경'
    expect(await calculateGuideEnTranslationFingerprint(koChanged)).toBe(await calculateGuideEnTranslationFingerprint(doc()))
    const enChanged = doc(); enChanged.locales.en.title = 'New FAQ'
    expect(await calculateGuideEnTranslationFingerprint(enChanged)).not.toBe(await calculateGuideEnTranslationFingerprint(doc()))
  })
  it('keeps legacy and NOT_STARTED freshness safe', async () => {
    expect(await guideTranslationFreshness(doc())).toBe('UNTRACKED')
    const value = doc(); value.locales.ko!.translation = { state: 'NOT_STARTED', translatedFromFingerprint: null, reviewedAgainstFingerprint: null, reviewedKoFingerprint: null }
    expect(await guideTranslationFreshness(value)).toBe('NOT_APPLICABLE')
  })
  it('validates translation metadata invariants', () => {
    expect(validateGuideTranslationMetadata({ state: 'READY', translatedFromFingerprint: null, reviewedAgainstFingerprint: 'v1:' + 'a'.repeat(64), reviewedKoFingerprint: 'v1:' + 'a'.repeat(64) })).toBe(true)
    expect(validateGuideTranslationMetadata({ state: 'READY', translatedFromFingerprint: null, reviewedAgainstFingerprint: null })).toBe(false)
  })
  it('starts translation without changing KO content or publication status', async () => {
    const before = doc(); const result = await startGuideKoTranslation(before)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.locales.ko!.title).toBe(before.locales.ko!.title)
    expect(result.document.locales.ko!.status).toBe(before.locales.ko!.status)
    expect(result.document.locales.ko!.translation?.state).toBe('DRAFT')
    expect(result.document.locales.ko!.translation?.translatedFromFingerprint).toBe(await calculateGuideEnTranslationFingerprint(before))
  })
  it('blocks review until KO completeness and source checks pass', async () => {
    const incomplete = doc(); incomplete.locales.ko!.seo.description = ''
    const started = await startGuideKoTranslation(incomplete)
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const result = await markGuideKoTranslationForReview(started.document)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.length).toBeGreaterThan(0)
  })
  it('allows a complete DRAFT to become READY with both review fingerprints', async () => {
    const started = await startGuideKoTranslation(doc())
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const result = await markGuideKoTranslationReady(started.document)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.locales.ko!.translation?.state).toBe('READY')
    expect(result.document.locales.ko!.translation?.reviewedAgainstFingerprint).toMatch(/^v1:/)
    expect(result.document.locales.ko!.translation?.reviewedKoFingerprint).toMatch(/^v1:/)
  })
})
