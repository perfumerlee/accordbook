import { useEffect, useRef, useState } from 'react'
import type { FormulaVersionSnapshot } from '../models/formula'
import { messages } from '../i18n/messages'
import { formatVersionCompositionForClipboard, getVersionComposition } from '../services/versionComposition'

export function VersionCompositionView({ snapshot, versionNumber, language }: {
  snapshot: FormulaVersionSnapshot
  versionNumber: number | null
  language: 'en' | 'ko'
}) {
  const t = messages[language]
  const materials = getVersionComposition(snapshot)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = async () => {
    const text = formatVersionCompositionForClipboard({ name: snapshot.name || t.compositionUntitled, versionNumber, materials, language })
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('failed')
    }
  }
  return <div className="tm-composition">
    <div className="tm-composition-heading"><h3>{snapshot.name || t.compositionUntitled}</h3><button className="tm-composition-copy" type="button" onClick={() => void copy()}>{copyState === 'copied' ? t.copied : t.copy}</button></div>
    <h4 id="tm-composition-title">{t.formulaComposition}</h4>
    <p className="tm-composition-meta">v{versionNumber} · {materials.length} {t.compositionMaterials}</p>
    <ul>{materials.map(material => <li key={material}>{material}</li>)}</ul>
    <p className="tm-composition-footer">{t.proportionsHidden}</p>
    <p className="tm-composition-copy-status" aria-live="polite">{copyState === 'failed' ? t.copyFailed : copyState === 'copied' ? t.copied : ''}</p>
  </div>
}
