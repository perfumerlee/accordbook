export type ExperimentAiRequestLimit = {
  bytes?: number
  verified: boolean
}

export function resolveExperimentAiRequestLimit(value: string | undefined): ExperimentAiRequestLimit {
  if (!value || !/^\d+$/.test(value)) return { verified: false }
  const bytes = Number(value)
  if (!Number.isSafeInteger(bytes) || bytes < 256 || bytes > 16384) return { verified: false }
  return { bytes, verified: true }
}

export const experimentAiRequestLimit = resolveExperimentAiRequestLimit(import.meta.env.VITE_EXPERIMENT_AI_INPUT_BYTES)
