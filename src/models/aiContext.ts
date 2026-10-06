/** Independent external contract. No Core identifiers or persistence metadata. */
export interface AIContextRowV1 {
  readonly material: string
  /** Original solution parts: 1 part = 0.01 g. Never normalized. */
  readonly parts: number
  /** Syntax/checksum valid only; not a verified material-to-CAS association. */
  readonly cas?: string
  readonly dilution?: { readonly percent: number; readonly solvent: string }
}

export interface AIContextV1 {
  readonly type: 'accordbook-ai-context'
  readonly version: 1
  readonly scope: 'formula_review'
  readonly formula: {
    readonly name?: string
    readonly notes?: string
    readonly rows: readonly AIContextRowV1[]
  }
}
