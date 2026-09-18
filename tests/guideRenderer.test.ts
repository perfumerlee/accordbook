import { describe, expect, it } from 'vitest'
import { chapterNavigation, guideLocaleState, GuideBlockRenderer } from '../src/components/guide/GuidePage'
import { resolveGuideRoute } from '../src/services/guideRoutes'
import type { GuideDocument, GuideLocaleStatus } from '../src/models/guide'

const doc = {
  schemaVersion: 1 as const,
  guideId: 'time-machine',
  slug: 'time-machine',
  order: 3,
  metadata: { lastUpdated: '2026-09-14' },
  locales: {
    en: {
      status: 'PUBLISHED' as const,
      title: 'Time Machine',
      subtitle: 'Guide',
      seo: { title: 'Time Machine', description: 'Guide' },
    },
    ko: {
      status: 'DRAFT' as const,
      title: '타임 머신',
      subtitle: '안내',
      seo: { title: '타임 머신', description: '안내' },
    },
  },
  blocks: [],
} as GuideDocument

function navigationDoc(
  slug: string,
  order: number,
  status: GuideLocaleStatus,
): GuideDocument {
  return {
    ...doc,
    guideId: slug,
    slug,
    order,
    locales: {
      ...doc.locales,
      en: {
        ...doc.locales.en,
        status,
        title: slug,
        seo: { ...doc.locales.en.seo, title: slug },
      },
    },
  }
}

describe('Guide Phase 1 renderer behavior', () => {
  it.each(['/guide', '/guide/'])(
    'recognizes Guide home %s',
    path => expect(resolveGuideRoute(path).kind).toBe('GUIDE_HOME'),
  )

  it.each(['/guide/en', '/guide/en/', '/guide/ko', '/guide/ko/'])(
    'recognizes locale home %s',
    path => expect(resolveGuideRoute(path).kind).toBe('GUIDE_LOCALE_HOME'),
  )

  it.each(['/guide/en/time-machine', '/guide/ko/time-machine'])(
    'recognizes chapter %s',
    path => expect(resolveGuideRoute(path).kind).toBe('GUIDE_CHAPTER'),
  )

  it('does not capture non-Guide routes or invalid locales', () => {
    expect(resolveGuideRoute('/drop').kind).toBe('NOT_GUIDE_ROUTE')
    expect(resolveGuideRoute('/guide/fr/x').kind).toBe('GUIDE_NOT_FOUND')
  })

  it('computes KO fallback state without publishing Korean', () =>
    expect(guideLocaleState(doc, 'ko')).toEqual({
      requestedLocale: 'ko',
      renderedLocale: 'en',
      isFallback: true,
    }))

  it('keeps navigation limited to the publication state supplied by documents', () => {
    const documents = [
      navigationDoc('getting-started', 1, 'PUBLISHED'),
      navigationDoc('formula-basics', 2, 'DRAFT'),
      navigationDoc('time-machine', 3, 'PUBLISHED'),
      navigationDoc('formula-drop', 5, 'PUBLISHED'),
    ]

    expect(chapterNavigation('getting-started', documents).previous).toBeUndefined()
    expect(chapterNavigation('time-machine', documents).previous?.[0]).toBe('getting-started')
    expect(chapterNavigation('time-machine', documents).next?.[0]).toBe('formula-drop')
    expect(chapterNavigation('formula-drop', documents).next).toBeUndefined()

    const withFormulaBasicsPublished = documents.map(document =>
      document.slug === 'formula-basics'
        ? {
            ...document,
            locales: {
              ...document.locales,
              en: { ...document.locales.en, status: 'PUBLISHED' as const },
            },
          }
        : document,
    )

    expect(
      chapterNavigation('time-machine', withFormulaBasicsPublished).previous?.[0],
    ).toBe('formula-basics')
  })

  it('returns safe elements for every supported block', () => {
    const blocks = [
      { blockId: 'h', type: 'heading', level: 2, content: { en: { text: 'H' } } },
      { blockId: 'p', type: 'paragraph', content: { en: { text: 'P' } } },
      { blockId: 's', type: 'step', step: 1, content: { en: { text: 'S' } } },
      { blockId: 'n', type: 'note', content: { en: { text: 'N' } } },
      { blockId: 'w', type: 'warning', content: { en: { text: 'W' } } },
      { blockId: 'd', type: 'divider' },
      {
        blockId: 'l',
        type: 'link',
        content: { en: { text: 'L' } },
        href: '/guide',
        kind: 'internal',
      },
    ] as any[]

    expect(
      blocks.map(block => GuideBlockRenderer({ block, locale: 'en' })?.type),
    ).toEqual(['h2', 'p', 'section', 'aside', 'aside', 'hr', 'p'])
  })
})
