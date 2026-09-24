import type { EvaluationBranchPurpose, EvaluationVerdict } from '../models/experiment'

// This decision applies to this evaluation, not the entire Variant.
export function evaluationBranchPurpose(verdict: EvaluationVerdict): EvaluationBranchPurpose | undefined {
  switch (verdict) {
    case 'continue': return 'development'
    case 'hold': return 'check'
    case 'uncertain': return 'comparison'
    case 'stop': return undefined
  }
}
