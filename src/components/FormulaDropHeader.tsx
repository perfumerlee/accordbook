import { useFormulaDropLanguage } from './FormulaDropLanguage'

export default function FormulaDropHeader() {
  const { language, setLanguage } = useFormulaDropLanguage()
  return <header className="formula-drop-header">
    <a className="formula-drop-brand" href="/">Accordbook</a>
    <div className="formula-drop-header-actions">
      <a className="formula-drop-nav" href="/">{language === 'ko' ? 'Accordbook 열기' : 'Open Accordbook'} <span aria-hidden="true">→</span></a>
      <div className="formula-drop-language-switch" role="group" aria-label="Language / 언어">
        {(['en', 'ko'] as const).map(value => <button key={value} type="button" aria-label={value === 'en' ? 'English' : '한국어'} aria-pressed={language === value} className={language === value ? 'active' : ''} onClick={() => setLanguage(value)}>{value.toUpperCase()}</button>)}
      </div>
    </div>
  </header>
}
