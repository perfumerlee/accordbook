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

export function isLocalizableGuideHref(href: string) {
  if (href === '/guide' || href === '/guide/') return true

  const match = href.match(
    /^\/guide\/(en|ko)(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?\/?$/,
  )
  if (!match) return false

  const slug = match[2]
  return slug === undefined || id.test(slug)
}

export function resolveGuideHrefForLocale(
  href: string,
  locale: 'en' | 'ko',
) {
  if (href === '/guide' || href === '/guide/') {
    return `/guide/${locale}/`
  }

  const match = href.match(
    /^\/guide\/(?:en|ko)(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?\/?$/,
  )
  if (!match) return href

  const slug = match[1]
  return slug ? `/guide/${locale}/${slug}/` : `/guide/${locale}/`
}
