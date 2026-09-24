import type { ClaimedSource } from '../models/formula'

// Compatibility for the shipped free Drop fixture. Preserve all user-written notes.
export function normalizeFormulaDropOrigin(source: ClaimedSource): ClaimedSource {
  if (source.originType !== 'reference'
    || source.title !== 'Formula Drop · DROP-2026-001'
    || source.note !== 'Free Formula Drop package; source fixture: public/formula-drops/2026-001/source.json') return source
  return { ...source, note: 'A public Formula Drop reference.' }
}
