import { useFormulaDropLanguage } from './FormulaDropLanguage'
import FormulaDropHeader from './FormulaDropHeader'
import { useEffect, useState, type ReactNode } from 'react'
import { listFormulaDrops, type PublicFormulaDrop } from '../services/formulaDropPublicApi'
import { archiveDrops, mergeArchiveDrops } from '../services/formulaDropArchive'
import { formatFormulaDropDate } from '../services/formulaDropDate'
import './formulaDropPage.css'
import '../styles/formula-drop.css'
export function selectFeaturedDrop(drops: PublicFormulaDrop[]): PublicFormulaDrop | undefined { return drops.find(drop => drop.status === 'ACTIVE') ?? drops[0] }
export default function FormulaDropIndexPage() {
  const t = useIndexCopy()
  const [drops, setDrops] = useState<PublicFormulaDrop[]>(); const [error, setError] = useState(false); const [archiveOnly,setArchiveOnly] = useState(false)
  const load = () => { setError(false); setArchiveOnly(false); void listFormulaDrops().then(value=>setDrops(mergeArchiveDrops(value))).catch(() => {const saved=archiveDrops();if(saved.length){setDrops(saved);setArchiveOnly(true)}else setError(true)}) }
  useEffect(() => { document.title = 'Formula Drops — Accordbook'; setMeta('Explore Formula Drops released for study, testing, and adaptation in Accordbook.', '/drop'); load() }, [])
  return <Shell><div className="formula-drop-intro"><span className="formula-drop-kicker">{t("Formula Drops")}</span><h1>{t("Formulas shared")}<br />{t("for perfumers.")}</h1><p>{t("Explore studies, accords and formulas, then continue working with them in Accordbook.")}</p>{drops && <span className="formula-drop-intro-meta">{drops.length} {t(drops.length === 1 ? '1 PUBLISHED DROP' : 'PUBLISHED DROPS')}</span>}</div>{archiveOnly&&<p role="status">{t("Showing the published archive. Live download availability could not be confirmed.")}</p>}<section aria-labelledby="latest-drops-heading" aria-busy={!drops && !error}>{error ? <><h2 id="latest-drops-heading" className="formula-drop-section-title">{t("Latest Drops")}</h2><State title={t("We couldn't load the Formula Drops.")} detail={t("Please try again.")} action={<button className="formula-drop-link" onClick={load}>{t("RETRY")}</button>} /></> : !drops ? <><h2 id="latest-drops-heading" className="formula-drop-section-title">{t("Latest Drops")}</h2><div className="formula-drop-loading-stage" role="status" aria-live="polite"><span className="formula-drop-kicker">{t("Opening the archive")}</span><p>{t("Loading published Formula Drops…")}</p><i aria-hidden="true" /></div></> : drops.length === 0 ? <><h2 id="latest-drops-heading" className="formula-drop-section-title">{t("Latest Drops")}</h2><State title={t("No Formula Drops yet.")} detail={t("New formulas will appear here.")} /></> : <><h2 id="latest-drops-heading" className="formula-drop-section-title formula-drop-index-heading">{t("Featured Drop")}</h2><div className="formula-drop-index"><FeaturedDrop drop={selectFeaturedDrop(drops)} />{drops.slice(1).map(drop => <DropRow drop={drop} key={drop.dropId} />)}</div></>}</section></Shell>
}
function FeaturedDrop({ drop }: { drop: PublicFormulaDrop | undefined }) { const t = useIndexCopy(); if (!drop) return null; return <a className="formula-drop-featured" href={'/drop/' + drop.slug} aria-labelledby="featured-drop-heading"><div className="formula-drop-featured-label"><span>{t("DROP")} {drop.slug}</span></div><div className="formula-drop-featured-body"><div><h2 id="featured-drop-heading">{drop.title}</h2>{drop.subtitle && <p>{t(drop.subtitle)}</p>}<Meta drop={drop} /></div><span className="formula-drop-view">{t("View Formula")} <span aria-hidden="true">→</span></span></div></a> }
function DropRow({ drop }: { drop: PublicFormulaDrop }) { const t = useIndexCopy(); return <a className="formula-drop-row" href={'/drop/' + drop.slug} aria-label={`${t('View Formula Drop')} ${drop.slug}: ${drop.title}`}><div className="formula-drop-row-number">{t("DROP")} {drop.slug}</div><div className="formula-drop-row-main"><span className="formula-drop-row-status">{t(drop.status === 'ACTIVE' ? 'Published' : 'Archive')}</span><h3>{drop.title}</h3>{drop.subtitle && <p>{t(drop.subtitle)}</p>}<Meta drop={drop} /></div><span className="formula-drop-view">{t("View")} <span aria-hidden="true">→</span></span></a> }
function Meta({ drop }: { drop: PublicFormulaDrop }) { const t = useIndexCopy(); return <span className="formula-drop-meta">{drop.status === 'ACTIVE' && drop.expiresAt ? t('Available until') + ' ' + formatFormulaDropDate(drop.expiresAt) : t('Published Formula')}</span> }
function Shell({ children }: { children: ReactNode }) { const t = useIndexCopy(); return <main className="formula-drop-page"><div className="formula-drop-shell"><FormulaDropHeader />{children}<footer className="formula-drop-footer"><span>{t("An open-source formula notebook for perfumers.")}</span><a href="https://accordbook.org">accordbook.org</a></footer></div></main> }
function State({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) { return <div className="formula-drop-state"><h3>{title}</h3>{detail && <p>{detail}</p>}{action}</div> }
function setMeta(description: string, canonical: string) { let el = document.querySelector<HTMLMetaElement>('meta[name="description"]'); if (!el) { el = document.createElement('meta'); el.name = 'description'; document.head.appendChild(el) }; el.content = description; let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]'); if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link) }; link.href = 'https://accordbook.org' + canonical }


const indexKo: Record<string, string> = {
  "Formula Drops": "Formula Drop",
  "Formulas shared": "조향사를 위한",
  "for perfumers.": "포뮬러 공유.",
  "Explore studies, accords and formulas, then continue working with them in Accordbook.": "스터디와 어코드, 포뮬러를 살펴보고 Accordbook에서 작업을 이어가세요.",
  "Showing the published archive. Live download availability could not be confirmed.": "공개 아카이브를 표시합니다. 현재 다운로드 가능 여부를 확인할 수 없습니다.",
  "Latest Drops": "최근 Drop",
  "We couldn't load the Formula Drops.": "Formula Drop을 불러올 수 없습니다.",
  "Please try again.": "다시 시도해주세요.",
  "RETRY": "다시 시도",
  "Opening the archive": "아카이브 여는 중",
  "Loading published Formula Drops…": "공개된 Formula Drop을 불러오는 중…",
  "No Formula Drops yet.": "아직 공개된 Formula Drop이 없습니다.",
  "New formulas will appear here.": "새 포뮬러가 여기에 표시됩니다.",
  "Featured Drop": "추천 Drop",
  "DROP": "DROP",
  "No.": "번호",
  "View Formula": "포뮬러 보기",
  "View": "보기",
  "View Formula Drop": "포뮬러 Drop 보기",
  "An open-source formula notebook for perfumers.": "조향사를 위한 오픈소스 포뮬러 노트입니다.",
  "A simplified study of McIntosh Apple, focusing on its core fruity character.": "McIntosh Apple의 핵심 과일 향에 집중한 단순화 스터디입니다.",
  "1 PUBLISHED DROP": "1개의 공개 DROP",
  "PUBLISHED DROP": "공개된 Drop",
  "PUBLISHED DROPS": "공개된 Drop",
  "Published": "공개됨",
  "Archive": "아카이브",
  "Available until": "이용 가능 기간",
  "Published Formula": "공개된 포뮬러"
}
function useIndexCopy() { const { language } = useFormulaDropLanguage(); return (text: string) => language === 'ko' ? indexKo[text] ?? text : text }
