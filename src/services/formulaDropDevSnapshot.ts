import type { PublicFormulaDrop } from './formulaDropPublicApi'

// DEV VISUAL QA SNAPSHOT — PUBLIC DTO ONLY
const snapshot: PublicFormulaDrop = {
  dropId: 'DROP-2026-001', slug: '2026-001', year: 2026, sequence: 1,
  title: 'Mcintosh Apple / Simplified Study',
  subtitle: 'A beta formula drop for testing, modifying, and comparing in Accordbook.',
  description: 'FORMULA COMPOSITION\nAldehyde C-14\nAllyl amyl glycolate\nBenzyl benzoate\nDihydromyrcenol\nDimethyl benzyl carbinyl butyrate\nDPG\nFructone\nGalaxolide\nHexyl acetate\nIsocyclocitral\nVerdox\n-----\nBeta test period: 14 days\nYou do not need to use Accordbook every day.\nOpen the Drop, try the workflow, and send feedback before the deadline.',
  status: 'ACTIVE', startAt: null, expiresAt: '2026-09-30T14:59:00.000Z'
}

export function isFormulaDropSnapshotMode() { return import.meta.env.DEV && new URLSearchParams(window.location.search).get('dropData') === 'snapshot' }
export function getFormulaDropSnapshot() { return { ...snapshot } }
