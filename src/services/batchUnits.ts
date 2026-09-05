export type BatchUnit = 'g' | 'kg'

export function toCanonicalGrams(value: number, unit: BatchUnit): number {
  return unit === 'kg' ? value * 1000 : value
}

export function fromCanonicalGrams(grams: number, unit: BatchUnit): number {
  return unit === 'kg' ? grams / 1000 : grams
}

export interface BatchInput {
  amount: string
  unit: BatchUnit
  canonicalGrams: number | null
}

export function batchInput(amount = '10.00', unit: BatchUnit = 'g'): BatchInput {
  const grams = toCanonicalGrams(Number(amount), unit)
  return { amount, unit, canonicalGrams: amount.trim() !== '' && Number.isFinite(grams) ? grams : null }
}

/** Keep the canonical mass untouched when changing only its input representation. */
export function changeBatchUnit(input: BatchInput, unit: BatchUnit): BatchInput {
  if (input.unit === unit) return input
  return { ...input, unit, amount: input.canonicalGrams === null ? input.amount : String(fromCanonicalGrams(input.canonicalGrams, unit)) }
}
