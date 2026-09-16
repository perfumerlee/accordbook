import type { GuideBlock, GuideDocument } from '../models/guide'
import { validateGuideDocument } from './guideContracts'

export type GuideMergeConflictKind = 'field-edit' | 'delete-edit' | 'edit-delete' | 'add-add' | 'order'
export type GuideMergeConflict = { conflictId: string; kind: GuideMergeConflictKind; blockId?: string; fieldPath?: string; baseValue?: unknown; localValue?: unknown; remoteValue?: unknown }
export type GuideMergeResult = { document: GuideDocument | null; conflicts: GuideMergeConflict[] }
type Missing = { __missing: true }
const MISSING: Missing = { __missing: true }
const isMissing = (value: unknown): value is Missing => value === MISSING
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function equal(a: unknown, b: unknown): boolean { if (a === b) return true; if (a === undefined || b === undefined || a === null || b === null) return false; if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i])); if (typeof a === 'object' && typeof b === 'object') { const ak = Object.keys(a as object).sort(); const bk = Object.keys(b as object).sort(); return ak.length === bk.length && ak.every((key, i) => key === bk[i] && equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])); } return false }
function conflict(kind: GuideMergeConflictKind, path: string, base: unknown, local: unknown, remote: unknown, blockId?: string): GuideMergeConflict { return { conflictId: `${kind}:${path}`, kind, blockId, fieldPath: path, ...(isMissing(base) ? {} : { baseValue: clone(base) }), ...(isMissing(local) ? {} : { localValue: clone(local) }), ...(isMissing(remote) ? {} : { remoteValue: clone(remote) }) } }
function mergeValue(base: unknown, local: unknown, remote: unknown, path: string, conflicts: GuideMergeConflict[], blockId?: string): unknown {
  if (equal(local, remote)) return clone(local)
  if (equal(local, base)) return clone(remote)
  if (equal(remote, base)) return clone(local)
  if (!isMissing(base) && !isMissing(local) && !isMissing(remote) && [base, local, remote].every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    const keys = [...new Set([...Object.keys(base as object), ...Object.keys(local as object), ...Object.keys(remote as object)])].sort()
    const result: Record<string, unknown> = {}
    for (const key of keys) { const value = mergeValue((base as Record<string, unknown>)[key] ?? MISSING, (local as Record<string, unknown>)[key] ?? MISSING, (remote as Record<string, unknown>)[key] ?? MISSING, `${path}.${key}`, conflicts, blockId); if (!isMissing(value)) result[key] = value }
    return result
  }
  conflicts.push(conflict('field-edit', path, base, local, remote, blockId)); return clone(local)
}
function blockMap(blocks: GuideBlock[]): Map<string, GuideBlock> { return new Map(blocks.map(block => [block.blockId, block])) }
function insertionGap(order: string[], id: string, baseOrder: string[]): number { const index = order.indexOf(id); const before = order.slice(0, index).filter(x => baseOrder.includes(x)); return before.length }
function mergeBlocks(base: GuideBlock[], local: GuideBlock[], remote: GuideBlock[], conflicts: GuideMergeConflict[]): GuideBlock[] {
  const bm = blockMap(base), lm = blockMap(local), rm = blockMap(remote), ids = [...new Set([...base, ...local, ...remote].map(b => b.blockId))]
  const merged = new Map<string, GuideBlock>()
  for (const id of ids) {
    const b = bm.get(id) ?? MISSING, l = lm.get(id) ?? MISSING, r = rm.get(id) ?? MISSING
    if (isMissing(b)) { if (isMissing(l)) { if (!isMissing(r)) merged.set(id, clone(r)) } else if (isMissing(r)) merged.set(id, clone(l)); else if (equal(l, r)) merged.set(id, clone(l)); else { conflicts.push(conflict('add-add', `blocks.${id}`, b, l, r, id)); merged.set(id, clone(l)) } continue }
    if (isMissing(l) && isMissing(r)) continue
    if (isMissing(l)) { if (equal(r, b)) continue; conflicts.push(conflict('delete-edit', `blocks.${id}`, b, l, r, id)); continue }
    if (isMissing(r)) { if (equal(l, b)) continue; conflicts.push(conflict('edit-delete', `blocks.${id}`, b, l, r, id)); merged.set(id, clone(l)); continue }
    merged.set(id, mergeValue(b, l, r, `blocks.${id}`, conflicts, id) as GuideBlock)
  }
  const baseOrder = base.map(b => b.blockId), lo = local.map(b => b.blockId), ro = remote.map(b => b.blockId)
  const localChanged = !equal(lo, baseOrder), remoteChanged = !equal(ro, baseOrder)
  let order = baseOrder.filter(id => merged.has(id))
  if (localChanged && !remoteChanged) order = lo.filter(id => merged.has(id))
  else if (!localChanged && remoteChanged) order = ro.filter(id => merged.has(id))
  else if (localChanged && remoteChanged) {
    if (equal(lo, ro)) order = lo.filter(id => merged.has(id))
    else { conflicts.push(conflict('order', 'blocks.order', baseOrder, lo, ro)); order = lo.filter(id => merged.has(id)) }
  }
  const allInserted = [...new Set([...lo, ...ro].filter(id => !baseOrder.includes(id) && merged.has(id)))]
  for (const id of allInserted) if (!order.includes(id)) { const source = lo.includes(id) ? lo : ro; const gap = insertionGap(source, id, baseOrder); const at = Math.min(gap, order.length); order.splice(at, 0, id) }
  const localOnly = lo.filter(id => !baseOrder.includes(id) && !ro.includes(id)), remoteOnly = ro.filter(id => !baseOrder.includes(id) && !lo.includes(id))
  for (const id of localOnly) if (remoteOnly.some(other => insertionGap(lo, id, baseOrder) === insertionGap(ro, other, baseOrder))) conflicts.push(conflict('order', `blocks.order.insert.${id}`, baseOrder, lo, ro, id))
  return order.map(id => merged.get(id)!).filter(Boolean)
}

export function mergeGuideDocuments(input: { base: GuideDocument; local: GuideDocument; remote: GuideDocument }): GuideMergeResult {
  const conflicts: GuideMergeConflict[] = []
  const base = clone(input.base), local = clone(input.local), remote = clone(input.remote)
  const { blocks: baseBlocks, ...baseMeta } = base
  const { blocks: localBlocks, ...localMeta } = local
  const { blocks: remoteBlocks, ...remoteMeta } = remote
  const merged = mergeValue(baseMeta, localMeta, remoteMeta, 'document', conflicts) as GuideDocument
  merged.blocks = mergeBlocks(baseBlocks, localBlocks, remoteBlocks, conflicts)
  conflicts.sort((a, b) => a.conflictId.localeCompare(b.conflictId))
  if (!conflicts.length && !validateGuideDocument(merged).ok) return { document: null, conflicts: [conflict('field-edit', 'document', base, local, remote)] }
  return { document: conflicts.length ? merged : merged, conflicts }
}
