import { dropResponseText } from './dropResponseText'
export type PublicFormulaDrop = { dropId: string; slug: string; year: number; sequence: number; title: string; subtitle: string; description: string; status: 'ACTIVE' | 'EXPIRED'; startAt: string | null; expiresAt: string | null }
import { getFormulaDropApiEndpoint } from './formulaDropEndpoint'
import { getFormulaDropSnapshot, isFormulaDropSnapshotMode } from './formulaDropDevSnapshot'
import { parseFreeFormulaDropPackage, type FormulaDropPackage, validateFormulaDropId } from './formulaDropPackage'
export type FormulaDropDownload = { fileName: string; fileUrl: string; accessName?: string; accessLast4?: string; accessPin?: string }
export type FormulaDropImportResolution = { dropId: string }
export type FormulaDropPackageResolution = FormulaDropPackage
const endpoint = getFormulaDropApiEndpoint
function isDrop(value: unknown): value is PublicFormulaDrop { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; return typeof item.dropId === 'string' && typeof item.slug === 'string' && typeof item.title === 'string' && (item.status === 'ACTIVE' || item.status === 'EXPIRED') && !('fileUrl' in item) && !('licenseId' in item) && !('publicAccessPin' in item) }
async function post(body: object, signal?: AbortSignal): Promise<unknown> { const url = endpoint(); if (!url) throw new Error('unconfigured'); const response = await fetch(url, { method: 'POST', redirect: 'follow', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(10000) }); if (!response.ok) throw new Error('unavailable'); return JSON.parse(await dropResponseText(response, 32_000_000)) }
export async function listFormulaDrops(): Promise<PublicFormulaDrop[]> { if (isFormulaDropSnapshotMode()) return [getFormulaDropSnapshot()]; const result = await post({ action: 'list-drops' }) as { ok?: boolean; drops?: unknown[] }; if (result.ok !== true || !Array.isArray(result.drops)) throw new Error('invalid_response'); return result.drops.filter(isDrop) }
export async function getFormulaDrop(dropId: string, signal?: AbortSignal): Promise<PublicFormulaDrop | undefined> { if (isFormulaDropSnapshotMode()) return dropId === 'DROP-2026-001' ? getFormulaDropSnapshot() : undefined; const result = await post({ action: 'get-drop', dropId }, signal) as { ok?: boolean; drop?: unknown; error?: string }; if (result.ok === false && result.error === 'not_found') return undefined; if (result.ok !== true || !isDrop(result.drop)) throw new Error(result.error || 'invalid_response'); return result.drop }
function isDownload(value: unknown): value is FormulaDropDownload { if (!value || typeof value !== 'object') return false; const item = value as Record<string, unknown>; const credentials = item.accessName === undefined && item.accessLast4 === undefined && item.accessPin === undefined || typeof item.accessName === 'string' && /^\d{4}$/.test(String(item.accessLast4)) && /^\d{6}$/.test(String(item.accessPin)); return typeof item.fileName === 'string' && item.fileName.length > 0 && typeof item.fileUrl === 'string' && /^https:\/\/[^\s]+$/i.test(item.fileUrl) && credentials && !('licenseId' in item) }
export async function requestFormulaDropDownload(payload: { dropId: string; eventId: string; visitorId: string; sessionId: string; source: string; referrerHost: string }): Promise<{ duplicate: boolean; download: FormulaDropDownload }> { const result = await post({ action: 'get-download', ...payload }) as { ok?: boolean; accepted?: boolean; duplicate?: boolean; download?: unknown; error?: string }; if (result.ok !== true || result.accepted !== true || typeof result.duplicate !== 'boolean' || !isDownload(result.download)) throw new Error(result.error || 'unavailable'); return { duplicate: result.duplicate, download: result.download } }
export async function resolveFormulaDropByPackageId(packageId: string): Promise<FormulaDropImportResolution | undefined> { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(packageId)) return undefined; try { const result = await post({ action: 'resolve-import-drop', packageId }) as { ok?: boolean; dropId?: unknown; error?: string }; return result.ok === true && typeof result.dropId === 'string' && /^DROP-\d{4}-\d{3}$/.test(result.dropId) ? { dropId: result.dropId } : undefined } catch { return undefined } }
export async function resolveFormulaDropPackage(dropId: string, signal?: AbortSignal): Promise<FormulaDropPackageResolution> {
  if (!validateFormulaDropId(dropId)) throw new Error('invalid_drop_id')
  if (isFormulaDropSnapshotMode()) {
    if (dropId !== 'DROP-2026-001') throw new Error('drop_not_found')
    const response = await fetch('/formula-drops/2026-001/ACBK-DROP-2026-001-McintoshApple.accordbook', { signal })
    if (!response.ok) throw new Error('package_unavailable')
    return parseFreeFormulaDropPackage(dropId, await dropResponseText(response, 16_000_000), 'ACBK-DROP-2026-001-McintoshApple.accordbook', getFormulaDropSnapshot().title)
  }
  const result = await post({ action: 'resolve-drop-package', dropId }, signal) as { ok?: boolean; package?: unknown; error?: string }
  if (result.ok !== true || !result.package || typeof result.package !== 'object') throw new Error(result.error || 'package_unavailable')
  const value = result.package as Record<string, unknown>
  if (value.dropId !== dropId || value.packageType !== 'accordbook-formula') throw new Error('drop_package_mismatch')
  if (typeof value.fileName !== 'string' || typeof value.packageText !== 'string' || typeof value.title !== 'string') throw new Error('invalid_drop_package')
  return parseFreeFormulaDropPackage(dropId, value.packageText, value.fileName, value.title)
}
