import type { AccordbookBackup } from '../models/backup'
import type { AccordbookStorage } from '../storage/storageService'

export async function createBackup(storage: AccordbookStorage): Promise<AccordbookBackup> { return { app: 'Accordbook', formatVersion: 1, exportedAt: new Date().toISOString(), data: await storage.exportData() } }
export function downloadBackup(backup: AccordbookBackup, date = new Date()): void { const filename = `accordbook-backup-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}.accordbook`; const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url) }
