# Variant evaluations

In Experiments, select a Variant or Branch and use **Record an evaluation** below Notes. Add an observation, choose a next direction, and optionally describe what to try next. Saving captures the Variant composition at that moment, including dilution, CAS, and row memos. Editing an evaluation changes its commentary only; its composition and creation time remain fixed.

Each direction has a distinct prompt and action:

| Direction | Optional prompt | Action |
| --- | --- | --- |
| Continue | What to try next | Create next Branch from this composition |
| Hold | What to check | Create a check Branch |
| Finish here | Why finish this direction? | No new Branch from this evaluation |
| Not sure yet | What is needed to decide? | Create a comparison Branch |

Hold means the direction has potential but the decision is deferred. Not sure yet means there is not enough information to judge. These decisions belong to individual evaluations, not to the whole Variant.

Branch creation starts from the evaluation's saved rows, even if the parent has since changed. The child stores a frozen `origin` context containing the observation, verdict, next action, decision note, and creation purpose. The Branch editor shows this context as read-only above the editable Notes. Continue copies its next-action text into the initial Notes; Hold and Not sure yet leave Notes available for a fresh working instruction because their original text remains visible in Origin context. Branches can now continue recursively; first-level legacy labels such as `A1` remain unchanged, while new deeper labels use `A1.1`, `A1.2`, and so on. Evaluations used by a child cannot be deleted until the child is removed. Deleting a Variant or Experiment also deletes its evaluations.

Finishing an evaluation blocks Branch creation in both the UI and lifecycle service. Existing children remain intact, including their original purpose, even when the source decision is later changed. A user can edit the decision to resume. Finishing one evaluation does not lock the Variant's ordinary editing and Branch actions.

The optional `decisionNote` holds the reason for finishing separately from `nextAction`. Switching directions preserves both texts. A finished evaluation displays any existing next action as **Previously planned action**, rather than relabeling old action text as a reason for finishing.

Evaluation drafts stay available when switching Variants or returning to the Experiment list within the same workspace session. Closing the workspace or browser warns about nonempty drafts. Explicitly saved evaluations use the existing local Experiment autosave and retry flow.

## Storage compatibility

`evaluations`, `sourceEvaluationId`, `evaluationBranchPurpose`, and `origin` are optional additions to Experiment Variants. `decisionNote` is optional within evaluations. They require no new IndexedDB store or database version. Notebook Backup v3 retains complete Experiment objects, so these fields round-trip without a format bump. Existing v1/v2/v3 backups remain supported. Missing evaluations are treated as an empty list. Legacy Branches without a creation purpose or origin context keep their existing Notes and a neutral relationship label; their purpose is not inferred from a subsequently edited evaluation. New readers validate evaluation identities, timestamps, verdicts, rows, decision notes, Branch purposes, origin fields, and parent source references. Older clients do not enforce the new direction rules; use the current app to edit notebooks containing evaluations.

Single Formula files still carry no Experiment history, including evaluations. Use Notebook Backup to transfer these records.

These records describe the selected Variant composition, not verified actual weighing or a physical Batch. Blind comparisons and physical Batch records are separate future work.
