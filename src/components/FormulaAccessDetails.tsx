import { useState } from 'react'
import type { FormulaDropDownload } from '../services/formulaDropPublicApi'
import { formatFormulaDropAccessDetails } from '../services/formulaDropAccess'
import './formulaDropPage.css'
import { useFormulaDropLanguage } from './FormulaDropLanguage'
export default function FormulaAccessDetails({ download }: { download: FormulaDropDownload }) {
  const [copied, setCopied] = useState(false); const { language } = useFormulaDropLanguage(); const ko = language === 'ko'
  if (!download.accessPin || !download.accessName || !download.accessLast4) return null
  const copy = async () => { try { await navigator.clipboard.writeText(formatFormulaDropAccessDetails(download as Required<FormulaDropDownload>)); setCopied(true) } catch { setCopied(false) } }
  return <section className="formula-access-details" aria-labelledby="access-details-heading"><h3 id="access-details-heading">{ko ? '접근 정보' : 'ACCESS DETAILS'}</h3><dl><dt>{ko ? '이름' : 'NAME'}</dt><dd>{download.accessName}</dd><dt>{ko ? '끝 4자리' : 'LAST 4 DIGITS'}</dt><dd>{download.accessLast4}</dd><dt>PIN</dt><dd>{download.accessPin}</dd></dl><button type="button" className="formula-access-copy" aria-label={ko ? '접근 정보 복사' : 'Copy access details'} onClick={() => void copy()}>{ko ? '접근 정보 복사' : 'COPY ACCESS DETAILS'}</button><span className="formula-access-feedback" aria-live="polite">{copied ? (ko ? '접근 정보가 복사되었습니다.' : 'ACCESS DETAILS COPIED') : ''}</span></section>
}
