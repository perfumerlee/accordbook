import type { Experiment, ExperimentVariant } from '../models/experiment'
import { getVariantAncestors, getVariantChildren, getVariantDepth } from './experimentGenealogy'

export type ExperimentRailFamily = { parent: ExperimentVariant; children: ExperimentVariant[] }
export type ExperimentRailModel = {
  baseIncluded: true
  families: ExperimentRailFamily[]
  additionalLegacyCandidates: ExperimentVariant[]
}

/** Shared visual order for both modes. Sheet output order is a separate contract. */
export function buildExperimentRail(experiment: Experiment): ExperimentRailModel {
  const families = experiment.variants.filter(variant => variant.parentVariantId === null)
    .map(parent => ({ parent, children: getVariantChildren(experiment, parent.variantId) }))
  const represented = new Set(families.flatMap(family => [family.parent, ...family.children]).map(variant => variant.variantId))
  return {
    baseIncluded: true,
    families,
    additionalLegacyCandidates: experiment.variants.filter(variant => !represented.has(variant.variantId)),
  }
}

/** Deep legacy nodes retain their root context without being promoted to direct children. */
export function deriveActiveRailFamily(experiment: Experiment, selectedId: string): ExperimentVariant | null {
  if (selectedId === 'base' || getVariantDepth(experiment, selectedId) < 1) return null
  const selected = experiment.variants.find(variant => variant.variantId === selectedId)!
  return selected.parentVariantId === null ? selected : getVariantAncestors(experiment, selectedId)[0] ?? null
}

export function getRailComparisonCandidateIds(model: ExperimentRailModel): string[] {
  return [...model.families.flatMap(family => [family.parent, ...family.children]), ...model.additionalLegacyCandidates]
    .map(variant => variant.variantId)
}
