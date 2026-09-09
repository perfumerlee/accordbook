import { createFormulaDropEventId, getFormulaDropAttribution, getOrCreateFormulaDropSessionId, getOrCreateFormulaDropVisitorId, rememberFormulaDropImport } from './formulaDropIdentity'
import { requestFormulaDropDownload, type FormulaDropDownload } from './formulaDropPublicApi'
async function triggerFileDownload(download: FormulaDropDownload): Promise<void> {
  try {
    const response = await fetch(download.fileUrl, { credentials: 'omit' });
    if (!response.ok) throw new Error('asset_unavailable');
    const blob = await response.blob();
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

export async function startFormulaDropDownload(dropId: string, options: { source?: string; referrer?: string } = {}): Promise<FormulaDropDownload> { const attribution = getFormulaDropAttribution(dropId, options.source, options.referrer); const result = await requestFormulaDropDownload({ dropId, eventId: createFormulaDropEventId(), visitorId: getOrCreateFormulaDropVisitorId(), sessionId: getOrCreateFormulaDropSessionId(), source: attribution.source, referrerHost: attribution.referrerHost }); rememberFormulaDropImport(dropId); await triggerFileDownload(result.download); return result.download }
