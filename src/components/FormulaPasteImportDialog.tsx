import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Formula } from '../models/formula'
import { formulaPasteIssueMessages, formulaPasteMessages, type Language } from '../i18n/messages'
import { detectFormulaPasteColumns, parseFormulaPaste, validateFormulaPaste, validateFormulaPasteEdits, type FormulaPasteEdits, type FormulaPasteIssue, type FormulaPasteMapping } from '../services/formulaPasteImport'
import { recognizeFormulaPasteDilution, validateFormulaPasteDilutionChoice, type DilutionRecognition, type FormulaPasteDilutionReviewChoice } from '../services/formulaPasteDilution'
import type { FormulaPasteCreationInput } from '../services/formulaPasteCreation'
import SolventInput from './SolventInput'
import './formulaPasteImport.css'

export default function FormulaPasteImportDialog({ language, onClose, onCreateFormula, returnFocusTo }: {
  language: Language; onClose: () => void; onCreateFormula: (input: FormulaPasteCreationInput) => Promise<Formula>; returnFocusTo?: HTMLElement | null
}) {
  const t = formulaPasteMessages[language]
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const dilutionMaterialInputs = useRef(new Map<number, HTMLInputElement>())
  const opener = useRef(returnFocusTo)
  const inFlight = useRef(false)
  const skipDialogCancel = useRef(false)
  const [step, setStep] = useState<'paste' | 'review'>('paste')
  const [rawText, setRawText] = useState('')
  const [selectedMapping, setSelectedMapping] = useState<FormulaPasteMapping>()
  const [edits, setEdits] = useState<FormulaPasteEdits>({})
  const [dilutionReviews, setDilutionReviews] = useState<Readonly<Record<number, FormulaPasteDilutionReviewChoice>>>({})
  const [name, setName] = useState(() => t.defaultName as string)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const parsed = useMemo(() => parseFormulaPaste(rawText), [rawText])
  const detected = useMemo(() => detectFormulaPasteColumns(parsed), [parsed])
  const mapping = selectedMapping ?? detected.mapping
  const base = useMemo(() => validateFormulaPaste(parsed, mapping), [parsed, mapping])
  const reviewed = useMemo(() => validateFormulaPasteEdits(parsed, mapping, edits), [parsed, mapping, edits])
  // Invalid cell values can be corrected in Review; structural input errors must be fixed first.
  const canReview = base.rows.length > 0 && !base.issues.some(item =>
    ['INPUT_EMPTY', 'INPUT_TOO_LARGE', 'TOO_MANY_ROWS', 'MALFORMED_QUOTING', 'MULTILINE_QUOTED_CELL', 'UNSUPPORTED_LINE_ENDING', 'COLUMN_MAPPING_REQUIRED', 'COLUMN_MAPPING_INVALID', 'UNMAPPED_NONEMPTY_COLUMN'].includes(item.code))
  const columns = Array.from({ length: parsed.columnCount }, (_, index) => index)
  const extraColumns = columns.filter(column => column !== mapping?.materialColumn && column !== mapping?.partsColumn && parsed.rows.some(row => row.cells[column]?.trim()))
  const partialTotal = reviewed.rows.some(row => row.issues.some(item => item.severity === 'error'))
  const unsafeTotal = reviewed.issues.some(item => item.code === 'TOTAL_UNSAFE_INTEGER')
  const dilutionApplyInvalid = reviewed.rows.some(row => {
    const choice = dilutionReviews[row.sourceRowNumber]
    if (choice?.mode !== 'apply') return false
    const currentMaterial = edits[row.sourceRowNumber]?.material ?? row.originalMaterial
    return validateFormulaPasteDilutionChoice(recognizeFormulaPasteDilution(currentMaterial), choice).status !== 'approved'
  })
  const format = (value: number) => value.toLocaleString(language === 'ko' ? 'ko-KR' : 'en-US')

  useEffect(() => {
    const element = dialog.current
    const previousFocus = opener.current ?? document.activeElement
    const htmlOverflow = document.documentElement.style.overflow
    const bodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    element?.showModal()
    heading.current?.focus({ preventScroll: true })
    return () => {
      element?.close()
      document.documentElement.style.overflow = htmlOverflow
      document.body.style.overflow = bodyOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => { heading.current?.focus({ preventScroll: true }); if (body.current) body.current.scrollTop = 0 }, [step])

  const changeSource = (text: string) => { setRawText(text); setSelectedMapping(undefined); setEdits({}); setDilutionReviews({}); setSubmitError(undefined) }
  const changeMapping = (next: FormulaPasteMapping) => {
    setSelectedMapping({ ...next, ignoredColumns: next.ignoredColumns?.filter(column => column !== next.materialColumn && column !== next.partsColumn) })
    setEdits({})
    setDilutionReviews({})
  }
  const currentMapping = (): FormulaPasteMapping => mapping ?? { materialColumn: -1, partsColumn: -1 }
  const changeRow = (sourceRow: number, field: 'material' | 'partsText', value: string) => {
    setEdits(current => ({ ...current, [sourceRow]: { ...current[sourceRow], [field]: value } }))
    if (field === 'material') setDilutionReviews(current => { const next = { ...current }; delete next[sourceRow]; return next })
  }
  const applyDilution = (sourceRow: number, recognition: Extract<DilutionRecognition, { status: 'proposed' }>) => {
    setDilutionReviews(current => ({
      ...current,
      [sourceRow]: current[sourceRow]?.mode === 'apply' ? current[sourceRow] : {
        mode: 'apply', material: recognition.proposedMaterial, percentInput: String(recognition.proposedPercent), solventInput: recognition.proposedSolvent ?? '',
      },
    }))
    requestAnimationFrame(() => dilutionMaterialInputs.current.get(sourceRow)?.focus())
  }
  const changeDilutionField = (sourceRow: number, field: 'material' | 'percentInput' | 'solventInput', value: string, recognition: Extract<DilutionRecognition, { status: 'proposed' }>) => setDilutionReviews(current => {
    const previous = current[sourceRow]
    const choice = previous?.mode === 'apply' ? previous : { mode: 'apply' as const, material: recognition.proposedMaterial, percentInput: String(recognition.proposedPercent), solventInput: recognition.proposedSolvent ?? '' }
    return { ...current, [sourceRow]: { ...choice, [field]: value } }
  })
  const dilutionErrorText = (code: string) => code === 'DILUTION_SOLVENT_REQUIRED' ? t.dilutionSolventRequired
    : code === 'DILUTION_INVALID_PERCENT' ? t.dilutionPercentInvalid
      : code === 'DILUTION_MATERIAL_REQUIRED' ? t.dilutionMaterialRequired : t.dilutionInvalid
  const handleSuggestionEscape = () => {
    skipDialogCancel.current = true
    window.setTimeout(() => { skipDialogCancel.current = false }, 0)
  }
  const issueText = (item: FormulaPasteIssue) => formulaPasteIssueMessages[language][item.code]
  const issueList = (items: FormulaPasteIssue[]) => <ul className="fp-issues">{items.map((item, index) => <li key={`${item.code}-${index}`} className={`fp-${item.severity}`}><strong>{item.severity === 'error' ? t.rowError : t.rowWarning}: </strong>{issueText(item)}</li>)}</ul>
  const globalIssues = (step === 'paste' ? base : reviewed).issues.filter(item => item.rowNumber === undefined || item.code === 'UNMAPPED_NONEMPTY_COLUMN')
  const uniqueGlobalIssues = globalIssues.filter((item, index) => globalIssues.findIndex(other => other.code === item.code) === index)
  const optionLabel = (column: number) => `${t.column(column + 1)}${parsed.rows[0]?.cells[column]?.trim() ? ` — ${parsed.rows[0].cells[column].trim().slice(0, 40)}` : ''}`
  const submit = async () => {
    if (inFlight.current || !mapping) return
    const finalParsed = parseFormulaPaste(rawText)
    const finalReview = validateFormulaPasteEdits(finalParsed, mapping, edits)
    if (!name.trim() || !finalReview.readyForApproval || finalReview.rows.some(row => row.parts === undefined || !row.material) || dilutionApplyInvalid) {
      setSubmitError(!name.trim() ? t.nameRequired : dilutionApplyInvalid ? t.dilutionReviewIncomplete : t.validationFailed)
      return
    }
    inFlight.current = true
    setSubmitting(true)
    setSubmitError(undefined)
    try {
      await onCreateFormula({ name, parsed: finalParsed, mapping, edits, dilutionReviews })
      onClose()
    } catch {
      setSubmitError(t.createFailed)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return createPortal(<dialog ref={dialog} className="formula-paste-dialog" lang={language} aria-busy={submitting} aria-labelledby={`${id}-title`} aria-describedby={`${id}-notice`} onCancel={event => { event.preventDefault(); if (skipDialogCancel.current) { skipDialogCancel.current = false; return } if (!inFlight.current) onClose() }}>
    <header className="fp-header">
      <p className="fp-kicker">{t.title}</p>
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>{step === 'paste' ? t.paste : t.review}</h2>
    </header>
    <div className="fp-body" ref={body}>
      {step === 'paste' ? <>
        <p>{t.instructions}</p>
        <label className="fp-field">{t.source}<textarea className="fp-source" value={rawText} onChange={event => changeSource(event.target.value)} spellCheck={false} aria-describedby={`${id}-limits`} placeholder={'Material\tParts\nBergamot FCF\t120\nHedione\t880'} /></label>
        <p className="fp-hint" id={`${id}-limits`}>{t.limits}</p>
        {parsed.rows.length > 0 && <>
          <p role="status">{base.mappingStatus === 'invalid' ? t.manualMapping : selectedMapping ? t.mappingReady : detected.status === 'detected' ? t.headerDetected : t.manualMapping}</p>
          <div className="fp-mapping">
            <label className="fp-field">{t.materialColumn}<select aria-label={t.materialColumn} value={mapping?.materialColumn ?? -1} onChange={event => changeMapping({ ...currentMapping(), materialColumn: Number(event.target.value) })}><option value={-1}>{t.selectColumn}</option>{columns.map(column => <option key={column} value={column} disabled={column === mapping?.partsColumn}>{optionLabel(column)}</option>)}</select></label>
            <label className="fp-field">{t.partsColumn}<select aria-label={t.partsColumn} value={mapping?.partsColumn ?? -1} onChange={event => changeMapping({ ...currentMapping(), partsColumn: Number(event.target.value) })}><option value={-1}>{t.selectColumn}</option>{columns.map(column => <option key={column} value={column} disabled={column === mapping?.materialColumn}>{optionLabel(column)}</option>)}</select></label>
          </div>
          <label className="fp-check"><input type="checkbox" checked={mapping?.headerRowNumber !== undefined} onChange={event => changeMapping({ ...currentMapping(), headerRowNumber: event.target.checked ? parsed.rows[0].sourceRowNumber : undefined })} />{t.headerRow}</label>
          {extraColumns.length > 0 && <fieldset className="fp-extra"><legend>{t.ignoredColumns}</legend><p className="fp-hint">{t.ignoredHint}</p>{extraColumns.map(column => <label className="fp-check" key={column}><input type="checkbox" checked={mapping?.ignoredColumns?.includes(column) ?? false} onChange={event => changeMapping({ ...currentMapping(), ignoredColumns: event.target.checked ? [...(mapping?.ignoredColumns ?? []), column] : (mapping?.ignoredColumns ?? []).filter(value => value !== column) })} /><span>{t.ignoreColumn(column + 1)}<small className="fp-preview">{optionLabel(column)}</small></span></label>)}</fieldset>}
          <p className="fp-hint">{t.remapHint}</p>
        </>}
        {rawText.length > 0 && uniqueGlobalIssues.length > 0 && issueList(uniqueGlobalIssues)}
      </> : <>
        <label className="fp-field">{t.formulaName}<input className="fp-name" value={name} onChange={event => { setName(event.target.value); setSubmitError(undefined) }} /></label>
        <p>{t.count(reviewed.rows.length)}</p>
        <div className="fp-rows">{reviewed.rows.map(row => {
          const rowId = `${id}-row-${row.sourceRowNumber}`
          const materialErrors = row.issues.filter(item => item.code === 'MATERIAL_EMPTY')
          const partsErrors = row.issues.filter(item => item.code.startsWith('PARTS_'))
          const currentMaterial = edits[row.sourceRowNumber]?.material ?? row.originalMaterial
          const recognition = recognizeFormulaPasteDilution(currentMaterial)
          const choice = dilutionReviews[row.sourceRowNumber]
          const dilutionValidation = validateFormulaPasteDilutionChoice(recognition, choice)
          const dilutionError = dilutionValidation.status === 'invalid' ? dilutionValidation.issueCode : undefined
          return <section className="fp-row" key={row.sourceRowNumber} aria-labelledby={`${rowId}-label`}>
            <h3 id={`${rowId}-label`}>{t.sourceRow(row.sourceRowNumber)}</h3>
            <div className="fp-row-fields">
              <label className="fp-field">{t.material}<input value={edits[row.sourceRowNumber]?.material ?? row.originalMaterial} onChange={event => changeRow(row.sourceRowNumber, 'material', event.target.value)} aria-invalid={materialErrors.length > 0} aria-describedby={row.issues.length ? `${rowId}-issues` : undefined} /></label>
              <label className="fp-field">{t.parts}<input type="text" inputMode="numeric" value={edits[row.sourceRowNumber]?.partsText ?? row.originalParts} onChange={event => changeRow(row.sourceRowNumber, 'partsText', event.target.value)} aria-invalid={partsErrors.length > 0} aria-describedby={row.issues.length ? `${rowId}-issues` : undefined} /></label>
            </div>
            {recognition.status === 'proposed' && <section className="fp-dilution" aria-label={t.reviewDilution}>
              <div className="fp-dilution-heading"><strong>{t.dilutionDetected(recognition.proposedPercent, recognition.proposedSolvent)}</strong><span>{t.reviewDilution}</span></div>
              <p><span>{t.originalMaterial}:</span> <bdi>{row.originalMaterial}</bdi></p>
              <p><span>{t.proposedMaterial}:</span> <bdi>{recognition.proposedMaterial}</bdi></p>
              <div className="fp-dilution-choices" role="group" aria-label={t.reviewDilution}>
                <button className="btn" type="button" aria-pressed={choice?.mode === 'apply'} onClick={() => applyDilution(row.sourceRowNumber, recognition)}>{t.applyDilution}</button>
                <button className="btn" type="button" aria-pressed={choice?.mode === 'keep_original'} onClick={() => setDilutionReviews(current => ({ ...current, [row.sourceRowNumber]: { mode: 'keep_original' } }))}>{t.keepOriginal}</button>
              </div>
              {choice?.mode === 'apply' && <div className="fp-dilution-fields">
                <label className="fp-field">{t.proposedMaterial}<input ref={element => { if (element) dilutionMaterialInputs.current.set(row.sourceRowNumber, element); else dilutionMaterialInputs.current.delete(row.sourceRowNumber) }} value={choice.material} onChange={event => changeDilutionField(row.sourceRowNumber, 'material', event.target.value, recognition)} aria-invalid={dilutionError === 'DILUTION_MATERIAL_REQUIRED'} aria-describedby={dilutionError === 'DILUTION_MATERIAL_REQUIRED' ? `${rowId}-dilution-error` : undefined} /></label>
                <label className="fp-field">{t.dilutionPercent}<input type="number" min="0" max="100" step="any" inputMode="decimal" value={choice.percentInput} onChange={event => changeDilutionField(row.sourceRowNumber, 'percentInput', event.target.value, recognition)} aria-invalid={dilutionError === 'DILUTION_INVALID_PERCENT'} aria-describedby={dilutionError === 'DILUTION_INVALID_PERCENT' ? `${rowId}-dilution-error` : undefined} /></label>
                <div className="fp-field"><label htmlFor={`${rowId}-solvent`}>{t.solvent}</label><SolventInput id={`${rowId}-solvent`} ariaLabel={t.solvent} value={choice.solventInput} onChange={value => changeDilutionField(row.sourceRowNumber, 'solventInput', value, recognition)} language={language} ariaInvalid={dilutionError === 'DILUTION_SOLVENT_REQUIRED'} ariaDescribedBy={dilutionError === 'DILUTION_SOLVENT_REQUIRED' ? `${rowId}-dilution-error` : undefined} onEscapeSuggestions={handleSuggestionEscape} /></div>
              </div>}
              {dilutionError && <p id={`${rowId}-dilution-error`} className="fp-dilution-error" role="alert">{dilutionErrorText(dilutionError)}</p>}
              {choice?.mode === 'keep_original' && <p className="fp-dilution-status" role="status" aria-live="polite">{t.dilutionKept}</p>}
              {!choice && <p className="fp-dilution-status" role="status" aria-live="polite">{t.dilutionPending}</p>}
            </section>}
            {recognition.status === 'ambiguous' && <p className="fp-dilution-warning" role="status">{t.dilutionAmbiguous}</p>}
            {recognition.status === 'invalid' && <p className="fp-dilution-warning" role="status">{recognition.issueCode === 'DILUTION_INVALID_PERCENT' ? t.dilutionInvalid : t.dilutionMaterialRequired}</p>}
            {row.issues.length > 0 && <div id={`${rowId}-issues`}>{issueList(row.issues)}</div>}
          </section>
        })}</div>
        <div className="fp-totals" role="status" aria-live="polite">
          <strong>{unsafeTotal ? formulaPasteIssueMessages[language].TOTAL_UNSAFE_INTEGER : `${partialTotal ? t.subtotal : t.total}: ${format(reviewed.totalParts)}${partialTotal ? '' : ' / 1,000'} parts`}</strong>
          {partialTotal && <p>{t.subtotalHint}</p>}
          {!partialTotal && !unsafeTotal && <p>{t.difference}: {reviewed.totalParts - reviewed.targetParts > 0 ? '+' : ''}{format(reviewed.totalParts - reviewed.targetParts)} parts</p>}
          <p>{reviewed.readyForApproval ? t.ready : t.needsReview}</p>
        </div>
        {uniqueGlobalIssues.length > 0 && issueList(uniqueGlobalIssues)}
        {dilutionApplyInvalid && <p className="fp-dilution-block-notice" role="status" aria-live="polite">{t.dilutionReviewIncomplete}</p>}
        {submitError && <p className="fp-submit-error" role="alert">{submitError}</p>}
      </>}
    </div>
    <footer className="fp-footer">
      <p id={`${id}-notice`}>{t.notice}</p>
      <div className="fp-actions">
        {step === 'review' && <button className="btn fp-back" type="button" disabled={submitting} onClick={() => setStep('paste')}>{t.back}</button>}
        <button className="btn" type="button" disabled={submitting} onClick={onClose}>{t.cancel}</button>
        {step === 'paste' && <button className="btn primary" type="button" disabled={!canReview} onClick={() => setStep('review')}>{t.reviewAction}</button>}
        {step === 'review' && <button className="btn primary" type="button" disabled={submitting || dilutionApplyInvalid || !reviewed.readyForApproval || !name.trim()} onClick={() => void submit()}>{submitting ? t.creating : t.createFormula}</button>}
      </div>
    </footer>
  </dialog>, document.body)
}
