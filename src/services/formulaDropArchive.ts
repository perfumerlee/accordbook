import type { PublicFormulaDrop } from './formulaDropPublicApi'

export type ArchiveDrop = { slug: string; title: string; subtitle?: string; summary?: string; description: string; publishedAt?: string; updatedAt?: string; expiresAt?: string }
const sources = import.meta.glob<ArchiveDrop>('../../public/formula-drops/*/drop.json', { eager: true, import: 'default' })
export function archiveDrops(): PublicFormulaDrop[] {
  return Object.values(sources).map(item => ({ dropId: 'DROP-' + item.slug, slug:item.slug, year:Number(item.slug.slice(0,4)), sequence:Number(item.slug.slice(5)), title:item.title, subtitle:item.subtitle || '', description:item.description, startAt:item.publishedAt || null, expiresAt:item.expiresAt || null, status:'EXPIRED' as const })).sort((a,b)=>b.slug.localeCompare(a.slug))
}
export function archivedDrop(id: string) { return archiveDrops().find(drop=>drop.dropId === id) }
// Archive content is durable; only a successful public API response can enable downloads.
export function mergeArchiveDrops(live: PublicFormulaDrop[]) {
  const all = new Map(archiveDrops().map(drop=>[drop.dropId,drop]))
  live.forEach(drop=>all.set(drop.dropId, drop))
  return [...all.values()].sort((a,b)=>b.slug.localeCompare(a.slug))
}
