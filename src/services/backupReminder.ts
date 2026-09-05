const KEY = 'accordbook.backup-reminder'
const DAY = 24 * 60 * 60 * 1000
export const BACKUP_REMINDER_DELAY = 7 * DAY
export const BACKUP_REMINDER_SNOOZE = 3 * DAY
export type BackupReminderState = { lastBackupAt: string | null; dirtySince: string | null; snoozedUntil: string | null }
const empty = (): BackupReminderState => ({ lastBackupAt: null, dirtySince: null, snoozedUntil: null })
export function readBackupReminderState(): BackupReminderState { try { const value = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return { lastBackupAt: typeof value?.lastBackupAt === 'string' ? value.lastBackupAt : null, dirtySince: typeof value?.dirtySince === 'string' ? value.dirtySince : null, snoozedUntil: typeof value?.snoozedUntil === 'string' ? value.snoozedUntil : null } } catch { return empty() } }
function write(state: BackupReminderState): BackupReminderState { localStorage.setItem(KEY, JSON.stringify(state)); return state }
export function markBackupDirty(now = new Date()): BackupReminderState { const state = readBackupReminderState(); return write({ ...state, dirtySince: state.dirtySince ?? now.toISOString() }) }
export function markBackupSuccess(now = new Date()): BackupReminderState { return write({ lastBackupAt: now.toISOString(), dirtySince: null, snoozedUntil: null }) }
export function markBackupImported(exportedAt?: string, now = new Date()): BackupReminderState { const date = exportedAt && !Number.isNaN(Date.parse(exportedAt)) ? exportedAt : now.toISOString(); return markBackupSuccess(new Date(date)) }
export function snoozeBackupReminder(now = new Date()): BackupReminderState { return write({ ...readBackupReminderState(), snoozedUntil: new Date(now.getTime() + BACKUP_REMINDER_SNOOZE).toISOString() }) }
export function shouldShowBackupReminder(state = readBackupReminderState(), now = new Date()): boolean { return Boolean(state.dirtySince && Date.parse(state.dirtySince) + BACKUP_REMINDER_DELAY <= now.getTime() && (!state.snoozedUntil || Date.parse(state.snoozedUntil) <= now.getTime())) }
