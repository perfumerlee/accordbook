import { describe, expect, it } from 'vitest'
import type { GuideDocument, GuideMedia } from '../src/models/guide'
import { isGuideDesktopScale } from '../src/models/guide'
import { validateGuideDocument } from '../src/services/guideContracts'
import {
  GUIDE_DESKTOP_FIGURE_BASE_PX,
  guideDesktopFigureWidth,
} from '../src/components/guide/GuidePage'

const media = (desktopScale?: number): GuideMedia => ({
  figureId: 'figure-one',
  ...(desktopScale !== undefined
    ? { presentation: { desktopScale } }
    : {}),
  variants: {
    en: {
      desktop: {
        src: 'assets/example/en/desktop/example.png',
        alt: 'Example screenshot',
        caption: 'Example caption',
        viewport: '1440x900',
      },
    },
  },
})

const documentWith = (value: GuideMedia): GuideDocument => ({
  schemaVersion: 1,
  guideId: 'example',
  slug: 'example',
  order: 1,
  metadata: { lastUpdated: '2026-09-18' },
  locales: {
    en: {
      status: 'DRAFT',
      title: 'Example',
      subtitle: 'Example',
      seo: { title: 'Example', description: 'Example' },
    },
  },
  blocks: [{ blockId: 'figure', type: 'screenshot', media: value }],
})

describe('Guide desktop screenshot presentation', () => {
  it('uses the default desktop width when no explicit scale is stored', () => {
    expect(guideDesktopFigureWidth(media())).toBe(GUIDE_DESKTOP_FIGURE_BASE_PX)
  })

  it.each([
    [0.1, 80],
    [0.2, 160],
    [0.5, 400],
    [0.8, 640],
    [1.0, 800],
  ] as const)('maps %s scale to %spx', (scale, width) => {
    expect(guideDesktopFigureWidth(media(scale))).toBe(width)
  })

  it.each([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])(
    'accepts supported 10%% step scale %s',
    scale => {
      expect(isGuideDesktopScale(scale)).toBe(true)
      expect(validateGuideDocument(documentWith(media(scale))).ok).toBe(true)
    },
  )

  it.each([0, 0.15, 0.75, 1.1, Number.NaN])(
    'rejects unsupported desktop scale %s',
    scale => {
      expect(isGuideDesktopScale(scale)).toBe(false)
      const result = validateGuideDocument(documentWith(media(scale)))
      expect(result.ok).toBe(false)
    },
  )
})
