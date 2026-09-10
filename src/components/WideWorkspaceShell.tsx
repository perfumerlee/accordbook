import type { ReactNode } from 'react'
import './wideWorkspaceShell.css'

type Props = {
  eyebrow?: string
  formulaId: string
  formulaName?: string
  context?: string
  closeLabel: string
  onClose: () => void
  headerActions?: ReactNode
  children: ReactNode
  className?: string
}

export default function WideWorkspaceShell({
  eyebrow,
  formulaId,
  formulaName,
  context,
  closeLabel,
  onClose,
  headerActions,
  children,
  className = '',
}: Props) {
  return (
    <main className={`wide-workspace ${className}`.trim()}>
      <div className="wide-workspace__frame">
        <header className="wide-workspace__header">
          <div className="wide-workspace__identity">
            {eyebrow && <div className="wide-workspace__eyebrow">{eyebrow}</div>}
            <h1 className="wide-workspace__formula-id">{formulaId}</h1>
            {formulaName && <div className="wide-workspace__formula-name">{formulaName}</div>}
            {context && <div className="wide-workspace__context">{context}</div>}
          </div>
          <div className="wide-workspace__header-actions">{headerActions}<button className="wide-workspace__close" type="button" aria-label={closeLabel} onClick={onClose}>×</button></div>
        </header>
        <div className="wide-workspace__rule" />
        <div className="wide-workspace__content">{children}</div>
      </div>
    </main>
  )
}
