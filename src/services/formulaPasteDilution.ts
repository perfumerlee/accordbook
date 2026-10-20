import type { FormulaDilution } from '../models/formula'
import { findSolventMatch } from './solventDictionary'

export type DilutionRecognitionIssueCode =
  | 'DILUTION_AMBIGUOUS_NOTATION'
  | 'DILUTION_INVALID_PERCENT'
  | 'DILUTION_MATERIAL_REQUIRED'
  | 'DILUTION_NOT_PROPOSED'
  | 'DILUTION_SOLVENT_REQUIRED'

export type DilutionRecognition =
  | { status: 'none'; originalMaterial: string }
  | { status: 'proposed'; originalMaterial: string; proposedMaterial: string; proposedPercent: number; proposedSolvent?: string }
  | { status: 'ambiguous'; originalMaterial: string; issueCode: 'DILUTION_AMBIGUOUS_NOTATION' }
  | { status: 'invalid'; originalMaterial: string; issueCode: 'DILUTION_INVALID_PERCENT' | 'DILUTION_MATERIAL_REQUIRED' }

export type DilutionReviewDecision =
  | { action: 'keep' }
  | { action: 'apply'; percent: unknown; solvent: unknown; material?: unknown }

export type FormulaPasteDilutionReviewChoice =
  | { mode: 'keep_original' }
  | { mode: 'apply'; material: string; percentInput: string; solventInput: string }

export type DilutionReviewValidation =
  | { status: 'none'; material: string }
  | { status: 'pending'; material: string; proposal: Extract<DilutionRecognition, { status: 'proposed' }> }
  | { status: 'ambiguous'; material: string; recognition: Extract<DilutionRecognition, { status: 'ambiguous' }> }
  | { status: 'unavailable'; material: string; recognition: Extract<DilutionRecognition, { status: 'invalid' }> }
  | { status: 'kept'; material: string }
  | { status: 'invalid'; material: string; issueCode: DilutionRecognitionIssueCode }
  | { status: 'approved'; material: string; dilution: FormulaDilution }

const supportedSuffix = /^(.+?)\s+(\()?\s*@?\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|NaN|Infinity)\s*%\s*(?:in\s+(.+?))?\s*(\))?$/i
const shorthandSolventSuffix = /^(.+?)\s+(\()?\s*@?\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|NaN|Infinity)\s*%\s+(.+?)\s*(\))?$/i
const percentageToken = /(?:\d+(?:\.\d*)?|\.\d+)\s*[%％]/g

/** Recognizes only a supported, terminal percentage suffix. It never changes the source name. */
export function recognizeFormulaPasteDilution(material: string): DilutionRecognition {
  const source = material
  const value = material.trim()
  if (!value) return { status: 'none', originalMaterial: source }
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*[%％]$/.test(value)) {
    return { status: 'invalid', originalMaterial: source, issueCode: 'DILUTION_MATERIAL_REQUIRED' }
  }
  if ([...value.matchAll(percentageToken)].length > 1) {
    return { status: 'ambiguous', originalMaterial: source, issueCode: 'DILUTION_AMBIGUOUS_NOTATION' }
  }

  const supportedMatch = value.match(supportedSuffix)
  const shorthandMatch = supportedMatch ? null : value.match(shorthandSolventSuffix)
  const shorthandSolvent = shorthandMatch?.[4]?.trim()
  const match = supportedMatch ?? (shorthandSolvent && ['exact', 'alias'].includes(findSolventMatch(shorthandSolvent).status) ? shorthandMatch : null)
  if (match) {
    const [, rawMaterial, openingParenthesis, rawPercent, rawSolvent, closingParenthesis] = match
    if (Boolean(openingParenthesis) !== Boolean(closingParenthesis)) {
      return { status: 'ambiguous', originalMaterial: source, issueCode: 'DILUTION_AMBIGUOUS_NOTATION' }
    }
    const proposedMaterial = rawMaterial.trim()
    if (!proposedMaterial) return { status: 'invalid', originalMaterial: source, issueCode: 'DILUTION_MATERIAL_REQUIRED' }
    const proposedPercent = Number(rawPercent)
    if (!Number.isFinite(proposedPercent) || proposedPercent < 0 || proposedPercent > 100) {
      return { status: 'invalid', originalMaterial: source, issueCode: 'DILUTION_INVALID_PERCENT' }
    }
    const proposedSolvent = rawSolvent?.trim()
    if (rawSolvent !== undefined && (!proposedSolvent || /[%％/()]/.test(proposedSolvent))) {
      return { status: 'ambiguous', originalMaterial: source, issueCode: 'DILUTION_AMBIGUOUS_NOTATION' }
    }
    return {
      status: 'proposed', originalMaterial: source, proposedMaterial, proposedPercent,
      ...(proposedSolvent ? { proposedSolvent } : {}),
    }
  }

  // Multiple concentrations and non-terminal percentage text must be reviewed as names,
  // never partially stripped. This also catches the explicitly unsupported word/full-width forms.
  const percentTokens = [...value.matchAll(percentageToken)]
  if (percentTokens.length > 0 || /\d+(?:\.\d+)?\s+percent\b/i.test(value)) {
    return { status: 'ambiguous', originalMaterial: source, issueCode: 'DILUTION_AMBIGUOUS_NOTATION' }
  }

  // Recognize malformed/invalid terminal values without interpreting them as dilution.
  if (/(?:^|\s)[^\s]*\s+(?:%|[+-]?(?:\d+(?:\.\d*)?|\.\d+|NaN|Infinity)\s*%)\s*$/i.test(value)
    || /\s+-\s*(?:\d+(?:\.\d*)?|\.\d+)\s*%\s*$/i.test(value)) {
    return { status: 'invalid', originalMaterial: source, issueCode: 'DILUTION_INVALID_PERCENT' }
  }
  return { status: 'none', originalMaterial: source }
}

/** Validates a future Import Review choice; recognition itself never implies approval. */
export function validateFormulaPasteDilutionReview(
  recognition: DilutionRecognition,
  decision?: DilutionReviewDecision,
): DilutionReviewValidation {
  if (recognition.status === 'none') {
    if (decision?.action === 'apply') return { status: 'invalid', material: recognition.originalMaterial.trim(), issueCode: 'DILUTION_NOT_PROPOSED' }
    if (decision?.action === 'keep') return { status: 'kept', material: recognition.originalMaterial.trim() }
    return { status: 'none', material: recognition.originalMaterial.trim() }
  }
  if (!decision) {
    if (recognition.status === 'proposed') return { status: 'pending', material: recognition.originalMaterial.trim(), proposal: recognition }
    if (recognition.status === 'ambiguous') return { status: 'ambiguous', material: recognition.originalMaterial.trim(), recognition }
    return { status: 'unavailable', material: recognition.originalMaterial.trim(), recognition }
  }
  if (decision.action === 'keep') return { status: 'kept', material: recognition.originalMaterial.trim() }
  if (recognition.status !== 'proposed') return { status: 'invalid', material: recognition.originalMaterial.trim(), issueCode: 'DILUTION_NOT_PROPOSED' }

  const material = typeof decision.material === 'string' ? decision.material.trim() : recognition.proposedMaterial.trim()
  if (!material) return { status: 'invalid', material: recognition.originalMaterial.trim(), issueCode: 'DILUTION_MATERIAL_REQUIRED' }
  const percent = decision.percent
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { status: 'invalid', material: recognition.originalMaterial.trim(), issueCode: 'DILUTION_INVALID_PERCENT' }
  }
  const solvent = typeof decision.solvent === 'string' ? decision.solvent.trim() : ''
  if (!solvent) return { status: 'invalid', material: recognition.originalMaterial.trim(), issueCode: 'DILUTION_SOLVENT_REQUIRED' }
  return { status: 'approved', material, dilution: { enabled: true, percent, solvent } }
}

/** Adapts the stable Import Review choice to the DIL-1 validation contract. */
export function validateFormulaPasteDilutionChoice(
  recognition: DilutionRecognition,
  choice?: FormulaPasteDilutionReviewChoice,
): DilutionReviewValidation {
  if (!choice) return validateFormulaPasteDilutionReview(recognition)
  if (choice.mode === 'keep_original') return validateFormulaPasteDilutionReview(recognition, { action: 'keep' })
  const rawPercent = choice.percentInput.trim()
  const percent = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(rawPercent) ? Number(rawPercent) : Number.NaN
  return validateFormulaPasteDilutionReview(recognition, { action: 'apply', material: choice.material, percent, solvent: choice.solventInput })
}
