import type { GuideBlock, GuideDocument, GuideLocale, GuideDevice, GuideMedia, GuideMediaVariant, GuideValidationIssue, GuideValidationResult } from '../models/guide'
import { guideLocaleStatuses, isGuideDesktopScale } from '../models/guide'

const id = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const devices: GuideDevice[] = ['desktop', 'tablet', 'mobile']
const textTypes = new Set(['heading', 'paragraph', 'step', 'note', 'warning', 'link'])
const issue = (path: string, message: string, field?: string): GuideValidationIssue => ({ path, field, message })
const hasText = (value: unknown): value is { text: string } => !!value && typeof value === 'object' && typeof (value as { text?: unknown }).text === 'string' && !!(value as { text: string }).text.trim()
export function isSafeGuideAsset(src: string) { return src.startsWith('assets/') && !src.includes('..') && !src.includes('\\') && !src.includes('//') && !src.includes(':') && !src.includes('://') && /\.(png|webp)$/i.test(src) }
export function guideAssetPublicUrl(src: string) { return isSafeGuideAsset(src) ? `/guide/${src}` : undefined }
export function isSafeGuideLink(href: string) { return (href.startsWith('/guide/') || href.startsWith('/operator/') || href.startsWith('/')) ? !href.startsWith('//') && !href.includes('..') : /^https:\/\/[^\s]+$/i.test(href) }
function validateMedia(media: GuideMedia, path: string, issues: GuideValidationIssue[], requireLocale: GuideLocale = 'en') {
  if (!id.test(media.figureId)) issues.push(issue(path, 'figureId must be URL-safe'))
  if (media.presentation !== undefined) {
    if (!media.presentation || typeof media.presentation !== 'object') {
      issues.push(issue(`${path}.presentation`, 'presentation must be an object'))
    } else if (
      media.presentation.desktopScale !== undefined &&
      !isGuideDesktopScale(media.presentation.desktopScale)
    ) {
      issues.push(
        issue(
          `${path}.presentation.desktopScale`,
          'desktopScale must be between 0.1 and 1.0 in 0.1 increments',
        ),
      )
    }
  }
  for (const [locale, byDevice] of Object.entries(media.variants || {})) {
    if (locale !== 'en' && locale !== 'ko') { issues.push(issue(`${path}.variants.${locale}`, 'unsupported locale')); continue }
    for (const [device, variant] of Object.entries(byDevice || {})) {
      if (!devices.includes(device as GuideDevice)) { issues.push(issue(`${path}.${locale}.${device}`, 'unsupported device')); continue }
      const v = variant as Partial<GuideMediaVariant>
      if (!v.src || !isSafeGuideAsset(v.src)) issues.push(issue(`${path}.${locale}.${device}.src`, 'asset must be a repository-relative PNG or WebP under assets/'))
      if (!v.alt?.trim()) issues.push(issue(`${path}.${locale}.${device}.alt`, 'alt text is required'))
      if (!v.caption?.trim()) issues.push(issue(`${path}.${locale}.${device}.caption`, 'caption is required'))
      if (!v.viewport?.trim()) issues.push(issue(`${path}.${locale}.${device}.viewport`, 'viewport is required'))
    }
  }
  if (!media.variants[requireLocale]) issues.push(issue(path, `media requires ${requireLocale} or an explicit fallback policy`))
}
function validateBlock(block: GuideBlock, path: string, issues: GuideValidationIssue[]) {
  if (!block || !id.test(block.blockId)) issues.push(issue(path, 'blockId must be URL-safe'))
  if (block.type === 'heading' && ![2, 3].includes(block.level)) issues.push(issue(path, 'heading level must be 2 or 3'))
  if (textTypes.has(block.type) && 'content' in block) {
    for (const [locale, value] of Object.entries(block.content || {})) if (locale !== 'en' && locale !== 'ko' || !hasText(value)) issues.push(issue(`${path}.content.${locale}`, 'localized text must be non-empty'))
  }
  if (block.type === 'step' && (!Number.isInteger(block.step) || block.step < 1)) issues.push(issue(path, 'step must be a positive integer'))
  if (block.type === 'screenshot') validateMedia(block.media, `${path}.media`, issues)
  if (block.type === 'step' && block.media) validateMedia(block.media, `${path}.media`, issues)
  if (block.type === 'link' && !isSafeGuideLink(block.href)) issues.push(issue(`${path}.href`, 'unsafe link'))
}
export function validateGuideDocument(value: GuideDocument): GuideValidationResult<GuideDocument> {
  const issues: GuideValidationIssue[] = []
  if (!value || value.schemaVersion !== 1) issues.push(issue('schemaVersion', 'must be 1'))
  if (!value || !id.test(value.guideId)) issues.push(issue('guideId', 'must be lowercase URL-safe'))
  if (!value || !id.test(value.slug)) issues.push(issue('slug', 'must be lowercase URL-safe'))
  if (!value || !value.locales?.en) issues.push(issue('locales.en', 'English locale is required'))
  for (const locale of ['en', 'ko'] as const) { const content = value?.locales?.[locale]; if (!content) continue; if (!guideLocaleStatuses.includes(content.status)) issues.push(issue(`locales.${locale}.status`, 'unsupported status')); if (locale === 'en' && content.status === 'NOT_TRANSLATED') issues.push(issue(`locales.${locale}.status`, 'English cannot be NOT_TRANSLATED')); if (content.status === 'PUBLISHED' && (!content.title?.trim() || !content.subtitle?.trim() || !content.seo?.title?.trim() || !content.seo?.description?.trim())) issues.push(issue(`locales.${locale}`, 'published locale requires title, subtitle, and SEO metadata')) }
  const ids = new Set<string>(); for (const [index, block] of (value?.blocks || []).entries()) { if (ids.has(block.blockId)) issues.push(issue(`blocks.${index}.blockId`, 'duplicate blockId')); ids.add(block.blockId); validateBlock(block, `blocks.${index}`, issues); if (value?.locales?.ko?.status === 'PUBLISHED' && textTypes.has(block.type) && !hasText((block as { content?: { ko?: unknown } }).content?.ko)) issues.push(issue(`blocks.${index}.content.ko`, 'Korean text is required when KO is published')) }
  return issues.length ? { ok: false, issues } : { ok: true, value, issues: [] }
}
export function resolveGuideMedia(media: GuideMedia, locale: GuideLocale, device: GuideDevice) { const order: [GuideLocale, GuideDevice][] = locale === 'en' ? [['en', device], ['en', 'desktop']] : [[locale, device], [locale, 'desktop'], ...(media.allowCrossLocaleFallback === false ? [] : ([['en', device], ['en', 'desktop']] as [GuideLocale, GuideDevice][]))]; for (const [l, d] of order) { const variant = media.variants[l]?.[d]; if (variant) return { variant, requestedLocale: locale, resolvedLocale: l, requestedDevice: device, resolvedDevice: d, usedFallback: l !== locale || d !== device, usedCrossLocaleFallback: l !== locale } } return undefined }
export function publishedGuideLocales(documents: GuideDocument[]) { return documents.flatMap(document => (['en', 'ko'] as const).filter(locale => document.locales[locale]?.status === 'PUBLISHED').map(locale => ({ guideId: document.guideId, slug: document.slug, locale }))) }
export type GuideGlossary = { schemaVersion: 1; terms: { key: string; en: string; ko: string; notes?: string }[] }
export function validateGuideGlossary(value: GuideGlossary): GuideValidationResult<GuideGlossary> { const issues: GuideValidationIssue[] = []; if (!value || value.schemaVersion !== 1) issues.push(issue('schemaVersion', 'must be 1')); const keys = new Set<string>(); for (const [index, term] of (value?.terms || []).entries()) { if (!id.test(term.key)) issues.push(issue(`terms.${index}.key`, 'key must be URL-safe')); if (keys.has(term.key)) issues.push(issue(`terms.${index}.key`, 'duplicate glossary key')); keys.add(term.key); if (!term.en?.trim() || !term.ko?.trim()) issues.push(issue(`terms.${index}`, 'en and ko are required')) } return issues.length ? { ok: false, issues } : { ok: true, value, issues: [] } }
