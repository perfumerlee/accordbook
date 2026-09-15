import { useEffect, useState } from 'react'
import type { GuideDocument } from '../../models/guide'
import { checkPublicationAssets } from '../../services/guidePublicationAssets'

export function usePublicationAssetBlocker(document: GuideDocument | undefined) {
  const [result, setResult] = useState<{ document?: GuideDocument; reason?: string; message?: string }>({})
  useEffect(() => {
    let active = true
    const refresh = () => { if (document) void checkPublicationAssets(document).then(check => { if (active) setResult({ document, reason: check.reason, message: !check.reason && 'stagedCount' in check && check.stagedCount ? `${check.stagedCount} STAGED ASSETS · Will publish atomically` : undefined }) }) }
    refresh()
    window.addEventListener('guide-publication-complete', refresh)
    return () => { active = false; window.removeEventListener('guide-publication-complete', refresh) }
  }, [document])
  return !document ? {} : result.document !== document ? { reason: 'Checking referenced assets…' } : result
}
