import { useMemo, useRef, useState } from 'react'
import type { MaterialPaletteRecord } from '../models/materialPalette'
import type { MaterialPaletteRepository } from '../storage/materialPaletteRepository'
import { PALETTE_FIELDS, preparePalettePaste, reviewPalettePaste, type PaletteColumn, type PalettePasteMapping, type PalettePasteChoices } from '../services/palettePasteImport'
import type { FormulaPasteDilutionReviewChoice } from '../services/formulaPasteDilution'
import PaletteDialog from './PaletteDialog'

const labels = {
  en: { materialName: 'Material Name', alias: 'Alias', cas: 'CAS / Ref.', percent: 'Dilution %', solvent: 'Solvent', notes: 'Notes' },
  ko: { materialName: '원료명', alias: '별칭', cas: 'CAS / 참조', percent: '희석 %', solvent: '용매', notes: '노트' },
}
export default function PalettePasteImportDialog({ language, records, repository, onChanged, onClose }: {
  language: 'en' | 'ko'; records: MaterialPaletteRecord[]; repository: MaterialPaletteRepository; onChanged: () => Promise<void>; onClose: () => void
}) {
  const ko = language === 'ko', fields = labels[language]
  const [text, setText] = useState(''), [customMapping, setCustomMapping] = useState<PalettePasteMapping>()
  const [choices, setChoices] = useState<PalettePasteChoices>({}), [reviewing, setReviewing] = useState(false)
  const [currentRecords, setCurrentRecords] = useState(records), [busy, setBusy] = useState(false), [error, setError] = useState(''), [page, setPage] = useState(0)
  const inFlight = useRef(false)
  const source = useMemo(() => {
    if (!text.trim()) return { error: '' }
    try { return { data: preparePalettePaste(text), error: '' } }
    catch (failure) { return { error: failure instanceof Error ? failure.message : 'Invalid data' } }
  }, [text])
  const mapping = customMapping ?? source.data?.mapping
  const review = useMemo(() => {
    if (!source.data || !mapping) return { error: '' }
    try { return { data: reviewPalettePaste(source.data.rows, mapping, currentRecords, choices), error: '' } }
    catch (failure) { return { error: failure instanceof Error ? failure.message : 'Invalid mapping' } }
  }, [source, mapping, currentRecords, choices])
  const changeMapping = (next: PalettePasteMapping) => { setCustomMapping(next); setChoices({}); setError(''); setPage(0) }
  const close = () => { if (!inFlight.current) onClose() }
  const canSave = !!review.data?.rows.some(row => row.input && !row.duplicate) && !review.data.errors
  const save = async () => {
    if (inFlight.current || !source.data || !mapping || !canSave) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const latest = await repository.list()
      const finalReview = reviewPalettePaste(source.data.rows, mapping, latest, choices)
      if (finalReview.errors) throw Error(ko ? '오류를 확인해 주세요.' : 'Review the errors before saving.')
      if (JSON.stringify(finalReview.rows.map(row => row.duplicate)) !== JSON.stringify(review.data?.rows.map(row => row.duplicate))) {
        setCurrentRecords(latest)
        throw Error(ko ? '팔레트가 변경되어 중복 정보를 갱신했습니다. 확인 후 다시 적용해 주세요.' : 'The Palette changed. Review the updated duplicates and apply again.')
      }
      await repository.addAtomic(finalReview.rows.filter(row => row.input && !row.duplicate).map(row => row.input!))
      await onChanged(); onClose()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save / 저장하지 못했습니다.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const changeChoice = (row: number, choice: FormulaPasteDilutionReviewChoice) => { setChoices(current => ({ ...current, [row]: choice })); setError('') }
  return <PaletteDialog title={reviewing ? (ko ? '팔레트 가져오기 검토' : 'Palette import review') : (ko ? 'Excel에서 붙여넣기' : 'Paste from Excel')} wide onClose={close}>
    {!reviewing ? <>
      <p>{ko ? 'Excel 셀을 붙여넣고 각 열을 원료 정보 항목에 연결하세요. 헤더가 없는 표도 사용할 수 있습니다.' : 'Paste Excel cells, then connect each column to a Material details field. Tables without headers are supported.'}</p>
      <label className="palette-paste-field">{ko ? '스프레드시트 데이터' : 'Spreadsheet data'}<textarea autoFocus spellCheck={false} value={text} onChange={event => { setText(event.target.value); setCustomMapping(undefined); setChoices({}); setError(''); setPage(0) }} placeholder={`${ko ? '원료명\tCAS 번호' : 'Material name\tCAS Number'}\nBergamot\t8007-75-8\nBenzoin Resinoid @50% in DPG\t9000-72-0`} /></label>
      <p className="palette-meta">{ko ? '최대 10,000개 원료 · 텍스트 1 MiB. 원료명 열은 필수입니다.' : 'Up to 10,000 materials · 1 MiB of text. Material Name is required.'}</p>
      {source.data && mapping && <>
        <label className="palette-paste-check"><input type="checkbox" checked={mapping.header} onChange={event => changeMapping({ ...mapping, header: event.target.checked })} />{ko ? '첫 행을 헤더로 사용' : 'First row is a header'}</label>
        <p className="palette-meta">{ko ? '자동으로 연결된 항목도 확인해 주세요. 불필요한 열은 제외를 선택하세요.' : 'Check the suggested fields. Choose Exclude for columns you do not want to import.'}</p>
        <div className="palette-paste-mapping">{mapping.columns.map((target, column) => <label key={column}>
          <strong>{ko ? `${column + 1}열` : `Column ${column + 1}`}{mapping.header && ` · ${source.data!.rows[0][column] || '—'}`}</strong>
          <span className="palette-meta">{source.data!.rows.slice(mapping.header ? 1 : 0, mapping.header ? 4 : 3).map(row => row[column] || '—').join(' · ')}</span>
          <select aria-label={ko ? `${column + 1}열 연결` : `Map column ${column + 1}`} value={target} onChange={event => changeMapping({ ...mapping, columns: mapping.columns.map((value, index) => index === column ? event.target.value as PaletteColumn : value) })}>
            <option value="unmapped">{ko ? '항목 선택' : 'Select field'}</option><option value="ignore">{ko ? '제외' : 'Exclude'}</option>
            {PALETTE_FIELDS.map(field => <option key={field} value={field}>{fields[field]}{field === 'materialName' ? ' *' : ''}</option>)}
          </select>
        </label>)}</div>
      </>}
      {(source.error || review.error) && <p role="alert">{source.error || review.error}</p>}
    </> : <>
      <p>ADD NEW ONLY</p>
      <p>{ko ? '전체 / 유효 / 중복 / 경고 / 오류' : 'Total / Valid / Duplicates / Warnings / Errors'}: {review.data?.totalRows} / {review.data?.validRows} / {review.data?.duplicates} / {review.data?.warnings} / {review.data?.errors}</p>
      {!!review.data?.unsupportedColumns.length && <p>{ko ? '제외한 열' : 'Excluded columns'}: {review.data.unsupportedColumns.join(', ')}</p>}
      <p className="palette-meta">{ko ? '중복은 건너뜁니다. 희석 제안은 적용 또는 원문 유지를 선택해 주세요. 열이나 원문을 바꾸면 희석 선택이 초기화됩니다.' : 'Duplicates are skipped. Apply or keep each dilution proposal. Changing source data or columns resets dilution choices.'}</p>
      <div className="palette-preview-rows">{review.data?.rows.slice(page * 50, (page + 1) * 50).map(row => {
        const choice = choices[row.rowNumber], proposal = row.recognition.status === 'proposed' ? row.recognition : undefined
        const displayed = row.input ?? row.original
        return <article key={row.rowNumber} className="palette-paste-review-row">
          <strong>{row.rowNumber}: {displayed.materialName} — {row.status}</strong>
          <dl className="palette-paste-details">{PALETTE_FIELDS.map(field => {
            const value = field === 'percent' ? displayed.dilution?.percent : field === 'solvent' ? displayed.dilution?.solvent : displayed[field]
            return <div key={field}><dt>{fields[field]}</dt><dd>{value === undefined || value === '' ? '—' : String(value)}</dd></div>
          })}</dl>
          {proposal && <section className="palette-paste-dilution">
            <p>{ko ? '원문' : 'Original'}: {row.original.materialName}</p>
            <p>{ko ? '희석 제안' : 'Dilution proposal'}: {proposal.proposedMaterial} · {proposal.proposedPercent}% · {proposal.proposedSolvent || (ko ? '용매 입력 필요' : 'Solvent required')}</p>
            {row.conflict && <p className="palette-warning">{ko ? `열의 희석 정보(${row.original.dilution?.percent ?? '—'}% / ${row.original.dilution?.solvent || '—'})와 다릅니다. 희석 적용 시 아래 입력값으로 교체합니다. 원문 유지는 열의 값을 사용합니다.` : `The columns contain different dilution values (${row.original.dilution?.percent ?? '—'}% / ${row.original.dilution?.solvent || '—'}). Apply replaces them with the fields below; Keep Original uses the column values.`}</p>}
            <div className="palette-actions"><button className="btn" disabled={busy} aria-pressed={choice?.mode === 'apply'} onClick={() => changeChoice(row.rowNumber, { mode: 'apply', material: proposal.proposedMaterial, percentInput: String(proposal.proposedPercent), solventInput: proposal.proposedSolvent ?? '' })}>{ko ? '희석 적용' : 'Apply Dilution'}</button><button className="btn" disabled={busy} aria-pressed={choice?.mode === 'keep_original'} onClick={() => changeChoice(row.rowNumber, { mode: 'keep_original' })}>{ko ? '원문 유지' : 'Keep Original'}</button></div>
            {choice?.mode === 'apply' && <div className="palette-paste-mapping">
              <label>{fields.materialName}<input disabled={busy} value={choice.material} onChange={event => changeChoice(row.rowNumber, { ...choice, material: event.target.value })} /></label>
              <label>{fields.percent}<input disabled={busy} inputMode="decimal" value={choice.percentInput} onChange={event => changeChoice(row.rowNumber, { ...choice, percentInput: event.target.value })} /></label>
              <label>{fields.solvent}<input disabled={busy} value={choice.solventInput} onChange={event => changeChoice(row.rowNumber, { ...choice, solventInput: event.target.value })} /></label>
            </div>}
          </section>}
          {row.messages.map((message, index) => <p key={index} className={row.status === 'ERROR' ? 'palette-warning' : 'palette-meta'}>{message}</p>)}
        </article>
      })}</div>
      {(review.data?.totalRows ?? 0) > 50 && <div className="palette-actions"><button className="btn" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>{ko ? '이전' : 'Previous'}</button><span>{page + 1} / {Math.ceil((review.data?.totalRows ?? 0) / 50)}</span><button className="btn" disabled={busy || (page + 1) * 50 >= (review.data?.totalRows ?? 0)} onClick={() => setPage(page + 1)}>{ko ? '다음' : 'Next'}</button></div>}
    </>}
    {error && <p role="alert">{error}</p>}
    <div className="palette-actions palette-paste-footer">
      {reviewing && <button className="btn" disabled={busy} onClick={() => { setReviewing(false); setError('') }}>{ko ? '열 연결로 돌아가기' : 'Back to columns'}</button>}
      <button className="btn" disabled={busy} onClick={close}>{ko ? '취소' : 'Cancel'}</button>
      {reviewing ? <button className="btn primary" disabled={busy || !canSave} onClick={() => void save()}>{busy ? '…' : ko ? '새 원료 추가 적용' : 'Apply new materials'}</button> : <button className="btn primary" disabled={!review.data?.totalRows} onClick={() => setReviewing(true)}>{ko ? '가져오기 검토' : 'Review pasted rows'}</button>}
    </div>
  </PaletteDialog>
}
