export type ExperimentViewportMode = 'full' | 'rotate' | 'unsupported'
export function classifyExperimentViewport(width: number, height: number): ExperimentViewportMode { const shortest = Math.min(width, height); if (shortest < 600) return 'unsupported'; if (width >= 1024 && width > height) return 'full'; return 'rotate' }
