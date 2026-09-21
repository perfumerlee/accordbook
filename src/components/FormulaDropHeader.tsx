import { useState } from 'react'
import { DROP_LANGUAGE_HINT_SESSION_KEY } from '../i18n/language'
import { useFormulaDropLanguage } from './FormulaDropLanguage'

export default function FormulaDropHeader() {
  const { language, setLanguage } = useFormulaDropLanguage()
  const [hintVisible, setHintVisible] = useState(() => window.sessionStorage.getItem(DROP_LANGUAGE_HINT_SESSION_KEY) !== '1')
  const chooseLanguage = (value: 'en' | 'ko') => { setLanguage(value); setHintVisible(false); window.sessionStorage.setItem(DROP_LANGUAGE_HINT_SESSION_KEY, '1') }
  return <header className="formula-drop-header">
    <a className="formula-drop-brand" href="/">Accordbook</a>
    <div className="formula-drop-header-actions">
      <a className="formula-drop-nav" href="/">{language === 'ko' ? 'Accordbook 열기' : 'Open Accordbook'} <span aria-hidden="true">→</span></a>
      <div className="formula-drop-language-control">
        {hintVisible && <span className="formula-drop-language-hint" role="status" lang={language === 'ko' ? 'ko' : 'en'}>{language === 'ko' ? '언어를 바꿀 수 있어요' : 'Change language here'}</span>}
        <div className="formula-drop-language-switch" role="group" aria-label="Language / 언어">
          {(['en', 'ko'] as const).map(value => <button key={value} type="button" aria-label={value === 'en' ? 'English' : '한국어'} aria-pressed={language === value} className={language === value ? 'active' : ''} onClick={() => chooseLanguage(value)}>{value.toUpperCase()}</button>)}
        </div>
      </div>
    </div>
  </header>
}
