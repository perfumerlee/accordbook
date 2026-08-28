import { MetaRepository } from '../storage/metaRepository'

export interface FormulaIdInput { prefix: string; date: Date }

function yearMonth(date: Date): string {
  return `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}`
}

export async function generateFormulaId(input: FormulaIdInput, meta: MetaRepository): Promise<string> {
  const sequenceKey = `${input.prefix}-${yearMonth(input.date)}`
  const nextSequence = (await meta.getSequence(sequenceKey) ?? 0) + 1
  await meta.setSequence(sequenceKey, nextSequence)
  return `${sequenceKey}-${String(nextSequence).padStart(3, '0')}`
}
