import type { GuideBlock, GuideDocument, GuideTranslationMetadata, GuideTranslationState } from '../models/guide'
import { guideTranslationStates } from '../models/guide'
import { isLocalizableGuideHref } from './guideRoutes'

export const GUIDE_TRANSLATION_SOURCE_VERSION = 1
export type GuideEnTranslationSourceV1 = { version: 1; locale: { title: string; subtitle: string; seo: { title: string; description: string } }; blocks: ReturnType<typeof projectBlock>[] }
export type GuideTranslationFreshness = 'UNTRACKED' | 'NOT_APPLICABLE' | 'CURRENT' | 'CURRENT_DRAFT_SOURCE' | 'STALE' | 'STALE_DRAFT_SOURCE'
export type GuideTranslationReadinessIssueCode = 'MISSING_TRANSLATION_METADATA' | 'TRANSLATION_NOT_STARTED' | 'TRANSLATION_STATE_NOT_READY' | 'MISSING_KO_TITLE' | 'MISSING_KO_SUBTITLE' | 'MISSING_KO_SEO_TITLE' | 'MISSING_KO_SEO_DESCRIPTION' | 'MISSING_BLOCK_TRANSLATION' | 'PLACEHOLDER_CONTENT' | 'MISSING_SCREENSHOT_ALT' | 'MISSING_SCREENSHOT_CAPTION' | 'STALE_TRANSLATION' | 'MISSING_REVIEW_FINGERPRINT' | 'MISSING_REVIEWED_KO_FINGERPRINT' | 'REVIEW_FINGERPRINT_MISMATCH' | 'KO_CHANGED_SINCE_REVIEW' | 'UNLOCALIZED_INTERNAL_GUIDE_LINK'
export type GuideTranslationReadinessIssue = { code: GuideTranslationReadinessIssueCode; path?: string; blockId?: string; message: string }
export type GuideKoTranslationReadiness = { ready: boolean; freshness: GuideTranslationFreshness; issues: GuideTranslationReadinessIssue[]; currentEnFingerprint: string; translationState?: GuideTranslationState; legacyMode: boolean }

function projectBlock(block: GuideBlock) {
  switch (block.type) {
    case 'heading': case 'paragraph': case 'note': case 'warning': case 'link':
      return { blockId: block.blockId, type: block.type, text: block.content.en?.text ?? '' }
    case 'step':
      return { blockId: block.blockId, type: block.type, step: block.step, text: block.content.en?.text ?? '', media: block.media ? projectMedia(block.media) : undefined }
    case 'screenshot':
      return { blockId: block.blockId, type: block.type, media: projectMedia(block.media) }
    case 'divider':
      return { blockId: block.blockId, type: block.type }
    default: return assertNever(block)
  }
}
function projectMedia(media: Extract<GuideBlock, { type: 'screenshot' }>['media']) {
  return { figureId: media.figureId, variants: Object.entries(media.variants.en ?? {}).map(([device, variant]) => ({ device, alt: variant?.alt ?? '', caption: variant?.caption ?? '' })) }
}
function assertNever(value: never): never { throw new Error(`Unsupported Guide block type: ${String(value)}`) }
const missing = (code: GuideTranslationReadinessIssueCode, path: string, message: string): GuideTranslationReadinessIssue => ({ code, path, message })
export function isLegacyKoTranslationPlaceholder(value: string | undefined): boolean { return typeof value === 'string' && /번역 준비 중/.test(value) }
function meaningful(value: string | undefined): boolean { return typeof value === 'string' && value.trim().length > 0 && !isLegacyKoTranslationPlaceholder(value) }
function addKoBlockIssues(block: GuideBlock, index: number, issues: GuideTranslationReadinessIssue[]) {
  const path = `blocks.${index}`
  if (block.type === 'divider') return
  if ('content' in block && !meaningful(block.content.ko?.text)) issues.push(missing('MISSING_BLOCK_TRANSLATION', `${path}.content.ko`, `Korean content is missing for ${block.blockId}.`))
  if ('content' in block && isLegacyKoTranslationPlaceholder(block.content.ko?.text)) issues.push(missing('PLACEHOLDER_CONTENT', `${path}.content.ko`, `Korean placeholder content remains for ${block.blockId}.`))
  if (block.type === 'link' && block.href.startsWith('/guide/') && !isLocalizableGuideHref(block.href)) issues.push(missing('UNLOCALIZED_INTERNAL_GUIDE_LINK', `${path}.href`, `Internal Guide link cannot be localized safely.`))
  if (block.type === 'screenshot' || (block.type === 'step' && block.media)) {
    const media = block.type === 'screenshot' ? block.media : block.media!
    const variants = media.variants.ko ?? {}
    for (const [device, variant] of Object.entries(media.variants.en ?? {})) {
      const ko = variants[device as keyof typeof variants]
      if (!meaningful(ko?.alt)) issues.push(missing('MISSING_SCREENSHOT_ALT', `${path}.media.variants.ko.${device}.alt`, `Korean screenshot alt text is missing.`))
      if (!meaningful(ko?.caption)) issues.push(missing('MISSING_SCREENSHOT_CAPTION', `${path}.media.variants.ko.${device}.caption`, `Korean screenshot caption is missing.`))
    }
  }
}
export async function assessGuideKoTranslationReadiness(document: GuideDocument): Promise<GuideKoTranslationReadiness> {
  const currentEnFingerprint = await calculateGuideEnTranslationFingerprint(document)
  const ko = document.locales.ko
  const metadata = ko?.translation
  if (!metadata) return { ready: false, freshness: 'UNTRACKED', issues: [missing('MISSING_TRANSLATION_METADATA', 'locales.ko.translation', 'Korean translation metadata is not tracked.')], currentEnFingerprint, legacyMode: true }
  const issues: GuideTranslationReadinessIssue[] = []
  const freshness = await guideTranslationFreshness(document)
  if (metadata.state === 'NOT_STARTED') issues.push(missing('TRANSLATION_NOT_STARTED', 'locales.ko.translation.state', 'Korean translation has not started.'))
  if (metadata.state !== 'READY') issues.push(missing('TRANSLATION_STATE_NOT_READY', 'locales.ko.translation.state', 'Translation must be READY before publication.'))
  if (!meaningful(ko?.title)) issues.push(missing('MISSING_KO_TITLE', 'locales.ko.title', 'Korean title is missing.'))
  if (!meaningful(ko?.subtitle)) issues.push(missing('MISSING_KO_SUBTITLE', 'locales.ko.subtitle', 'Korean subtitle is missing.'))
  if (!meaningful(ko?.seo.title)) issues.push(missing('MISSING_KO_SEO_TITLE', 'locales.ko.seo.title', 'Korean SEO title is missing.'))
  if (!meaningful(ko?.seo.description)) issues.push(missing('MISSING_KO_SEO_DESCRIPTION', 'locales.ko.seo.description', 'Korean SEO description is missing.'))
  for (const [index, block] of document.blocks.entries()) addKoBlockIssues(block, index, issues)
  if (metadata.state === 'READY' && !metadata.reviewedAgainstFingerprint) issues.push(missing('MISSING_REVIEW_FINGERPRINT', 'locales.ko.translation.reviewedAgainstFingerprint', 'READY translation requires a reviewed EN fingerprint.'))
  if (metadata.reviewedAgainstFingerprint && metadata.reviewedAgainstFingerprint !== currentEnFingerprint) issues.push(missing('REVIEW_FINGERPRINT_MISMATCH', 'locales.ko.translation.reviewedAgainstFingerprint', 'Translation was not reviewed against the current EN source.'))
  if (freshness === 'STALE' || freshness === 'STALE_DRAFT_SOURCE') issues.push(missing('STALE_TRANSLATION', 'locales.ko.translation', 'The EN translation source has changed.'))
  const currentKoFingerprint = await calculateGuideKoTranslationFingerprint(document)
  if (metadata.state === 'READY' && !metadata.reviewedKoFingerprint) issues.push(missing('MISSING_REVIEWED_KO_FINGERPRINT', 'locales.ko.translation.reviewedKoFingerprint', 'READY translation requires a reviewed KO fingerprint.'))
  if (metadata.reviewedKoFingerprint && metadata.reviewedKoFingerprint !== currentKoFingerprint) issues.push(missing('KO_CHANGED_SINCE_REVIEW', 'locales.ko.translation.reviewedKoFingerprint', 'Korean content changed since review.'))
  return { ready: metadata.state === 'READY' && freshness === 'CURRENT' && issues.length === 0, freshness, issues, currentEnFingerprint, translationState: metadata.state, legacyMode: false }
}
export function getGuideEnTranslationSource(document: GuideDocument): GuideEnTranslationSourceV1 { return { version: 1, locale: { title: document.locales.en.title, subtitle: document.locales.en.subtitle, seo: { title: document.locales.en.seo.title, description: document.locales.en.seo.description } }, blocks: document.blocks.map(projectBlock) } }
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])); return value }
export async function calculateGuideEnTranslationFingerprint(document: GuideDocument): Promise<string> { const canonical = JSON.stringify(stable(getGuideEnTranslationSource(document))); const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)); return `v${GUIDE_TRANSLATION_SOURCE_VERSION}:${[...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')}` }
export function validateGuideTranslationMetadata(value: unknown): value is GuideTranslationMetadata { if (!value || typeof value !== 'object') return false; const item = value as Partial<GuideTranslationMetadata>; if (!guideTranslationStates.includes(item.state as GuideTranslationState)) return false; for (const key of ['translatedFromFingerprint', 'reviewedAgainstFingerprint', 'reviewedKoFingerprint'] as const) if (item[key] !== null && (typeof item[key] !== 'string' || !/^v1:[a-f0-9]{64}$/.test(item[key]))) return false; if (item.state === 'NOT_STARTED' && item.reviewedAgainstFingerprint !== null) return false; if (item.state === 'READY' && (!item.reviewedAgainstFingerprint || !item.reviewedKoFingerprint)) return false; return true }
export async function guideTranslationFreshness(document: GuideDocument): Promise<GuideTranslationFreshness> { const metadata = document.locales.ko?.translation; if (!metadata) return 'UNTRACKED'; if (metadata.state === 'NOT_STARTED') return 'NOT_APPLICABLE'; const current = await calculateGuideEnTranslationFingerprint(document); if (metadata.reviewedAgainstFingerprint) return metadata.reviewedAgainstFingerprint === current ? 'CURRENT' : 'STALE'; if (metadata.translatedFromFingerprint) return metadata.translatedFromFingerprint === current ? 'CURRENT_DRAFT_SOURCE' : 'STALE_DRAFT_SOURCE'; return 'UNTRACKED' }
export type GuideKoReviewIntegrity = 'UNTRACKED' | 'CURRENT' | 'CHANGED'
export function getGuideKoTranslationContent(document: GuideDocument) { return { version: 1 as const, locale: { title: document.locales.ko?.title ?? '', subtitle: document.locales.ko?.subtitle ?? '', seo: { title: document.locales.ko?.seo.title ?? '', description: document.locales.ko?.seo.description ?? '' } }, blocks: document.blocks.map(block => { if (block.type === 'divider') return { blockId: block.blockId, type: block.type }; if (block.type === 'screenshot') return { blockId: block.blockId, type: block.type, media: projectMedia({ ...block.media, variants: { en: block.media.variants.ko ?? {} } }) }; if (block.type === 'step') return { blockId: block.blockId, type: block.type, step: block.step, text: block.content.ko?.text ?? '', media: block.media ? projectMedia({ ...block.media, variants: { en: block.media.variants.ko ?? {} } }) : undefined }; return { blockId: block.blockId, type: block.type, text: block.content.ko?.text ?? '' } }) } }
export async function calculateGuideKoTranslationFingerprint(document: GuideDocument): Promise<string> { const canonical = JSON.stringify(stable(getGuideKoTranslationContent(document))); const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)); return `v${GUIDE_TRANSLATION_SOURCE_VERSION}:${[...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')}` }

export type GuideTranslationTransitionResult = { ok: true; document: GuideDocument } | { ok: false; issues: GuideTranslationReadinessIssue[] }
const copyDocument = (document: GuideDocument): GuideDocument => JSON.parse(JSON.stringify(document)) as GuideDocument
const withTranslation = (document: GuideDocument, translation: GuideTranslationMetadata): GuideDocument => {
  const next = copyDocument(document)
  next.locales.ko = { ...(next.locales.ko ?? next.locales.en), translation }
  return next
}

export async function startGuideKoTranslation(document: GuideDocument): Promise<GuideTranslationTransitionResult> {
  if (!document.locales.ko?.translation && document.locales.ko?.status === 'PUBLISHED') {
    return { ok: false, issues: [missing('MISSING_TRANSLATION_METADATA', 'locales.ko.translation', 'Published Korean content is not tracked yet.')] }
  }
  const currentEnFingerprint = await calculateGuideEnTranslationFingerprint(document)
  return { ok: true, document: withTranslation(document, { state: 'DRAFT', translatedFromFingerprint: currentEnFingerprint, reviewedAgainstFingerprint: null, reviewedKoFingerprint: null }) }
}

export async function refreshGuideKoTranslationSource(document: GuideDocument): Promise<GuideTranslationTransitionResult> {
  const metadata = document.locales.ko?.translation
  if (!metadata) return { ok: false, issues: [missing('MISSING_TRANSLATION_METADATA', 'locales.ko.translation', 'Korean translation metadata is not tracked.')] }
  if (!(['DRAFT', 'REVIEW'] as GuideTranslationState[]).includes(metadata.state)) {
    return { ok: false, issues: [missing('TRANSLATION_STATE_NOT_READY', 'locales.ko.translation.state', 'Translation must be in DRAFT or REVIEW before its EN source can be updated.')] }
  }
  const currentEnFingerprint = await calculateGuideEnTranslationFingerprint(document)
  return {
    ok: true,
    document: withTranslation(document, {
      ...metadata,
      state: 'DRAFT',
      translatedFromFingerprint: currentEnFingerprint,
      reviewedAgainstFingerprint: null,
      reviewedKoFingerprint: null,
    }),
  }
}

export async function reopenGuideKoTranslationDraft(document: GuideDocument): Promise<GuideTranslationTransitionResult> {
  const metadata = document.locales.ko?.translation
  if (!metadata) return { ok: false, issues: [missing('MISSING_TRANSLATION_METADATA', 'locales.ko.translation', 'Korean translation metadata is not tracked.')] }
  return { ok: true, document: withTranslation(document, { ...metadata, state: 'DRAFT', reviewedAgainstFingerprint: null, reviewedKoFingerprint: null }) }
}

export async function markGuideKoTranslationForReview(document: GuideDocument): Promise<GuideTranslationTransitionResult> {
  const metadata = document.locales.ko?.translation
  if (!metadata || metadata.state !== 'DRAFT') return { ok: false, issues: [missing('TRANSLATION_STATE_NOT_READY', 'locales.ko.translation.state', 'Translation must be in DRAFT before review.')] }
  const assessment = await assessGuideKoTranslationReadiness(withTranslation(document, { ...metadata, state: 'DRAFT' }))
  const issues = assessment.issues.filter(issue => issue.code !== 'TRANSLATION_STATE_NOT_READY' && issue.code !== 'MISSING_TRANSLATION_METADATA')
  if (!metadata.translatedFromFingerprint || metadata.translatedFromFingerprint !== assessment.currentEnFingerprint) issues.push(missing('STALE_TRANSLATION', 'locales.ko.translation.translatedFromFingerprint', 'The EN translation source has changed.'))
  if (issues.length) return { ok: false, issues }
  return { ok: true, document: withTranslation(document, { ...metadata, state: 'REVIEW', reviewedAgainstFingerprint: null, reviewedKoFingerprint: null }) }
}

export async function markGuideKoTranslationReady(document: GuideDocument): Promise<GuideTranslationTransitionResult> {
  const metadata = document.locales.ko?.translation
  if (!metadata || !(['DRAFT', 'REVIEW'] as GuideTranslationState[]).includes(metadata.state)) return { ok: false, issues: [missing('TRANSLATION_STATE_NOT_READY', 'locales.ko.translation.state', 'Translation must be in DRAFT before it can be ready.')] }
  const enFingerprint = await calculateGuideEnTranslationFingerprint(document)
  if (!metadata.translatedFromFingerprint || metadata.translatedFromFingerprint !== enFingerprint) return { ok: false, issues: [missing('STALE_TRANSLATION', 'locales.ko.translation.translatedFromFingerprint', 'The EN translation source has changed.')] }
  const candidate = withTranslation(document, { ...metadata, state: 'READY', reviewedAgainstFingerprint: enFingerprint, reviewedKoFingerprint: null })
  const koFingerprint = await calculateGuideKoTranslationFingerprint(candidate)
  const assessment = await assessGuideKoTranslationReadiness(withTranslation(candidate, { ...candidate.locales.ko!.translation!, reviewedKoFingerprint: koFingerprint }))
  if (assessment.issues.length) return { ok: false, issues: assessment.issues }
  return { ok: true, document: withTranslation(candidate, { ...candidate.locales.ko!.translation!, reviewedKoFingerprint: koFingerprint }) }
}
