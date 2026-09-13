import { createFormulaDropEventId, getFormulaDropAttribution, getOrCreateFormulaDropSessionId, getOrCreateFormulaDropVisitorId, rememberFormulaDropImport } from './formulaDropIdentity'
import { requestFormulaDropDownload, type FormulaDropDownload } from './formulaDropPublicApi'
import { rememberFormulaDropAccess } from './formulaDropAccess'
import { loadVaultRecord, queryVaultPermission, requestVaultPermission, saveFormulaDropPackage, type VaultSaveResult } from './localFormulaVault'
import { parsePaidFormulaPackage } from './paidFormulaPackage'
export type FormulaDropSaveOutcome = VaultSaveResult | { status: 'FALLBACK_DOWNLOAD' }
async function triggerBrowserDownload(download: FormulaDropDownload, blob?: Blob): Promise<void> {
  try {
    if (!blob) { const response = await fetch(download.fileUrl, { credentials: 'omit' }); if (!response.ok) throw new Error('asset_unavailable'); blob = await response.blob() }
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = download.fileName;
    link.rel = 'noopener';
    document.body.append(link);
    try { link.click() } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000) }
  } catch {
    const link = document.createElement('a');
    link.href = download.fileUrl;
    link.download = download.fileName;
    link.rel = 'noopener';
    document.body.append(link);
    try { link.click() } finally { link.remove() }
  }
}

export async function startFormulaDropDownload(dropId: string, options: { source?: string; referrer?: string } = {}): Promise<FormulaDropDownload & { localSave?: FormulaDropSaveOutcome }> { const attribution = getFormulaDropAttribution(dropId, options.source, options.referrer); const result = await requestFormulaDropDownload({ dropId, eventId: createFormulaDropEventId(), visitorId: getOrCreateFormulaDropVisitorId(), sessionId: getOrCreateFormulaDropSessionId(), source: attribution.source, referrerHost: attribution.referrerHost }); rememberFormulaDropAccess(result.download, dropId.replace(/^DROP-/, '')); rememberFormulaDropImport(dropId); let blob: Blob | undefined; try { const response = await fetch(result.download.fileUrl, { credentials: 'omit' }); if (!response.ok) throw new Error('asset_unavailable'); blob = await response.blob(); const file = parsePaidFormulaPackage(await blob.text()); const record = await loadVaultRecord(); if (!record) { await triggerBrowserDownload(result.download, blob); return { ...result.download, localSave: { status: 'FALLBACK_DOWNLOAD' } } } let permission = await queryVaultPermission(record.directoryHandle); if (permission === 'prompt') permission = await requestVaultPermission(record.directoryHandle); if (permission !== 'granted') { await triggerBrowserDownload(result.download, blob); return { ...result.download, localSave: { status: 'PERMISSION_REQUIRED' } } } const saved = await saveFormulaDropPackage({ rootHandle: record.directoryHandle, slug: dropId.replace(/^DROP-/, ''), fileName: result.download.fileName, blob, packageId: file.packageId }); if (saved.status === 'SAVED' || saved.status === 'ALREADY_SAVED') return { ...result.download, localSave: saved }; await triggerBrowserDownload(result.download, blob); return { ...result.download, localSave: saved } } catch { await triggerBrowserDownload(result.download, blob); return { ...result.download, localSave: { status: 'FALLBACK_DOWNLOAD' } } } }
