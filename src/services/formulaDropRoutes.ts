export type AccordbookRoute = { kind: 'root' } | { kind: 'drop-index' } | { kind: 'drop-detail'; dropId: string; slug: string } | { kind: 'unknown' }
export function resolveAccordbookRoute(pathname: string): AccordbookRoute {
  if (pathname === '/') return { kind: 'root' }
  if (pathname === '/drop' || pathname === '/drop/') return { kind: 'drop-index' }
  const match = /^\/drop\/(\d{4}-\d{3})\/$/.exec(pathname) ?? /^\/drop\/(\d{4}-\d{3})$/.exec(pathname)
  if (match) return { kind: 'drop-detail', slug: match[1], dropId: `DROP-${match[1]}` }
  return { kind: 'unknown' }
}
