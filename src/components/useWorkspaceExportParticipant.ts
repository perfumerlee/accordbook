import { useLayoutEffect, useRef } from 'react'
import type { WorkspaceExportCoordinator, WorkspaceExportParticipant } from '../services/workspaceExportCoordinator'

export function useWorkspaceExportParticipant(coordinator: WorkspaceExportCoordinator | undefined, participant: WorkspaceExportParticipant) {
  const latest = useRef(participant)
  useLayoutEffect(() => { latest.current = participant })
  useLayoutEffect(() => coordinator?.register({ formulaId: participant.formulaId, role: participant.role,
    blockedReason: () => latest.current.blockedReason(), flush: () => latest.current.flush() }), [coordinator, participant.formulaId, participant.role])
}
