/**
 * Accordbook's approved solvent names and lookup helpers.
 *
 * This dictionary is a naming aid only. It is intentionally separate from
 * solventClassifier, which identifies formula rows for composition math.
 */
export interface SolventDefinition {
  readonly code: string
  readonly fullName: string
  readonly aliases: readonly string[]
}

export const solventDefinitions: readonly SolventDefinition[] = Object.freeze([
  Object.freeze({ code: 'ALC', fullName: 'Ethanol', aliases: Object.freeze(['Ethyl Alcohol', 'EtOH']) }),
  Object.freeze({ code: 'DPG', fullName: 'Dipropylene Glycol', aliases: Object.freeze([]) }),
  Object.freeze({ code: 'TEC', fullName: 'Triethyl Citrate', aliases: Object.freeze([]) }),
  Object.freeze({ code: 'IPM', fullName: 'Isopropyl Myristate', aliases: Object.freeze([]) }),
  Object.freeze({ code: 'DEP', fullName: 'Diethyl Phthalate', aliases: Object.freeze([]) }),
  Object.freeze({ code: 'BB', fullName: 'Benzyl Benzoate', aliases: Object.freeze([]) }),
  Object.freeze({ code: 'PG', fullName: 'Propylene Glycol', aliases: Object.freeze([]) }),
])

export type SolventMatchStatus = 'exact' | 'alias' | 'ambiguous' | 'custom' | 'empty'

export interface SolventMatch {
  readonly status: SolventMatchStatus
  /** The exact value supplied by the caller; lookup never rewrites it. */
  readonly originalInput: string
  /** A suggestion only. Callers must explicitly approve any replacement. */
  readonly canonicalCode?: string
  readonly preferredName?: string
  readonly definition?: SolventDefinition
  readonly candidates?: readonly SolventDefinition[]
}

/** Lookup normalization only; this value is never returned in place of user input. */
function normalizeLookupValue(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase()
}

type LookupEntry = { definition: SolventDefinition; kind: 'exact' | 'alias' }

function findLookupEntries(key: string): LookupEntry[] {
  const entries: LookupEntry[] = []
  for (const definition of solventDefinitions) {
    if (normalizeLookupValue(definition.code) === key || normalizeLookupValue(definition.fullName) === key) {
      entries.push({ definition, kind: 'exact' })
    }
    if (definition.aliases.some(alias => normalizeLookupValue(alias) === key)) {
      entries.push({ definition, kind: 'alias' })
    }
  }
  return entries
}

/** Match an approved code, preferred name, or alias without changing the input. */
export function findSolventMatch(input: string): SolventMatch {
  const key = normalizeLookupValue(input)
  if (!key) return { status: 'empty', originalInput: input }

  const entries = findLookupEntries(key)
  const candidates = [...new Map(entries.map(entry => [entry.definition.code, entry.definition])).values()]
  if (candidates.length > 1) {
    return { status: 'ambiguous', originalInput: input, candidates }
  }
  if (candidates.length === 1) {
    const definition = candidates[0]
    const kind = entries.some(entry => entry.definition.code === definition.code && entry.kind === 'exact') ? 'exact' : 'alias'
    return {
      status: kind,
      originalInput: input,
      canonicalCode: definition.code,
      preferredName: definition.fullName,
      definition,
    }
  }
  return { status: 'custom', originalInput: input }
}

/** Return deterministic dictionary suggestions for a partial code, name, or alias. */
export function getSolventSuggestions(query: string): readonly SolventDefinition[] {
  const key = normalizeLookupValue(query)
  if (!key) return []

  return solventDefinitions.filter(definition =>
    [definition.code, definition.fullName, ...definition.aliases]
      .some(value => normalizeLookupValue(value).includes(key)),
  )
}

/** Resolve only an exact canonical code (case-insensitive, with outer whitespace ignored). */
export function getSolventByCode(code: string): SolventDefinition | undefined {
  const key = normalizeLookupValue(code)
  return solventDefinitions.find(definition => normalizeLookupValue(definition.code) === key)
}
