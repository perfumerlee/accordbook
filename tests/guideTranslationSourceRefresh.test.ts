import { describe, expect, it } from 'vitest'
import type { GuideDocument } from '../src/models/guide'
import {
  calculateGuideEnTranslationFingerprint,
  guideTranslationFreshness,
  markGuideKoTranslationReady,
  refreshGuideKoTranslationSource,
  startGuideKoTranslation,
} from '../src/services/guideTranslation'

const baseDocument = (): GuideDocument => ({
  schemaVersion: 1,
  guideId: 'import-export',
  slug: 'import-export',
  order: 6,
  metadata: { lastUpdated: '2026-09-18', productVersion: '1.07' },
  locales: {
    en: {
      status: 'DRAFT',
      title: 'Import & Export',
      subtitle: 'Move Formula work between files and notebooks.',
      seo: {
        title: 'Import & Export — Accordbook Guide',
        description: 'Guide to Accordbook import and export.',
      },
    },
    ko: {
      status: 'DRAFT',
      title: '가져오기와 내보내기',
      subtitle: '작업 중인 포뮬러를 파일과 노트북 사이에서 옮깁니다.',
      seo: {
        title: '가져오기와 내보내기 — Accordbook Guide',
        description: 'Accordbook 가져오기와 내보내기 안내입니다.',
      },
    },
  },
  blocks: [],
})

describe('Guide translation EN source refresh', () => {
  it('keeps KO content and rebases a stale DRAFT onto the current EN source', async () => {
    const started = await startGuideKoTranslation(baseDocument())
    expect(started.ok).toBe(true)
    if (!started.ok) return

    const changed = structuredClone(started.document)
    changed.locales.en.subtitle = 'Move Formula work between files, notebooks, and people.'

    expect(await guideTranslationFreshness(changed)).toBe('STALE_DRAFT_SOURCE')

    const koBefore = structuredClone(changed.locales.ko)
    const refreshed = await refreshGuideKoTranslationSource(changed)
    expect(refreshed.ok).toBe(true)
    if (!refreshed.ok) return

    expect(refreshed.document.locales.ko?.title).toBe(koBefore?.title)
    expect(refreshed.document.locales.ko?.subtitle).toBe(koBefore?.subtitle)
    expect(refreshed.document.locales.ko?.seo).toEqual(koBefore?.seo)
    expect(refreshed.document.locales.ko?.translation?.state).toBe('DRAFT')
    expect(refreshed.document.locales.ko?.translation?.translatedFromFingerprint)
      .toBe(await calculateGuideEnTranslationFingerprint(refreshed.document))
    expect(refreshed.document.locales.ko?.translation?.reviewedAgainstFingerprint).toBeNull()
    expect(refreshed.document.locales.ko?.translation?.reviewedKoFingerprint).toBeNull()
    expect(await guideTranslationFreshness(refreshed.document)).toBe('CURRENT_DRAFT_SOURCE')

    const ready = await markGuideKoTranslationReady(refreshed.document)
    expect(ready.ok).toBe(true)
    if (!ready.ok) return
    expect(ready.document.locales.ko?.translation?.state).toBe('READY')
  })
})
