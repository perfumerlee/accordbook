export const guideLocales = ['en', 'ko'] as const
export type GuideLocale = typeof guideLocales[number]
export const guideLocaleStatuses = ['NOT_TRANSLATED', 'DRAFT', 'NEEDS_REVIEW', 'PUBLISHED'] as const
export type GuideLocaleStatus = typeof guideLocaleStatuses[number]
export type GuideDevice = 'desktop' | 'tablet' | 'mobile'
export type GuideBlockType = 'heading' | 'paragraph' | 'step' | 'screenshot' | 'note' | 'warning' | 'divider' | 'link'
export type GuideText = { text: string }
export type GuideSeo = { title: string; description: string }
export type GuideMediaVariant = { src: string; alt: string; caption: string; viewport: string; productVersion?: string; capturedAt?: string }
export const GUIDE_DESKTOP_SCALE_MIN = 0.1
export const GUIDE_DESKTOP_SCALE_MAX = 1
export const GUIDE_DESKTOP_SCALE_STEP = 0.1
export type GuideDesktopScale = number

export function isGuideDesktopScale(value: unknown): value is GuideDesktopScale {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (value < GUIDE_DESKTOP_SCALE_MIN || value > GUIDE_DESKTOP_SCALE_MAX) return false
  const steps = value / GUIDE_DESKTOP_SCALE_STEP
  return Math.abs(steps - Math.round(steps)) < 1e-9
}

export type GuideMediaPresentation = { desktopScale?: GuideDesktopScale }
export type GuideMedia = { figureId: string; allowCrossLocaleFallback?: boolean; presentation?: GuideMediaPresentation; variants: Partial<Record<GuideLocale, Partial<Record<GuideDevice, GuideMediaVariant>>>> }
export type GuideBlock =
  | { blockId: string; type: 'heading'; level: 2 | 3; content: Partial<Record<GuideLocale, GuideText>> }
  | { blockId: string; type: 'paragraph' | 'note' | 'warning'; content: Partial<Record<GuideLocale, GuideText>> }
  | { blockId: string; type: 'step'; step: number; content: Partial<Record<GuideLocale, GuideText>>; media?: GuideMedia }
  | { blockId: string; type: 'screenshot'; media: GuideMedia }
  | { blockId: string; type: 'divider' }
  | { blockId: string; type: 'link'; content: Partial<Record<GuideLocale, GuideText>>; href: string; kind: 'internal' | 'external' }
export const guideTranslationStates = ['NOT_STARTED', 'DRAFT', 'REVIEW', 'READY'] as const
export type GuideTranslationState = typeof guideTranslationStates[number]
export type GuideTranslationMetadata = { state: GuideTranslationState; translatedFromFingerprint: string | null; reviewedAgainstFingerprint: string | null; reviewedKoFingerprint: string | null }
export type GuideLocaleContent = { status: GuideLocaleStatus; title: string; subtitle: string; seo: GuideSeo; translation?: GuideTranslationMetadata }
export type GuideDocument = { schemaVersion: 1; guideId: string; slug: string; order: number; metadata: { lastUpdated: string; productVersion?: string }; locales: { en: GuideLocaleContent; ko?: GuideLocaleContent }; blocks: GuideBlock[] }
export type GuideValidationIssue = { path: string; field?: string; message: string }
export type GuideValidationResult<T = unknown> = { ok: true; value: T; issues: [] } | { ok: false; issues: GuideValidationIssue[] }
