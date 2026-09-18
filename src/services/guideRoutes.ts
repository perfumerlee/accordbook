export type GuideRoute =
  | { kind: 'GUIDE_HOME' }
  | { kind: 'GUIDE_LOCALE_HOME'; locale: 'en' | 'ko' }
  | { kind: 'GUIDE_CHAPTER'; locale: 'en' | 'ko'; slug: string }
  | { kind: 'GUIDE_NOT_FOUND' }
  | { kind: 'NOT_GUIDE_ROUTE' }

const id = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function resolveGuideRoute(pathname: string): GuideRoute {
  if (pathname === '/guide' || pathname === '/guide/') {
    return { kind: 'GUIDE_HOME' }
  }

  const parts = pathname.replace(/\/$/, '').split('/')
  if (parts[1] !== 'guide') return { kind: 'NOT_GUIDE_ROUTE' }

  if (
    parts.length === 3 &&
    (parts[2] === 'en' || parts[2] === 'ko')
  ) {
    return { kind: 'GUIDE_LOCALE_HOME', locale: parts[2] }
  }

  if (
    parts.length === 4 &&
    (parts[2] === 'en' || parts[2] === 'ko') &&
    id.test(parts[3])
  ) {
    return {
      kind: 'GUIDE_CHAPTER',
      locale: parts[2],
      slug: parts[3],
    }
  }

  return { kind: 'GUIDE_NOT_FOUND' }
}

function splitHrefSuffix(href: string) {
  const index = href.search(/[?#]/)
  if (index < 0) return { path: href, suffix: '' }
  return { path: href.slice(0, index), suffix: href.slice(index) }
}

function parseLocalGuideHref(href: string) {
  const { path, suffix } = splitHrefSuffix(href)

  if (path === '/guide' || path === '/guide/') {
    return {
      kind: 'home' as const,
      trailingSlash: path.endsWith('/'),
      suffix,
    }
  }

  const match = path.match(
    /^\/guide\/(en|ko)(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?(\/?)$/,
  )
  if (!match) return undefined

  const slug = match[2]
  if (slug !== undefined && !id.test(slug)) return undefined

  return {
    kind: slug ? ('chapter' as const) : ('locale-home' as const),
    slug,
    trailingSlash: match[3] === '/',
    suffix,
  }
}

export function isLocalizableGuideHref(href: string) {
  return Boolean(parseLocalGuideHref(href))
}

export function resolveGuideHrefForLocale(
  href: string,
  locale: 'en' | 'ko',
) {
  const parsed = parseLocalGuideHref(href)
  if (!parsed) return href

  if (parsed.kind === 'home' || parsed.kind === 'locale-home') {
    const slash = parsed.trailingSlash ? '/' : ''
    return `/guide/${locale}${slash}${parsed.suffix}`
  }

  const slash = parsed.trailingSlash ? '/' : ''
  return `/guide/${locale}/${parsed.slug}${slash}${parsed.suffix}`
}
