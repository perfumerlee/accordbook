import type { Experiment, ExperimentVariant } from '../models/experiment'

const order = (variants: ExperimentVariant[]) => variants.map((variant, index) => ({ variant, index })).sort((a, b) => a.variant.createdAt.localeCompare(b.variant.createdAt) || a.index - b.index).map(({ variant }) => variant)

export function getVariantChildren(experiment: Experiment, parentVariantId: string): ExperimentVariant[] {
  return order(experiment.variants.filter((variant) => variant.parentVariantId === parentVariantId))
}

export function getVariantParent(experiment: Experiment, variantId: string): ExperimentVariant | undefined {
  const variant = experiment.variants.find((item) => item.variantId === variantId)
  return variant?.parentVariantId ? experiment.variants.find((item) => item.variantId === variant.parentVariantId) : undefined
}

export function getVariantAncestors(experiment: Experiment, variantId: string): ExperimentVariant[] {
  const result: ExperimentVariant[] = []
  const visited = new Set<string>()
  let current = experiment.variants.find((variant) => variant.variantId === variantId)
  while (current?.parentVariantId) {
    if (visited.has(current.variantId)) break
    visited.add(current.variantId)
    const parent = experiment.variants.find((variant) => variant.variantId === current!.parentVariantId)
    if (!parent || visited.has(parent.variantId)) break
    result.unshift(parent)
    current = parent
  }
  return result
}

export function getVariantSiblings(experiment: Experiment, variantId: string): ExperimentVariant[] {
  const variant = experiment.variants.find((item) => item.variantId === variantId)
  if (!variant) return []
  return order(experiment.variants.filter((item) => item.variantId !== variantId && item.parentVariantId === variant.parentVariantId))
}

export function getVariantDepth(experiment: Experiment, variantId: string): number {
  const variant = experiment.variants.find((item) => item.variantId === variantId)
  if (!variant) return -1
  let depth = 1
  const visited = new Set<string>([variantId])
  let parentId = variant.parentVariantId
  while (parentId) {
    if (visited.has(parentId)) return -1
    visited.add(parentId)
    const parent = experiment.variants.find((item) => item.variantId === parentId)
    if (!parent) return -1
    depth += 1
    parentId = parent.parentVariantId
  }
  return depth
}

export function canCreateBranchFrom(experiment: Experiment, variantId: string): boolean {
  return getVariantDepth(experiment, variantId) === 1
}

export type VariantTreeNode = { variant: ExperimentVariant; children: VariantTreeNode[] }
export function buildVariantTree(experiment: Experiment): VariantTreeNode[] {
  const build = (variant: ExperimentVariant, path: Set<string>): VariantTreeNode => {
    if (path.has(variant.variantId)) return { variant, children: [] }
    const nextPath = new Set(path).add(variant.variantId)
    return { variant, children: getVariantChildren(experiment, variant.variantId).map((child) => build(child, nextPath)) }
  }
  return order(experiment.variants.filter((variant) => variant.parentVariantId === null)).map((variant) => build(variant, new Set()))
}
