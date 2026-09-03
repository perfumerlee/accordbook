import type { Formula } from '../models/formula'

const newest = (left: string | undefined, right: string | undefined) => (right ?? '').localeCompare(left ?? '')
export function sortNotebookFormulas(formulas: Formula[]): Formula[] { return [...formulas].sort((a, b) => newest(a.createdAt, b.createdAt) || a.id.localeCompare(b.id)) }
export function sortArchivedFormulas(formulas: Formula[]): Formula[] { return [...formulas].sort((a, b) => newest(a.archivedAt, b.archivedAt) || a.id.localeCompare(b.id)) }
