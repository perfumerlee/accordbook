import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type {
  GuideBlock,
  GuideDocument,
  GuideLocale,
  GuideMedia,
  GuideMediaVariant,
} from '../../models/guide'
import { guideAssetPublicUrl, resolveGuideMedia } from '../../services/guideContracts'
import { guideNavigation, loadGuideDocuments } from '../../services/guideContent'
import { resolveGuideHrefForLocale, resolveGuideRoute } from '../../services/guideRoutes'
import './guide.css'
import "./guide-media-sizing.css";

const docs = loadGuideDocuments()
const labels = {
  en: {
    guide: 'GUIDE',
    homeTitle: 'Accordbook Guide',
    intro: 'A practical guide to working with Accordbook.',
    fallback: 'This page is not yet available in Korean. The English version is shown below.',
    previous: 'PREVIOUS',
    next: 'NEXT',
    home: 'Guide home',
    notFound: 'Guide chapter not found',
    unavailable: 'This chapter is not published yet.',
    chapters: 'Guide chapters',
    open: 'OPEN',
    comingSoon: 'COMING SOON',
  },
  ko: {
    guide: '가이드',
    homeTitle: 'Accordbook 가이드',
    intro: 'Accordbook을 사용하는 조용한 실무 안내서입니다.',
    fallback: '이 페이지는 아직 한국어로 제공되지 않습니다. 아래에 영어 버전을 표시합니다.',
    previous: '이전',
    next: '다음',
    home: '가이드 홈',
    notFound: '가이드 챕터를 찾을 수 없습니다',
    unavailable: '아직 공개되지 않은 챕터입니다.',
    chapters: '가이드 챕터',
    open: '열기',
    comingSoon: '준비 중',
  },
}

const GUIDE_LOCALE_STORAGE_KEY = 'accordbook.locale'

function readGuideLocalePreference(): GuideLocale {
  try {
    return localStorage.getItem(GUIDE_LOCALE_STORAGE_KEY) === 'ko' ? 'ko' : 'en'
  } catch {
    return 'en'
  }
}

function writeGuideLocalePreference(locale: GuideLocale) {
  try {
    localStorage.setItem(GUIDE_LOCALE_STORAGE_KEY, locale)
  } catch {
    // Locale still works through the URL when storage is unavailable.
  }
}

function guidePathForLocale(
  route: ReturnType<typeof resolveGuideRoute>,
  locale: GuideLocale,
) {
  if (route.kind === 'GUIDE_CHAPTER') {
    return `/guide/${locale}/${route.slug}/`
  }
  return `/guide/${locale}/`
}

export function isGuideChapterPublished(doc: GuideDocument | undefined) {
  return doc?.locales.en.status === 'PUBLISHED'
}

export function isGuideLocalePublished(doc: GuideDocument | undefined, locale: GuideLocale) {
  return Boolean(doc && isGuideChapterPublished(doc) && doc.locales[locale]?.status === 'PUBLISHED')
}

export function guideChapterTitle(
  slug: string,
  locale: GuideLocale,
  documents: GuideDocument[] = docs,
) {
  const document = documents.find(item => item.slug === slug)
  if (document) {
    if (isGuideLocalePublished(document, locale)) {
      return document.locales[locale]?.title ?? document.locales.en.title
    }
    return document.locales.en.title
  }
  return guideNavigation.find(([id]) => id === slug)?.[1] ?? slug
}

export default function GuidePage({
  pathname = window.location.pathname,
}: {
  pathname?: string
}) {
  const route = resolveGuideRoute(pathname)
  const routeLocale =
    route.kind === 'GUIDE_CHAPTER' || route.kind === 'GUIDE_LOCALE_HOME'
      ? route.locale
      : undefined
  const [locale, setLocale] = useState<GuideLocale>(
    routeLocale ?? readGuideLocalePreference(),
  )

  const matchedDoc =
    route.kind === 'GUIDE_CHAPTER'
      ? docs.find(item => item.slug === route.slug)
      : undefined
  const doc = isGuideChapterPublished(matchedDoc) ? matchedDoc : undefined
  const renderedLocale: GuideLocale = doc
    ? isGuideLocalePublished(doc, locale)
      ? locale
      : 'en'
    : locale

  const changeLocale = (nextLocale: GuideLocale) => {
    writeGuideLocalePreference(nextLocale)
    const nextPath = guidePathForLocale(route, nextLocale)
    if (window.location.pathname !== nextPath) {
      window.history.replaceState(window.history.state, '', nextPath)
    }
    setLocale(nextLocale)
  }

  useEffect(() => {
    writeGuideLocalePreference(locale)

    // Canonicalize bare /guide to the selected locale so refresh/share keeps it.
    if (route.kind === 'GUIDE_HOME') {
      const nextPath = guidePathForLocale(route, locale)
      if (window.location.pathname !== nextPath) {
        window.history.replaceState(window.history.state, '', nextPath)
      }
    }

    document.documentElement.lang = renderedLocale
    document.title = doc
      ? `${(doc.locales[renderedLocale] ?? doc.locales.en).title} — Accordbook Guide`
      : labels[locale].homeTitle
  }, [doc, locale, renderedLocale, route.kind])

  if (route.kind === 'GUIDE_CHAPTER' && !doc) {
    return (
      <Shell locale={locale} onLocale={changeLocale}>
        <section className="guide-unavailable" role="status">
          <p className="guide-kicker">ACCORD BOOK / GUIDE</p>
          <h1>{labels[locale].notFound}</h1>
          <p>{labels[locale].unavailable}</p>
          <a href={`/guide/${locale}/`} className="guide-back">
            ← {labels[locale].home}
          </a>
        </section>
      </Shell>
    )
  }

  if (doc) {
    return (
      <Chapter
        doc={doc}
        requestedLocale={locale}
        renderedLocale={renderedLocale}
        onLocale={changeLocale}
      />
    )
  }

  return <Home locale={locale} onLocale={changeLocale} />
}
export function guideLocaleState(doc: GuideDocument, requestedLocale: GuideLocale) {
  const renderedLocale: GuideLocale =
    isGuideLocalePublished(doc, requestedLocale) ? requestedLocale : 'en'
  return {
    requestedLocale,
    renderedLocale,
    isFallback: requestedLocale !== renderedLocale,
  }
}
export function chapterNavigation(
  slug: string,
  documents: GuideDocument[] = loadGuideDocuments(),
) {
  const live = guideNavigation.filter(([id]) =>
    documents.some(doc => doc.slug === id && isGuideChapterPublished(doc)),
  )
  const index = live.findIndex(item => item[0] === slug)
  return {
    previous: index > 0 ? live[index - 1] : undefined,
    next: index >= 0 && index < live.length - 1 ? live[index + 1] : undefined,
  }
}
function Shell({
  children,
  locale,
  onLocale,
}: {
  children: ReactNode
  locale: GuideLocale
  onLocale?: (locale: GuideLocale) => void
}) {
  return (
    <main className="guide-page">
      <header className="guide-header">
        <a href="/" className="guide-wordmark">
          Accordbook
        </a>
        <a href={`/guide/${locale}/`} className="guide-label">
          {labels[locale].guide}
        </a>
        {onLocale && (
          <div className="guide-language">
            <button
              type="button"
              aria-pressed={locale === 'en'}
              onClick={() => onLocale('en')}
            >
              EN
            </button>
            <button
              type="button"
              aria-pressed={locale === 'ko'}
              onClick={() => onLocale('ko')}
            >
              한국어
            </button>
          </div>
        )}
      </header>
      {children}
    </main>
  )
}
function Home({
  locale,
  onLocale,
}: {
  locale: GuideLocale
  onLocale: (locale: GuideLocale) => void
}) {
  return (
    <Shell locale={locale} onLocale={onLocale}>
      <section className="guide-home">
        <p className="guide-kicker">ACCORD BOOK / GUIDE</p>
        <h1>
          Accordbook
          <br />
          {locale === 'ko' ? '가이드' : 'Guide'}
        </h1>
        <p className="guide-intro">{labels[locale].intro}</p>
        <div className="guide-rule" />
        <nav className="guide-index" aria-label={labels[locale].chapters}>
          {guideNavigation.map(([slug], i) => {
            const chapter = docs.find(doc => doc.slug === slug)
            const published = isGuideChapterPublished(chapter)
            const title = guideChapterTitle(slug, locale)
            const content = (
              <>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{title}</strong>
                <em>{published ? labels[locale].open : labels[locale].comingSoon}</em>
              </>
            )

            return published ? (
              <a href={`/guide/${locale}/${slug}`} key={slug}>
                {content}
              </a>
            ) : (
              <div
                className="guide-index-unavailable"
                aria-disabled="true"
                key={slug}
              >
                {content}
              </div>
            )
          })}
        </nav>
      </section>
    </Shell>
  )
}
function Chapter({
  doc,
  requestedLocale,
  renderedLocale,
  onLocale,
}: {
  doc: GuideDocument
  requestedLocale: GuideLocale
  renderedLocale: GuideLocale
  onLocale: (locale: GuideLocale) => void
}) {
  const content = doc.locales[renderedLocale] ?? doc.locales.en
  const { previous, next } = chapterNavigation(doc.slug)
  const previousTitle = previous
    ? guideChapterTitle(previous[0], requestedLocale)
    : labels[requestedLocale].home
  const nextTitle = next
    ? guideChapterTitle(next[0], requestedLocale)
    : labels[requestedLocale].home

  return (
    <Shell locale={requestedLocale} onLocale={onLocale}>
      <article className="guide-chapter">
        <a href={`/guide/${requestedLocale}/`} className="guide-back">
          ← {labels[requestedLocale].home}
        </a>
        <p className="guide-kicker">
          {String(doc.order).padStart(2, '0')} / {content.title}
        </p>
        <h1>{content.title}</h1>
        <p className="guide-subtitle">{content.subtitle}</p>
        {requestedLocale !== renderedLocale && (
          <p className="guide-fallback" role="status">
            {labels[requestedLocale].fallback}
          </p>
        )}
        <div className="guide-rule" />
        <GuideRenderer document={doc} locale={renderedLocale} />
        <nav className="guide-chapter-nav">
          <a
            href={
              previous
                ? `/guide/${requestedLocale}/${previous[0]}`
                : `/guide/${requestedLocale}/`
            }
          >
            <small>{labels[requestedLocale].previous}</small>
            <span>{previousTitle}</span>
          </a>
          <a
            href={
              next
                ? `/guide/${requestedLocale}/${next[0]}`
                : `/guide/${requestedLocale}/`
            }
          >
            <small>{labels[requestedLocale].next}</small>
            <span>{nextTitle}</span>
          </a>
        </nav>
      </article>
    </Shell>
  )
}
export function GuideRenderer({ document, locale, deviceOverride, assetResolver }: { document: GuideDocument; locale: GuideLocale; deviceOverride?: 'desktop' | 'tablet' | 'mobile'; assetResolver?: (src: string) => string | undefined }) { return <div className="guide-renderer">{document.blocks.map(block => <GuideBlockRenderer block={block} locale={locale} deviceOverride={deviceOverride} assetResolver={assetResolver} key={block.blockId} />)}</div> }
function text(block: Extract<GuideBlock, { content: unknown }>, locale: GuideLocale) { return block.content[locale]?.text ?? block.content.en?.text ?? '' }
export const GUIDE_DESKTOP_FIGURE_BASE_PX = 800

export function guideDesktopFigureWidth(media: GuideMedia) {
  const scale = media.presentation?.desktopScale ?? 1
  return Math.round(GUIDE_DESKTOP_FIGURE_BASE_PX * scale)
}

function Figure({
  media,
  locale,
  deviceOverride,
  assetResolver,
}: {
  media: Extract<GuideBlock, { type: 'screenshot' }>['media']
  locale: GuideLocale
  deviceOverride?: 'desktop' | 'tablet' | 'mobile'
  assetResolver?: (src: string) => string | undefined
}) {
  const resolved = resolveGuideMedia(
    media,
    locale,
    deviceOverride ??
      (window.innerWidth < 768
        ? 'mobile'
        : window.innerWidth < 1200
          ? 'tablet'
          : 'desktop'),
  )
  const variant = resolved?.variant as GuideMediaVariant | undefined
  const src =
    variant &&
    (assetResolver?.(variant.src) ?? guideAssetPublicUrl(variant.src))
  if (!variant || !src) return null

  const desktopWidth = guideDesktopFigureWidth(media)
  const figureStyle = {
    '--guide-figure-desktop-width': `${desktopWidth}px`,
  } as CSSProperties

  return (
    <figure
      className="guide-figure"
      style={figureStyle}
      data-desktop-scale={media.presentation?.desktopScale ?? 'auto'}
    >
      <img src={src} alt={variant.alt} />
      <figcaption>
        <span>{media.figureId}</span>
        {variant.caption}
      </figcaption>
    </figure>
  )
}
export function GuideBlockRenderer({
  block,
  locale,
  deviceOverride,
  assetResolver,
}: {
  block: GuideBlock
  locale: GuideLocale
  deviceOverride?: 'desktop' | 'tablet' | 'mobile'
  assetResolver?: (src: string) => string | undefined
}) {
  if (block.type === 'divider') return <hr className="guide-divider" />
  if (block.type === 'screenshot')
    return (
      <Figure
        media={block.media}
        locale={locale}
        deviceOverride={deviceOverride}
        assetResolver={assetResolver}
      />
    )
  if (block.type === 'heading')
    return block.level === 2 ? (
      <h2>{text(block, locale)}</h2>
    ) : (
      <h3>{text(block, locale)}</h3>
    )
  if (block.type === 'paragraph') return <p>{text(block, locale)}</p>
  if (block.type === 'step')
    return (
      <section className="guide-step">
        <small>
          {locale === 'ko' ? '단계' : 'STEP'} {String(block.step).padStart(2, '0')}
        </small>
        <p>{text(block, locale)}</p>
        {block.media && (
          <Figure
            media={block.media}
            locale={locale}
            deviceOverride={deviceOverride}
            assetResolver={assetResolver}
          />
        )}
      </section>
    )
  if (block.type === 'note' || block.type === 'warning') {
    const label =
      locale === 'ko'
        ? block.type === 'note'
          ? '참고'
          : '주의'
        : block.type.toUpperCase()
    return (
      <aside className={`guide-callout ${block.type}`}>
        <small>{label}</small>
        <p>{text(block, locale)}</p>
      </aside>
    )
  }
  if (block.type === 'link')
    return (
      <p className="guide-link">
        <a href={resolveGuideHrefForLocale(block.href, locale)}>
          {text(block, locale)}
        </a>
      </p>
    )
  return null
}
