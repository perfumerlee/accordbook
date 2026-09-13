import type { GuideDocument } from '../models/guide'
import { validateGuideDocument } from './guideContracts'
const sources = import.meta.glob('../../content/guide/*.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
export function loadGuideDocuments(): GuideDocument[] { return Object.entries(sources).filter(([path]) => !path.endsWith('glossary.json')).map(([path, raw]) => { const value = JSON.parse(raw) as GuideDocument; const result = validateGuideDocument(value); if (!result.ok) throw new Error(`Invalid Guide source ${path}: ${result.issues.map(issue => issue.message).join('; ')}`); return value }).sort((a, b) => a.order - b.order) }
export const guideNavigation = [
  ['getting-started', 'Getting Started'], ['formula-basics', 'Formula Basics'], ['time-machine', 'Time Machine'], ['experiments', 'Experiments'], ['formula-drop', 'Formula Drop'], ['import-export', 'Import & Export'], ['data-backup', 'Data & Backup'], ['faq', 'FAQ'],
] as const
