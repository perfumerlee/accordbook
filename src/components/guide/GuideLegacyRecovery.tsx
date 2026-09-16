import { useEffect, useState } from 'react'
import { guideDraftClient, upgradeLegacyGuideDraft, type GuideDraftEnvelope } from '../../services/guideDrafts'

export function GuideLegacyRecovery() {
  const [draft, setDraft] = useState<GuideDraftEnvelope>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const guideId = 'getting-started'

  const load = async () => {
    const result = await guideDraftClient.getDraft(guideId)
    if (result.ok && result.draft) setDraft(result.draft)
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 500); return () => window.clearTimeout(timer) }, [])

  if (import.meta.env.PROD || !draft || draft.formatVersion === 2) return null
  const recover = async () => {
    if (!window.confirm('Recover the verified historical published base for this legacy Draft? Your current Guide content will not be changed. A new Draft revision will be created.')) return
    setBusy(true); setMessage('RECOVERING HISTORICAL BASE…')
    const result = await upgradeLegacyGuideDraft(guideId, draft.revision, draft.basePublishedFingerprint)
    if (result.ok && result.draft) { setMessage(`BASE RECOVERED · Draft r${result.draft.revision}`); window.setTimeout(() => window.location.reload(), 300) }
    else { const code = result.ok ? '' : result.code; setBusy(false); setMessage(code === 'LEGACY_BASE_NOT_FOUND' || code === 'LEGACY_BASE_HISTORY_LIMIT' ? 'HISTORICAL BASE NOT FOUND · Current Draft was preserved.' : code === 'LEGACY_BASE_AMBIGUOUS' ? 'HISTORICAL BASE COULD NOT BE VERIFIED · Current Draft was preserved.' : code === 'REVISION_CONFLICT' ? 'REVISION CONFLICT · Current Draft was preserved.' : 'RECOVERY FAILED · Current Draft was preserved.') }
  }
  return <aside className="editor-warning"><b>LEGACY DRAFT · Historical base required before refresh.</b><button type="button" disabled={busy} onClick={() => void recover()}>{busy ? 'RECOVERING…' : 'RECOVER BASE'}</button>{message && <span role="status">{message}</span>}</aside>
}
