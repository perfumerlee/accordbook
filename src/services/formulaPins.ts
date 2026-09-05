const PINNED_FORMULA_IDS_KEY = 'accordbook.pinned-formula-ids'
export function loadPinnedFormulaIds(validIds?: Iterable<string>): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PINNED_FORMULA_IDS_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    const ids = parsed.filter((id): id is string => typeof id === 'string')
    if (!validIds) return ids
    const valid = new Set(validIds)
    const cleaned = ids.filter((id) => valid.has(id))
    if (cleaned.length !== ids.length) savePinnedFormulaIds(cleaned)
    return cleaned
  } catch { return [] }
}
export function savePinnedFormulaIds(ids: readonly string[]): void {
  localStorage.setItem(PINNED_FORMULA_IDS_KEY, JSON.stringify([...new Set(ids)]))
}
