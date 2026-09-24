import type { Experiment, ExperimentVariant } from '../models/experiment'
import { getVariantAncestors, getVariantChildren, getVariantDepth, getVariantPath } from './experimentGenealogy'

export type ExperimentRailFamily = { parent: ExperimentVariant; children: ExperimentVariant[] }
export type ExperimentRailCandidate = { variant: ExperimentVariant; path: ExperimentVariant[] }
export type ExperimentRailBranchNode = ExperimentRailCandidate & { children: ExperimentRailBranchNode[] }
export type ExperimentRailDeepGroup = { parent: ExperimentVariant | null; roots: ExperimentRailBranchNode[] }
export type ExperimentRailModel = {
  baseIncluded: true
  families: ExperimentRailFamily[]
  deepGroups: ExperimentRailDeepGroup[]
  deepCandidates: ExperimentRailCandidate[]
}

/** Shared visual order for both modes. Sheet output order is a separate contract. */
export function buildExperimentRail(experiment: Experiment): ExperimentRailModel {
  const families = experiment.variants.filter(variant => variant.parentVariantId === null)
    .map(parent => ({ parent, children: getVariantChildren(experiment, parent.variantId) }))
  const represented = new Set(families.flatMap(family => [family.parent, ...family.children]).map(variant => variant.variantId))
  const candidates = experiment.variants.filter(variant => !represented.has(variant.variantId)).map(variant => ({
    variant,
    path: getVariantPath(experiment, variant.variantId),
  }))
  const candidateIds = new Set(candidates.map(candidate => candidate.variant.variantId))
  const groupedIds = new Set<string>()
  const buildNode = (variant: ExperimentVariant, path: ExperimentVariant[]): ExperimentRailBranchNode => {
    groupedIds.add(variant.variantId)
    const nextPath = [...path, variant]
    const children = getVariantChildren(experiment, variant.variantId)
      .filter(child => candidateIds.has(child.variantId) && getVariantDepth(experiment, child.variantId) > 2)
      .map(child => buildNode(child, nextPath))
    return { variant, path: nextPath, children }
  }
  const deepGroups: ExperimentRailDeepGroup[] = []
  for (const family of families) {
    for (const parent of family.children) {
      const roots = getVariantChildren(experiment, parent.variantId)
        .filter(child => candidateIds.has(child.variantId) && getVariantDepth(experiment, child.variantId) > 2)
        .map(child => buildNode(child, getVariantPath(experiment, parent.variantId)))
      if (roots.length) deepGroups.push({ parent, roots })
    }
  }
  const looseCandidates = candidates.filter(candidate => !groupedIds.has(candidate.variant.variantId))
    .sort((left, right) => left.variant.createdAt.localeCompare(right.variant.createdAt))
  if (looseCandidates.length) deepGroups.push({ parent: null, roots: looseCandidates.map(candidate => ({ ...candidate, children: [] })) })
  const deepCandidates = deepGroups.flatMap(group => {
    const flatten = (node: ExperimentRailBranchNode): ExperimentRailCandidate[] => [
      { variant: node.variant, path: node.path }, ...node.children.flatMap(flatten),
    ]
    return group.roots.flatMap(flatten)
  })
  return {
    baseIncluded: true,
    families,
    deepGroups,
    deepCandidates,
  }
}

/** Deep legacy nodes retain their root context without being promoted to direct children. */
export function deriveActiveRailFamily(experiment: Experiment, selectedId: string): ExperimentVariant | null {
  if (selectedId === 'base' || getVariantDepth(experiment, selectedId) < 1) return null
  const selected = experiment.variants.find(variant => variant.variantId === selectedId)!
  return selected.parentVariantId === null ? selected : getVariantAncestors(experiment, selectedId)[0] ?? null
}

export function getRailComparisonCandidateIds(model: ExperimentRailModel): string[] {
  return [...model.families.flatMap(family => [family.parent, ...family.children]), ...model.deepCandidates.map(candidate => candidate.variant)]
    .map(variant => variant.variantId)
}
