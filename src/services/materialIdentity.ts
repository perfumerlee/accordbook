/** Identity normalization; punctuation and accents retain their meaning. */
export const normalizeMaterialName = (value: string): string => value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase()
