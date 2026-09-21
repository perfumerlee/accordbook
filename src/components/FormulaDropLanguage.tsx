import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Language } from '../i18n/messages'
import { initialDropLanguage, DROP_LANGUAGE_SESSION_KEY, DROP_LANGUAGE_STORAGE_KEY } from '../i18n/language'
import './formulaDropLanguage.css'

const copy: Record<string, string> = {
  '← All Drops': '← 모든 Drop', 'Drop No.': 'Drop 번호', Status: '상태', Archive: '보관 아카이브', Active: '진행 중', Expired: '종료됨', 'Available until': '이용 가능 기간', 'Published archive': '공개 아카이브', 'This drop has ended': '이 Drop은 종료되었습니다', 'DOWNLOAD THIS FORMULA': '이 포뮬러 다운로드', 'Take the formula with you.': '포뮬러를 가져가세요.', 'Get the .accordbook file and continue working with it in Accordbook.': '.accordbook 파일을 받아 Accordbook에서 계속 작업하세요.', 'PREPARING…': '준비 중…', 'DOWNLOAD FORMULA FILE': '포뮬러 다운로드', '.ACCORDBOOK FILE': '.ACCORDBOOK 파일', 'AVAILABLE UNTIL': '이용 가능 기간', 'Formula Composition': '포뮬러 구성', 'The public composition is not available for this Drop.': '이 Drop의 공개 구성은 제공되지 않습니다.', Notes: '노트', 'Download Formula': '포뮬러 다운로드', 'Download the .accordbook file. Then open Accordbook and choose “Open .accordbook file” to continue.': '.accordbook 파일을 다운로드한 뒤 Accordbook을 열고 “.accordbook 파일 열기”를 선택해 계속하세요.', 'How to open an .accordbook file →': '.accordbook 파일 여는 방법 →', 'Download availability could not be confirmed. The public archive remains available.': '다운로드 가능 여부를 확인할 수 없습니다. 공개 아카이브는 계속 이용할 수 있습니다.', 'This Formula Drop is no longer available for download.': '이 Formula Drop은 더 이상 다운로드할 수 없습니다.', 'LOCAL COPY SAVED ·': '로컬 사본 저장 완료 ·', 'LOCAL COPY ALREADY SAVED ·': '로컬 사본이 이미 저장됨 ·', 'FORMULA DOWNLOAD STARTED': '포뮬러 다운로드 시작', 'DOWNLOADED FILE': '다운로드한 파일', 'FORMULA AVAILABLE': '포뮬러 이용 가능', DOWNLOAD: '다운로드', 'An open-source formula notebook for perfumers.': '조향사를 위한 오픈소스 포뮬러 노트입니다.', 'Open Accordbook': 'Accordbook 열기', 'BACK TO FORMULA DROPS': 'Formula Drop 목록으로 돌아가기', "This Drop couldn't be opened.": '이 Drop을 열 수 없습니다.', "This Drop isn't available.": '이 Drop을 이용할 수 없습니다.', 'Opening Formula Drop': 'Formula Drop 여는 중', 'Loading the published formula…': '공개된 포뮬러를 불러오는 중…', 'The Formula could not be prepared right now. Please try again.': '포뮬러를 지금 준비할 수 없습니다. 다시 시도해주세요.', 'This Formula Drop has ended.': '이 Formula Drop은 종료되었습니다.', 'LOCAL VAULT PERMISSION REQUIRED ·': '로컬 보관함 권한 필요 ·', 'MANAGE FORMULA VAULT': '포뮬러 보관함 관리', 'LOCAL COPY FAILED — STANDARD DOWNLOAD USED': '로컬 사본 저장 실패 — 일반 다운로드를 사용했습니다.'
}
copy['PREPARING...'] = '준비 중…'
const reverseCopy = Object.fromEntries(Object.entries(copy).map(([en, ko]) => [ko, en]))
export const formulaDropCopy = copy
function translateDropText(root: HTMLElement, language: Language) {
  const table = language === 'ko' ? copy : reverseCopy
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []; let node: Node | null
  while ((node = walker.nextNode())) nodes.push(node as Text)
  nodes.forEach(text => { const value = text.nodeValue ?? ''; const trimmed = value.trim(); const dynamic = language === 'ko' ? (trimmed.startsWith('No.') ? `번호${trimmed.slice(3)}` : trimmed.startsWith('Available until ') ? `이용 가능 기간 ${trimmed.slice(16)}` : trimmed.startsWith('View Formula') ? `포뮬러 보기${trimmed.slice('View Formula'.length)}` : trimmed.startsWith('View') ? `보기${trimmed.slice('View'.length)}` : undefined) : undefined; const translated = table[trimmed] ?? dynamic ?? (language === 'ko' && /^PREPARING(?:…|\.\.\.)$/.test(trimmed) ? '준비 중…' : undefined); if (translated) text.nodeValue = value.replace(trimmed, translated) })
}

type DropLanguageContextValue = { language: Language; setLanguage: (language: Language) => void }
const DropLanguageContext = createContext<DropLanguageContextValue | null>(null)
export function useFormulaDropLanguage() { return useContext(DropLanguageContext) ?? { language: initialDropLanguage(), setLanguage: (_language: Language) => undefined } }
export function FormulaDropLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => initialDropLanguage())
  const setLanguage = (next: Language) => { setLanguageState(next); window.localStorage.setItem(DROP_LANGUAGE_STORAGE_KEY, next); window.sessionStorage.setItem(DROP_LANGUAGE_SESSION_KEY, next) }
  useEffect(() => { window.sessionStorage.setItem(DROP_LANGUAGE_SESSION_KEY, language) }, [language])
  const value = useMemo(() => ({ language, setLanguage }), [language])
  useEffect(() => { const root = document.querySelector<HTMLElement>('.formula-drop-language-scope'); if (!root) return; const apply = () => translateDropText(root, language); const observer = new MutationObserver(apply); apply(); observer.observe(root, { childList: true, subtree: true }); return () => observer.disconnect() }, [language])
  return <DropLanguageContext.Provider value={value}><div className={`formula-drop-language-scope ${language === 'ko' ? 'is-ko' : 'is-en'}`}>{children}</div></DropLanguageContext.Provider>
}
