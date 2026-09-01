import { useEffect, useRef, useState } from 'react'
import type { StarterFormulaTemplate } from '../data/starterFormulas'
import './FirstStartModal.css'

type Props = { language: 'en' | 'ko'; starters: StarterFormulaTemplate[]; onCreate: () => void; onImport: (file: File) => void; onStarter: (starter: StarterFormulaTemplate) => void; onClose: () => void; onLanguageChange: (language: 'en' | 'ko') => void }

export default function FirstStartModal({ language, starters, onCreate, onImport, onStarter, onClose, onLanguageChange }: Props) {
  const [view, setView] = useState<'welcome' | 'starters'>('welcome')
  const createRef = useRef<HTMLButtonElement>(null)
  const ko = language === 'ko'
  useEffect(() => { if (view === 'welcome') createRef.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey) }, [view, onClose])
  return <div className="first-start-backdrop"><section className="first-start-modal" role="dialog" aria-modal="true" aria-labelledby="first-start-title">
    <div className="first-start-top-actions"><div className="first-start-language" aria-label={ko ? '언어 선택' : 'Language selection'}><button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => onLanguageChange('en')}>EN</button><span aria-hidden="true">|</span><button type="button" className={language === 'ko' ? 'active' : ''} aria-pressed={language === 'ko'} onClick={() => onLanguageChange('ko')}>KO</button></div><button className="first-start-close" type="button" aria-label={ko ? '닫기' : 'Close'} onClick={onClose}>×</button></div>
    {view === 'welcome' ? <>
      <p className="first-start-kicker">Accordbook</p><h2 id="first-start-title">{ko ? 'Accordbook에 오신 것을 환영합니다.' : 'Welcome to Accordbook'}</h2><p className="first-start-subtitle">{ko ? '조향사를 위한 포뮬러 노트입니다.' : 'A formula notebook for perfumers.'}</p>
      <div className="first-start-options"><button ref={createRef} type="button" className="first-start-option first-start-primary" onClick={onCreate}><strong>{ko ? '새 포뮬러 만들기' : 'Create a new formula'}</strong><span>{ko ? '빈 포뮬러에서 시작합니다.' : 'Start from a blank formula.'}</span></button><label className="first-start-option" htmlFor="first-start-file"><strong>{ko ? '.accordbook 파일 열기' : 'Open .accordbook file'}</strong><span>{ko ? '받거나 다운로드한 포뮬러를 엽니다.' : 'Open a formula you received or downloaded.'}</span><input id="first-start-file" className="first-start-file" type="file" accept=".accordbook" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = '' }} /></label></div>
      <button type="button" className="first-start-starter-link" onClick={() => setView('starters')}>{ko ? '스타터 포뮬러 둘러보기 →' : 'Try a starter formula →'}</button>
    </> : <><p className="first-start-kicker">Accordbook</p><h2 id="first-start-title">{ko ? '스타터 포뮬러' : 'Starter formulas'}</h2><p className="first-start-subtitle">{ko ? '간단한 포뮬러로 Accordbook을 살펴보세요.' : 'Explore a simple formula and see how Accordbook works.'}</p><div className="first-start-list">{starters.map((starter, index) => <button key={starter.id} type="button" className="first-start-starter" onClick={() => onStarter(starter)}><span className="first-start-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{starter.title}</strong><small>{ko ? index === 0 ? '1,000파트 기본 흐름을 배워보세요.' : index === 1 ? '간단한 플로럴 구조를 살펴보세요.' : '우디 머스크 베이스를 살펴보세요.' : starter.description}</small></span><b>Open</b></button>)}</div><button type="button" className="first-start-back" onClick={() => setView('welcome')}>← {ko ? '뒤로' : 'Back'}</button></>}
    <p className="first-start-trust">{ko ? '기본적으로 비공개입니다. 포뮬러는 사용자의 기기에 저장됩니다.' : 'Private by default. Your formulas stay on your device.'}</p>
  </section></div>
}
