import { calculateTotalParts } from '../services/formulaCalculator'
import { useState } from 'react'
import type { FormulaVersion } from '../models/formula'
import { messages, type Language } from '../i18n/messages'
import { calculateScaledBatch, formatBatchWeight, isScaleBatchEligible } from '../services/scaleBatch'
import { batchInput, changeBatchUnit, fromCanonicalGrams } from '../services/batchUnits'

export function ScaleBatchView({ version, language }: { version?: FormulaVersion; language: Language }) {
  const [input, setInput] = useState(() => batchInput())
  const t = messages[language]
  const rows = version?.snapshot?.rows
  const available = Array.isArray(rows)
  const totalParts = available ? calculateTotalParts(rows.map(row => ({ ...row, id: row.rowId }))) : null
  const eligible = available && isScaleBatchEligible(rows)
  const unavailable = !version ? t.batchSelectVersion : !available ? t.batchUnavailable : !eligible ? t.batchIncomplete : undefined
  const invalid = input.amount !== '' && (input.canonicalGrams === null || input.canonicalGrams <= 0)
  const result = eligible && input.canonicalGrams !== null ? calculateScaledBatch(rows, input.canonicalGrams) : null
  return <div className="tm-batch">
    <h2 id="tm-batch-title">{t.scaleBatch}</h2>
    {version && <div className="tm-version-meta"><span>{t.batchSelectedVersion}: {version.kind === 'manual' ? `v${version.versionNumber}` : t.batchRestorePoint}</span><time>{new Date(version.createdAt).toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')}</time></div>}
    {totalParts !== null && eligible && <p className="tm-batch-helper tm-batch-source-total">{t.total}: {totalParts.toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')} / 1,000 parts</p>}
    {totalParts !== null && !eligible && <div id="tm-batch-unavailable" className="tm-batch-status-card" role="status" aria-live="polite"><div className="tm-batch-status-heading"><strong>{language === 'ko' ? '포뮬러 미완성' : 'FORMULA INCOMPLETE'}</strong><span>{totalParts.toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')} / 1,000 parts</span></div><div className="tm-batch-progress" role="progressbar" aria-label={language === 'ko' ? '포뮬러 완성도' : 'Formula completion'} aria-valuemin={0} aria-valuemax={1000} aria-valuenow={Math.min(Math.max(totalParts, 0), 1000)}><span style={{ width: `${Math.min(Math.max(totalParts, 0), 1000) / 10}%` }} /></div><p className="tm-batch-status-shortage">{totalParts < 1000 ? t.addParts(1000 - totalParts) : t.reduceParts(totalParts - 1000)}</p><p>{unavailable}</p><p>{t.batchCompleteNewVersion}</p></div>}
    {totalParts === null && unavailable && <p id="tm-batch-unavailable" className="tm-batch-helper" role="status">{unavailable}</p>}
    <label className="tm-batch-label" htmlFor="tm-batch-amount">{t.batchAmount}</label>
    <div className="tm-batch-input"><input id="tm-batch-amount" type="number" inputMode="decimal" step="any" disabled={!eligible} value={input.amount} aria-invalid={eligible && invalid} aria-describedby={unavailable ? 'tm-batch-unavailable' : invalid ? 'tm-batch-error' : undefined} onChange={event => setInput(batchInput(event.target.value, input.unit))} /><div className="tm-batch-units" role="group" aria-label={t.batchUnit}>{(['g', 'kg'] as const).map(unit => <button key={unit} type="button" aria-pressed={input.unit === unit} disabled={!eligible} onClick={() => setInput(current => changeBatchUnit(current, unit))}>{unit}</button>)}</div></div>
    {eligible && invalid && <p id="tm-batch-error" className="tm-batch-helper">{t.batchInvalid}</p>}
    {result && <table className="tm-batch-table"><thead><tr><th scope="col">{t.batchMaterial}</th><th scope="col">{t.batchWeight}</th></tr></thead><tbody>{result.rows.map(row => <tr key={row.sourceRowId} data-row-id={row.sourceRowId}><td>{row.material || t.batchUnnamed}{row.dilution?.enabled && <small> @{row.dilution.percent}% in {row.dilution.solvent || 'ALC'}</small>}</td><td>{formatBatchWeight(row.grams, language)} g</td></tr>)}</tbody><tfoot><tr><th scope="row">{t.total}</th><td>{formatBatchWeight(fromCanonicalGrams(result.totalGrams, input.unit), language)} {input.unit}</td></tr></tfoot></table>}
    <div className="tm-batch-helper"><p>{t.batchReadOnly}</p><p>{t.batchScope}</p></div>
  </div>
}
