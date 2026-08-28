import { useEffect, useState } from 'react'
import type { Formula, FormulaMaterial } from '../models/formula'
import { calculateFormulaTotals, calculatePercent } from '../services/formulaCalculator'
import { isSolventMaterial } from '../services/solventClassifier'
import type { AutosaveStatus } from '../storage/storageService'

interface FormulaEditorProps {
  formula: Formula
  autosaveStatus: AutosaveStatus
  onChange: (formula: Formula) => void
}

const emptyRow = (): FormulaMaterial => ({ id: crypto.randomUUID(), parts: '', material: '' })
const displayNumber = (value: number, digits = 2) => value.toFixed(digits)

export function FormulaEditor({ formula, autosaveStatus, onChange }: FormulaEditorProps) {
  const totals = calculateFormulaTotals(formula.rows)
  const update = (changes: Partial<Formula>) => onChange({ ...formula, ...changes, updatedAt: new Date().toISOString() })
  const updateRow = (id: string, changes: Partial<FormulaMaterial>) =>
    update({ rows: formula.rows.map((row) => row.id === id ? { ...row, ...changes } : row) })
  const removeRow = (id: string) => update({ rows: formula.rows.filter((row) => row.id !== id) })

  return (
    <section className="editor-content">
      <header className="formula-header">
        <div className="title-block">
          <label className="section-label" htmlFor="formula-name">Formula</label>
          <input id="formula-name" className="formula-name" value={formula.name} placeholder="Untitled formula" onChange={(event) => update({ name: event.target.value })} />
        </div>
        <div className="header-meta">
          <div><span>FORMULA ID</span><strong>{formula.formulaId}</strong></div>
          <div><span>DATE</span><strong>{formula.date.replace(/-/g, ' / ')}</strong></div>
          <span className={`autosave-status ${autosaveStatus}`}>{autosaveStatus === 'saving' ? 'Saving…' : autosaveStatus === 'saved-locally' ? 'Saved locally' : 'Session only'}</span>
        </div>
      </header>

      <div className="formula-table" role="table" aria-label="Formula materials">
        <div className="formula-table-header" role="row"><span>Parts</span><span>Material</span><span>CAS / Ref.</span><span>Percent</span><span>Actions</span></div>
        {formula.rows.map((row) => <FormulaRow key={row.id} row={row} onChange={updateRow} onRemove={removeRow} />)}
      </div>
      <button className="add-row" type="button" onClick={() => update({ rows: [...formula.rows, emptyRow()] })}>+ Add material</button>

      <section className="total-panel">
        <h3>Total</h3>
        <div className="total-grid">
          <span>Formula</span><strong>{totals.totalParts.toLocaleString()} / 1,000</strong>
          <span>Batch</span><strong>{displayNumber(totals.batchWeightGrams)} g</strong>
          <span>Concentrate</span><strong>{displayNumber(totals.concentratePercent)}%</strong>
          <span>Solvent</span><strong>{displayNumber(totals.solventPercent)}% · {displayNumber(totals.batchWeightGrams * totals.solventPercent / 100)} g</strong>
        </div>
        <p className={totals.complete ? 'complete' : 'incomplete'}>{totals.complete ? 'Complete' : totals.differenceParts > 0 ? `Add ${totals.differenceParts} more parts.` : `Reduce by ${Math.abs(totals.differenceParts)} parts.`}</p>
      </section>

      <section className="notes-section">
        <label className="section-label" htmlFor="formula-notes">Notes</label>
        <textarea id="formula-notes" value={formula.notes} placeholder="Lab notes…" onChange={(event) => update({ notes: event.target.value })} />
      </section>
    </section>
  )
}

function FormulaRow({ row, onChange, onRemove }: { row: FormulaMaterial; onChange: (id: string, changes: Partial<FormulaMaterial>) => void; onRemove: (id: string) => void }) {
  const [dilutionOpen, setDilutionOpen] = useState(false)
  const dilution = row.dilution
  const notation = dilution?.enabled ? `@${dilution.percent}% in ${dilution.solvent || 'ALC'}` : ''
  const setDilution = (changes: Partial<NonNullable<FormulaMaterial['dilution']>>) => onChange(row.id, { dilution: { enabled: true, percent: 10, solvent: 'ALC', ...dilution, ...changes } })

  return <div className="formula-row-wrap">
    <div className={`formula-row ${row.marked ? 'marked' : ''}`} role="row">
      <input aria-label="Parts" type="number" min="0" step="1" value={row.parts} onChange={(event) => onChange(row.id, { parts: event.target.value === '' ? '' : Math.max(0, Math.trunc(Number(event.target.value))) })} />
      <div className="material-cell"><div className="material-line"><input aria-label="Material" value={row.material} placeholder="Material" onChange={(event) => onChange(row.id, { material: event.target.value })} />{isSolventMaterial(row.material) && <span className="solvent-badge">SOLVENT</span>}</div>{notation && <span className="dilution-notation">{notation}</span>}</div>
      <input className="cas-input" aria-label="CAS / Ref." value={row.cas ?? ''} placeholder="CAS / Ref." onChange={(event) => onChange(row.id, { cas: event.target.value })} />
      <output>{calculatePercent(row.parts).toFixed(1)}%</output>
      <div className="row-actions"><button type="button" className={dilution ? 'action active' : 'action'} onClick={() => setDilutionOpen(!dilutionOpen)}>DIL</button><button type="button" className={row.marked ? 'action active' : 'action'} aria-label="Highlight row" onClick={() => onChange(row.id, { marked: !row.marked })}>Mark</button><button type="button" className="action remove" aria-label="Remove row" onClick={() => onRemove(row.id)}>×</button></div>
    </div>
    {dilutionOpen && <div className="dilution-editor"><label>Strength <input type="number" min="0" max="100" step="1" value={dilution?.percent ?? 10} onChange={(event) => setDilution({ percent: Math.max(0, Math.min(100, Number(event.target.value))) })} />%</label><label>Solvent / carrier <input value={dilution?.solvent ?? 'ALC'} onChange={(event) => setDilution({ solvent: event.target.value })} /></label><button type="button" onClick={() => { onChange(row.id, { dilution: undefined }); setDilutionOpen(false) }}>Remove dilution</button></div>}
  </div>
}
