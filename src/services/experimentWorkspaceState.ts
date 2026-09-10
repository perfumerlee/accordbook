import type { Experiment } from '../models/experiment'

export type ExperimentSelection = 'base' | { variantId: string }

export function reconcileExperimentSelection(experiment: Experiment, selection: ExperimentSelection): ExperimentSelection {
  if (selection === 'base') return 'base'
  return experiment.variants.some((variant) => variant.variantId === selection.variantId) ? selection : 'base'
}

export function selectionForListReentry(): ExperimentSelection {
  return 'base'
}

export function isLatestExperimentRevisionPersisted(localRevision: number, persistedRevision: number): boolean {
  return localRevision > 0 && persistedRevision >= localRevision
}
