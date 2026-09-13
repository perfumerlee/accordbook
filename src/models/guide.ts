export const guideLocales = ['en', 'ko'] as const
export type GuideLocale = typeof guideLocales[number]
export const guideLocaleStatuses = ['NOT_TRANSLATED', 'DRAFT', 'NEEDS_REVIEW', 'PUBLISHED'] as const
export type GuideLocaleStatus = typeof guideLocaleStatuses[number]
export type GuideDevice = 'desktop' | 'tablet' | 'mobile'
export type GuideBlockType = 'heading' | 'paragraph' | 'step' | 'screenshot' | 'note' | 'warning' | 'divider' | 'link'
export type GuideText = { text: string }
export type GuideSeo = { title: string; description: string }
export type GuideMediaVariant = { src: string; alt: string; caption: string; viewport: string; productVersion?: string; capturedAt?: string }
export type GuideMedia = { figureId: string; allowCrossLocaleFallback?: boolean; variants: Partial<Record<GuideLocale, Partial<Record<GuideDevice, GuideMediaVariant>>>> }
export type GuideBlock =
  | { blockId: string; type: 'heading'; level: 2 | 3; content: Partial<Record<GuideLocale, GuideText>> }
  | { blockId: string; type: 'paragraph' | 'note' | 'warning'; content: Partial<Record<GuideLocale, GuideText>> }
  | { blockId: string; type: 'step'; step: number; content: Partial<Record<GuideLocale, GuideText>>; media?: GuideMedia }
  | { blockId: string; type: 'screenshot'; media: GuideMedia }
  | { blockId: string; type: 'divider' }
  | { blockId: string; type: 'link'; content: Partial<Record<GuideLocale, GuideText>>; href: string; kind: 'internal' | 'external' }
export type GuideLocaleContent = { status: GuideLocaleStatus; title: string; subtitle: string; seo: GuideSeo }
export type GuideDocument = { schemaVersion: 1; guideId: string; slug: string; order: number; metadata: { lastUpdated: string; productVersion?: string }; locales: { en: GuideLocaleContent; ko?: GuideLocaleContent }; blocks: GuideBlock[] }
export type GuideValidationIssue = { path: string; field?: string; message: string }
export type GuideValidationResult<T = unknown> = { ok: true; value: T; issues: [] } | { ok: false; issues: GuideValidationIssue[] }
