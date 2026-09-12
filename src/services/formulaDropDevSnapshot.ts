import { archivedDrop } from './formulaDropArchive'

// DEV VISUAL QA SNAPSHOT — PUBLIC DTO ONLY, shared with the permanent archive.
export function isFormulaDropSnapshotMode() { return import.meta.env.DEV && new URLSearchParams(window.location.search).get('dropData') === 'snapshot' }
export function getFormulaDropSnapshot() { return { ...archivedDrop('DROP-2026-001')!, status: 'ACTIVE' as const } }
