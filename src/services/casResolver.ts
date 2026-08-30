import resolverIndex from '../data/resolver_index.json'

export const TGSC_RESOLVER_VERSION = '0.01'
export const TGSC_RESOLVER_SNAPSHOT_DATE = '2026-08-30'

export type ResolverCandidate = { id: string; name: string; cas?: string | null }
export type ResolverResult =
  | { status: 'resolved'; candidates: [ResolverCandidate] }
  | { status: 'ambiguous'; candidates: ResolverCandidate[] }
  | { status: 'not_found'; candidates: [] }
  | { status: 'invalid'; candidates: [] }

export function normalizeMaterialName(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase().replace(/[®™©]/g, '').replace(/[^a-z0-9]/g, '')
}

export function resolveCas(name: string): ResolverResult {
  const key = normalizeMaterialName(name)
  if (!key) return { status: 'invalid', candidates: [] }
  const candidates = (resolverIndex as Record<string, ResolverCandidate[]>)[key] ?? []
  if (candidates.length === 0) return { status: 'not_found', candidates: [] }
  if (candidates.length === 1) return { status: 'resolved', candidates: candidates as [ResolverCandidate] }
  return { status: 'ambiguous', candidates }
}
