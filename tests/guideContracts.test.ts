import { describe, expect, it } from 'vitest'
import { publishedGuideLocales, resolveGuideMedia, validateGuideDocument, validateGuideGlossary } from '../src/services/guideContracts'
import { resolveGuideRoute } from '../src/services/guideRoutes'
const base = { schemaVersion: 1 as const, guideId: 'time-machine', slug: 'time-machine', order: 3, metadata: { lastUpdated: '2026-09-14' }, locales: { en: { status: 'PUBLISHED' as const, title: 'Time Machine', subtitle: 'A guide', seo: { title: 'Time Machine', description: 'Guide' } }, ko: { status: 'DRAFT' as const, title: '타임 머신', subtitle: '초안', seo: { title: '타임 머신', description: '초안' } } }, blocks: [{ blockId: 'intro', type: 'paragraph' as const, content: { en: { text: 'Text' } } }] }
describe('Guide Phase 0 contracts', () => {
  it('accepts EN published with KO draft', () => expect(validateGuideDocument(base).ok).toBe(true))
  it('requires Korean text when KO is published', () => expect(validateGuideDocument({ ...base, locales: { ...base.locales, ko: { ...base.locales.ko, status: 'PUBLISHED' } } }).ok).toBe(false))
  it('rejects duplicate block ids, unsafe assets and links', () => { const doc = { ...base, blocks: [{ ...base.blocks[0], blockId: 'same' }, { ...base.blocks[0], blockId: 'same', type: 'link' as const, href: 'javascript:alert(1)' }] }; expect(validateGuideDocument(doc).ok).toBe(false) })
  it('resolves media in the defined order', () => { const media = { figureId: 'figure', variants: { en: { desktop: { src: 'assets/x.png', alt: 'x', caption: 'x', viewport: '1x1' } } } }; expect(resolveGuideMedia(media, 'en', 'mobile')?.variant.src).toBe('assets/x.png') })
  it('supports disabled cross-locale fallback', () => { const media = { figureId: 'figure', allowCrossLocaleFallback: false, variants: { en: { desktop: { src: 'assets/x.png', alt: 'x', caption: 'x', viewport: '1x1' } } } }; expect(resolveGuideMedia(media, 'ko', 'mobile')).toBeUndefined() })
  it('resolves guide routes without changing production routing', () => { expect(resolveGuideRoute('/guide/en/time-machine')).toEqual({ kind: 'GUIDE_CHAPTER', locale: 'en', slug: 'time-machine' }); expect(resolveGuideRoute('/guide/fr/x').kind).toBe('GUIDE_NOT_FOUND') })
  it('publishes only published locales and validates glossary keys', () => { expect(publishedGuideLocales([base])).toEqual([{ guideId: 'time-machine', slug: 'time-machine', locale: 'en' }]); expect(validateGuideGlossary({ schemaVersion: 1, terms: [{ key: 'formula', en: 'Formula', ko: 'Formula' }, { key: 'formula', en: 'x', ko: 'x' }] }).ok).toBe(false) })
})
