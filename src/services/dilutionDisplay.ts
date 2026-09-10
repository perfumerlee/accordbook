import type { FormulaDilution } from '../models/formula'
export function formatDilutionSuffix(dilution?: FormulaDilution): string { return dilution?.enabled ? `@${dilution.percent}% in ${dilution.solvent || 'ALC'}` : '' }
