// UI consent revision is intentionally separate from the backend protocol field.
// Existing v1 records remain untouched and cannot satisfy this revised disclosure.
export const AI_DISCLOSURE_VERSION = 2
export const AI_DISCLOSURE_KEY = 'accordbook.ai.disclosure.v2'
type Metadata = { disclosureVersion: number; acceptedAt: string }
let memory: Metadata | undefined
function storage(): Storage | undefined { try { return globalThis.localStorage } catch { return undefined } }
export function hasAiDisclosure(): boolean {
  try {
    const raw = storage()?.getItem(AI_DISCLOSURE_KEY)
    if (raw) {
      let value: any
      try { value = JSON.parse(raw) } catch { memory = undefined; return false }
      const valid = value && Object.keys(value).length === 2 && value.disclosureVersion === AI_DISCLOSURE_VERSION &&
        typeof value.acceptedAt === 'string' && Number.isFinite(Date.parse(value.acceptedAt)) && new Date(value.acceptedAt).toISOString() === value.acceptedAt
      if (!valid) { memory = undefined; return false }
      memory = value
    }
  } catch { /* Unavailable storage uses only the in-memory acceptance. */ }
  return memory?.disclosureVersion === AI_DISCLOSURE_VERSION
}
export function acceptAiDisclosure(): void {
  memory = { disclosureVersion: AI_DISCLOSURE_VERSION, acceptedAt: new Date().toISOString() }
  try { storage()?.setItem(AI_DISCLOSURE_KEY, JSON.stringify(memory)) } catch { /* Memory only. */ }
}
