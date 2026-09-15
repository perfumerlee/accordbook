import { useState } from 'react'
import { checkGuideAtomicPublishProtocol } from '../../services/guideDrafts'

export default function GuidePublishProtocolCheck() {
  const [state, setState] = useState<'NOT CHECKED' | 'CHECKING…' | 'READY' | 'OUTDATED' | 'FAILED'>('NOT CHECKED')
  if (!import.meta.env.DEV) return null
  const check = async () => {
    setState('CHECKING…')
    const result = await checkGuideAtomicPublishProtocol()
    setState(result.ok ? 'READY' : result.code === 'ASSET_PUBLISH_NOT_DEPLOYED' ? 'OUTDATED' : 'FAILED')
  }
  return <section aria-label="Atomic publish protocol check"><strong>ATOMIC PUBLISH PROTOCOL</strong><button type="button" onClick={() => void check()} disabled={state === 'CHECKING…'}>CHECK PUBLISH PROTOCOL</button><span>{state === 'READY' ? 'ATOMIC PUBLISH PROTOCOL v1 · READY' : state === 'OUTDATED' ? 'SERVER DEPLOYMENT OUTDATED' : state === 'FAILED' ? 'CHECK FAILED' : state}</span></section>
}
