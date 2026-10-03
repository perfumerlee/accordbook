type Props = {
  message: string
  error?: boolean
  busy?: boolean
  leaving?: boolean
  language: 'en' | 'ko'
  onDismiss: () => void
}

export default function WorkspaceFeedback({ message, error, busy, leaving, language, onDismiss }: Props) {
  return <div className={`workspace-feedback-slot${leaving ? ' is-leaving' : ''}`}>
    <div className="workspace-feedback-clip">
      <div className={`workspace-feedback${busy ? ' is-busy' : ''}`}>
        <span className="workspace-feedback-icon" aria-hidden="true">
          {busy ? <span className="workspace-feedback-spinner" /> : error ? '!' : <svg viewBox="0 0 16 16" fill="none"><path d="m4 8 2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </span>
        <span className="workspace-feedback-message" role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'} aria-atomic="true">{message}</span>
        {!busy && <button className="workspace-feedback-dismiss" type="button" aria-label={language === 'ko' ? '알림 닫기' : 'Dismiss notification'} onClick={onDismiss}>×</button>}
      </div>
    </div>
  </div>
}
