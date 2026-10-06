import type { Formula } from '../models/formula'
/** Local-only marker. Never sent, logged, hashed for telemetry, or persisted. */
export function aiSnapshotMarker(formula: Readonly<Formula> | undefined, name: boolean, notes: boolean): string {
  return JSON.stringify(formula ? [formula.id, name, notes, formula.name, formula.notes,
    formula.rows.map(r => [r.material, r.parts, r.cas, r.marked, r.dilution])] : null)
}
export interface AiRequestIdentity { readonly sequence: number; readonly formulaId: string; readonly marker: string; readonly controller: AbortController }
export class AiRequestGate {
  private sequence = 0
  private current?: AiRequestIdentity
  begin(formulaId: string, marker: string): AiRequestIdentity {
    this.invalidate()
    return this.current = { sequence: this.sequence, formulaId, marker, controller: new AbortController() }
  }
  invalidate(): void { this.sequence++; this.current?.controller.abort(); this.current = undefined }
  isCurrent(request: AiRequestIdentity, formulaId: string | undefined, marker: string): boolean {
    return this.current === request && request.sequence === this.sequence && request.formulaId === formulaId &&
      request.marker === marker && !request.controller.signal.aborted
  }
}
