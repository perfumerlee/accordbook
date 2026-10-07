import type { Experiment } from './experiment'
import type { ExperimentCompareSession } from '../services/experimentWorkspaceState'

export type ExperimentCompareStateLabel = 'BASE' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5'
export interface ExperimentCompareFactRowV1 {
  readonly material: string
  readonly parts: number
  readonly cas?: string
  readonly dilution?: { readonly percent: number; readonly solvent: string }
}
export interface ExperimentCompareRequestV1 {
  readonly type: 'accordbook-ai-context'
  readonly version: 1
  readonly scope: 'experiment_compare'
  readonly locale: 'ko' | 'en'
  readonly base: { readonly label: 'BASE'; readonly totalParts: number; readonly rows: readonly ExperimentCompareFactRowV1[] }
  readonly variants: readonly { readonly label: Exclude<ExperimentCompareStateLabel, 'BASE'>; readonly totalParts: number; readonly rows: readonly ExperimentCompareFactRowV1[] }[]
  readonly deltas: readonly {
    readonly variantLabel: Exclude<ExperimentCompareStateLabel, 'BASE'>
    readonly baseTotalParts: number
    readonly variantTotalParts: number
    readonly totalDeltaParts: number
    readonly changes: readonly {
      readonly kind: 'added' | 'removed' | 'unchanged' | 'adjusted' | 'replacement' | 'identity-uncertain'
      readonly identityStatus: 'row-lineage' | 'heuristic-match' | 'unmatched' | 'ambiguous' | 'conflicting-cas' | 'replacement-on-lineage'
      readonly deltaParts: number
      readonly changedFields: readonly ('material' | 'cas' | 'parts' | 'dilution')[]
      readonly uncertaintyCodes: readonly string[]
      readonly before?: ExperimentCompareFactRowV1
      readonly after?: ExperimentCompareFactRowV1
    }[]
  }[]
}
export interface ExperimentCompareResultV1 {
  readonly summary: string
  readonly variants: readonly {
    readonly variantLabel: Exclude<ExperimentCompareStateLabel, 'BASE'>
    readonly hypothesis: string
    readonly uncertainties: readonly string[]
    readonly smellingChecks: readonly string[]
  }[]
  readonly overallUncertainties: readonly string[]
  readonly overallSmellingChecks: readonly string[]
}
/** Local execution metadata only; never serialized into an HTTP request. */
export interface ExperimentCompareExecutionMetadata {
  readonly variantIdsByLabel: Readonly<Record<string, string>>
  readonly experiment: Experiment
  readonly selection: ExperimentCompareSession
}
export interface ExperimentCompareExecutionResult {
  readonly result: ExperimentCompareResultV1
  readonly metadata: ExperimentCompareExecutionMetadata
}
