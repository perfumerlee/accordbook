import type { Formula, FormulaVersion } from '../models/formula'
import type { Experiment } from '../models/experiment'
import type { ExperimentAiReviewRecord } from '../models/aiReviewRecord'
import type { WorkspaceFile } from '../models/workspaceFile'
import { projectWorkspaceFile, validateWorkspaceFile } from './workspaceValidation'

export interface WorkspaceSource { formula: Formula; versions: FormulaVersion[]; experiments: Experiment[]; reviews?: ExperimentAiReviewRecord[] }
export function toWorkspaceFile(source: WorkspaceSource, exportedAt = new Date().toISOString()): WorkspaceFile {
  return projectWorkspaceFile({ type: 'accordbook-workspace', formatVersion: 2, exportedAt,
    formula: source.formula, versions: source.versions, experiments: source.experiments, reviews: source.reviews ?? [] })
}
export function serializeWorkspaceFile(file: WorkspaceFile): string { return JSON.stringify(validateWorkspaceFile(file)) }
