import type { FormulaVersionSnapshot } from '../models/formula'
import { messages } from '../i18n/messages'
import { getVersionComposition } from '../services/versionComposition'

export function VersionCompositionView({ snapshot, versionNumber, language }: {
  snapshot: FormulaVersionSnapshot
  versionNumber: number | null
  language: 'en' | 'ko'
}) {
  const t = messages[language]
  const materials = getVersionComposition(snapshot)
  return <div className="tm-composition">
    <h3>{snapshot.name || t.compositionUntitled}</h3>
    <h4 id="tm-composition-title">{t.formulaComposition}</h4>
    <p className="tm-composition-meta">v{versionNumber} · {materials.length} {t.compositionMaterials}</p>
    <ul>{materials.map(material => <li key={material}>{material}</li>)}</ul>
    <p className="tm-composition-footer">{t.proportionsHidden}</p>
  </div>
}
