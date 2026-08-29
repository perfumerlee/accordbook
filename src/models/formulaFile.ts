import type { Formula } from './formula'

export interface FormulaFileMaterial { parts: number | ''; material: string; cas?: string; marked?: boolean; dilution?: Formula['rows'][number]['dilution'] }
export interface FormulaFile { type: 'accordbook-formula'; formatVersion: 1; exportedAt: string; formula: { name: string; notes: string; rows: FormulaFileMaterial[] } }

export function toFormulaFile(formula: Formula): FormulaFile { return { type: 'accordbook-formula', formatVersion: 1, exportedAt: new Date().toISOString(), formula: { name: formula.name, notes: formula.notes, rows: formula.rows.map(({ id, ...row }) => ({ ...row })) } } }
