import type { Experiment } from '../models/experiment'
import { getVariantChildren, getVariantParent } from './experimentGenealogy'
import { buildExperimentRail } from './experimentRail'
import { getDefaultComparisonVariantIds } from './experimentComparison'

export function buildComparisonFamilies(experiment: Experiment) {
  return buildExperimentRail(experiment).families
}

export function deriveExperimentNavigation(experiment: Experiment, selectedId: string) {
  const topLevel = experiment.variants.filter(variant => variant.parentVariantId === null)
  const selected = experiment.variants.find(variant => variant.variantId === selectedId)
  const parent = selected?.parentVariantId === null ? selected : selected ? getVariantParent(experiment, selected.variantId) : undefined
  const activeFamily = parent?.parentVariantId === null ? parent : undefined
  return { topLevel, activeFamily, children: activeFamily ? getVariantChildren(experiment, activeFamily.variantId) : [] }
}

export type ExperimentSelection = 'base' | { variantId: string }

export type ExperimentRailMode = 'navigation' | 'compare'
export type ExperimentCompareSession =
  | { mode: 'navigation'; committedIds: readonly string[]; draftIds: null }
  | { mode: 'compare'; committedIds: readonly string[]; draftIds: readonly string[] }

export const EXPERIMENT_COMPARE_LIMIT = 4

/** Keep valid membership and caller order; never add replacements or impose Sheet ordering. */
export function reconcileComparisonIds(experiment: Experiment, ids: readonly string[]): string[] {
  const valid = new Set(experiment.variants.map(variant => variant.variantId))
  return [...new Set(ids)].filter(id => id !== 'base' && valid.has(id))
}

/** New Experiment/Formula/List/Error Boundary session: first four array entries, as today. */
export function resetExperimentCompareSession(experiment: Experiment): ExperimentCompareSession {
  return { mode: 'navigation', committedIds: getDefaultComparisonVariantIds(experiment), draftIds: null }
}

/** Use after structural mutations; selected-but-deleted candidates must disappear from both lists. */
export function reconcileCompareSession(experiment: Experiment, session: ExperimentCompareSession): ExperimentCompareSession {
  const committedIds = reconcileComparisonIds(experiment, session.committedIds)
  return session.mode === 'compare'
    ? { mode: 'compare', committedIds, draftIds: reconcileComparisonIds(experiment, session.draftIds) }
    : { mode: 'navigation', committedIds, draftIds: null }
}

export function enterCompareMode(experiment: Experiment, session: ExperimentCompareSession): ExperimentCompareSession {
  const current = reconcileCompareSession(experiment, session)
  if (current.mode === 'compare') return current
  return { mode: 'compare', committedIds: current.committedIds, draftIds: [...current.committedIds] }
}

export function toggleComparisonDraft(experiment: Experiment, session: ExperimentCompareSession, candidateId: string): ExperimentCompareSession {
  const current = reconcileCompareSession(experiment, session)
  if (current.mode !== 'compare') return current
  const ids = current.draftIds
  if (ids.includes(candidateId)) return { ...current, draftIds: ids.filter(id => id !== candidateId) }
  if (ids.length >= EXPERIMENT_COMPARE_LIMIT || !reconcileComparisonIds(experiment, [candidateId]).length) return current
  return { ...current, draftIds: [...ids, candidateId] }
}

export function cancelCompareMode(experiment: Experiment, session: ExperimentCompareSession): ExperimentCompareSession {
  return { mode: 'navigation', committedIds: reconcileComparisonIds(experiment, session.committedIds), draftIds: null }
}

/** Matches the workspace opening gate, not the calculator (which also accepts BASE alone). */
export function canOpenExperimentSheet(experiment: Experiment, ids: readonly string[]): boolean {
  const count = reconcileComparisonIds(experiment, ids).length
  return count >= 1 && count <= EXPERIMENT_COMPARE_LIMIT
}

/** Returns null on invalid draft. Caller owns flush/open; apply this result only after flush succeeds. */
export function commitCompareDraft(experiment: Experiment, session: ExperimentCompareSession): ExperimentCompareSession | null {
  if (session.mode !== 'compare') return null
  const committedIds = reconcileComparisonIds(experiment, session.draftIds)
  return canOpenExperimentSheet(experiment, committedIds) ? { mode: 'navigation', committedIds, draftIds: null } : null
}

/** Sheet closure preserves the committed set and editing selection, owned separately by the workspace. */
export function closeExperimentSheetSession(experiment: Experiment, session: ExperimentCompareSession): ExperimentCompareSession {
  return cancelCompareMode(experiment, session)
}

export function reconcileExperimentSelection(experiment: Experiment, selection: ExperimentSelection): ExperimentSelection {
  if (selection === 'base') return 'base'
  return experiment.variants.some((variant) => variant.variantId === selection.variantId) ? selection : 'base'
}

export function selectionForListReentry(): ExperimentSelection {
  return 'base'
}

export function resolveSelectionAfterVariantDelete(experiment: Experiment, deletedVariantId: string): ExperimentSelection {
  const deleted = experiment.variants.find((variant) => variant.variantId === deletedVariantId)
  if (!deleted?.parentVariantId) return 'base'
  return experiment.variants.some((variant) => variant.variantId === deleted.parentVariantId)
    ? { variantId: deleted.parentVariantId }
    : 'base'
}

export function isLatestExperimentRevisionPersisted(localRevision: number, persistedRevision: number): boolean {
  return localRevision > 0 && persistedRevision >= localRevision
}
