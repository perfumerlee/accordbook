# Workspace Phase 7A: ownership and performance audit

## Measured baseline

The Phase 7 fixture contains 75 Current rows, 200 manual Versions, 20 restore points,
30 Experiments, 540 Variants, 360 Branches, 540 Evaluations, and 300 provenance revisions.
The original compact export is 11,139,355 bytes. No fixture reduction is used.

Phase 7 measured export 5.24–6.81 seconds (maximum long task 5,603ms), import
18.80–22.08 seconds (maximum long task 15,865ms), and Experiment opening after ten
large imports at 13.59 seconds. These are browser measurements, not unit-test thresholds.

Before editing production code, `workspace-profile-qa.mjs` recorded actual UI paths
with Chrome CPU profiles and aggregate primitive timings. Instrumentation adds overhead:
its wall times should not be mixed with the uninstrumented Phase 7 measurements.
Import made 2,679,570 TextEncoder calls (5,989ms aggregate), with 1,792ms sampled GC.
Export made 1,339,791 TextEncoder calls (3,498ms), with 1,090ms sampled GC.
Pure stringify was a small fraction of the previously reported serializer path.
The first Experiment list opening made 60 structuredClone calls (236ms) for 30 records.

## Full-graph pass map

Counts below describe one successful UI operation, without a CAS retry. Shape projection
also makes a fresh allowlisted DTO, checks strings/row identities, and enforces limits.
Graph validation is a separate reference traversal; it does not copy snapshot rows.

| Before function / caller | Shape projections | Graph checks | Additional full clone | Immediately repeated |
| --- | ---: | ---: | ---: | --- |
| `toWorkspaceFile` / collector | 1 | 1 | 0 | provenance wrapper |
| `verifyWorkspaceProvenance` / collector | 1 | 1 | 0 | collector then clones source |
| collector return | 0 | 0 | 1 | UI projects again |
| `toWorkspaceFile` / UI export | 1 | 1 | 0 | serializer validates again |
| serializer / UI export | 1 | 1 | 0 | final stringify |
| **Export total** | **4** | **4** | **1** | |
| parser / UI import | 1 | 1 | 0 | importer |
| importer input | 1 | 1 | 0 | provenance wrapper |
| provenance input | 1 | 1 | 0 | remap input |
| remap input | 1 | 1 | 0 | output projection |
| remap output | 1 | 1 | 0 | post-revision projection |
| post-revision projection | 1 | 1 | 0 | provenance wrapper |
| final provenance wrapper | 1 | 1 | 0 | storage preparation |
| storage preparation | 1 | 1 | 1 | IndexedDB clones for storage |
| **Import total** | **8** | **8** | **1** | |

After: export has one shape projection/graph check, one provenance verification, and
compact serialization. The projection's file-byte check and final serialization still
both stringify; byte enforcement remains explicit. Public serializer/parser APIs still
validate independently when called outside the owned pipeline.

After: import has one external shape projection/graph check, two lightweight graph
checks (after remap and after the appended revision), two cryptographic verification
passes (source and final), final byte-limit enforcement, and one ownership-sealing
traversal. The newly generated provenance subgraph also crosses its field/size validator;
this preserves revision/checkpoint limits without traversing all snapshots again.
Remap only rebuilds identity-bearing containers. It shares validated immutable
snapshots within the operation. When every Current row already has rowId, the full
snapshot scan for missing-row lineage recovery is unnecessary and is skipped. The
recovery algorithm remains in place for inputs that need it.

## Clone and ownership contract

| Clone | Decision |
| --- | --- |
| JSON.parse of file text | REQUIRED: external representation becomes an object |
| External allowlist projection | REQUIRED: shape validation, privacy, no input aliases |
| Collector's second domain clone | REDUNDANT: readWorkspace already returns owned records |
| Remap snapshot clones | CAN BE SHALLOW: operation-private validated snapshots stay immutable |
| Importer's repository clone | REDUNDANT for a sealed one-use capability; public callers still clone |
| IndexedDB read/write serialization | REQUIRED: browser storage isolation |
| Memory scoped query clone | REQUIRED: in-memory store would otherwise alias callers |
| IndexedDB scoped repository clone | REDUNDANT: IndexedDB already returns owned values |
| Worker message clones | REQUIRED ownership boundary: source/records cross threads; export returns a string |

`WorkspaceImportSession` privately retains the validated source in its local Worker across bounded CAS retries.
The execution boundary deeply freezes each completed append and registers its exact object identity
in a private WeakSet. Storage consumes that capability once. No boolean, symbol field,
copied record, or caller-provided cast bypasses public validation. Runtime row identity,
active-Formula requirements and meta-update checks still run for every append. Shared
snapshots cannot be mutated between validation and transaction creation.

There is no persistent verification cache, shared mutable DTO cache, or validation result
accepted from another tab. The full revision chain, composition fingerprint, and checkpoint
hash are still cryptographically verified. Historical hashes are not rewritten.

## Storage and UI

Database v4 adds only non-unique `parentFormulaId` indexes to `versions` and `experiments`.
No store is replaced and no record is rewritten. IndexedDB automatically populates indexes
for existing v3 records. Fresh databases create them too. Scoped repository queries use
index.getAll; coherent workspace reads use index cursors inside the same readonly
transaction. A deliberately explicit scan fallback supports an adapter lacking the index.

The Experiment list no longer reads/clones unrelated Experiment histories. Time Machine
uses the same scoped Version API. The Formula list refresh still reads Formula records,
but never loads nested Version/Experiment histories. No global state library was added.
Transaction collision checks, meta CAS, all-or-nothing writes, and abort handling are
unchanged. Preparing records is outside the transaction; inserts remain in one transaction.
Request creation is batched in groups of eight. The pending final request in each group
queues the next group from its success callback, keeping the same transaction alive while
allowing the event loop to run between groups. Meta is written in that same transaction.

An additional CPU profile of reopening a large notebook identified the startup orphan
reconciler's `versions.listAll()` as an unrelated full-snapshot read. It now scans unique
parent keys and batches their primary keys, not snapshot values. This also avoids one
asynchronous cursor callback per Version. A store-key comparison and individual reads for
unindexable legacy records preserve orphan handling for records absent from the index.
The public full-history list API remains available for consumers that need content.
The timeline now reuses an Intl.DateTimeFormat per language rather than constructing one
for each row on each render. Profiling showed repeated date formatting on its hot path.

## Worker decision and measurement caveats

The first optimized pure-path probe measured load+validation+crypto 243ms, remap 65ms,
and export CPU work 189ms. Initially this supported keeping processing on the main thread.
Later repetition under slower execution measured main-thread tasks up to 890ms (import)
and 705ms (export), despite acceptable total durations. A second feasibility measurement
found load 785ms, remap 330ms, export CPU 524ms, structuredClone 420ms, and a real local
Worker echo round-trip 737ms. Crucially, the synchronous postMessage send occupied the
main thread for only 152ms. Responsiveness, rather than shortest total wall time, justified
the final Worker implementation.

`workspace.worker.ts` is bundled as a same-origin module asset, without server processing,
remote imports, or content logging. It owns validation, provenance, remapping, and compact
serialization. Main owns UI/flush, coherent IndexedDB reads, identity proposals, collision
checks, the atomic write transaction, and download. Existing preparing/importing status is retained.
Each operation disposes its Worker on success or failure. Startup errors, error/messageerror,
pagehide, explicit disposal, and a 120-second upper bound terminate pending work. Stable
error categories cross the message boundary; no worker error can authorize partial writes.
Without Worker support, the same pure processor provides the memory/test compatibility path.
Long-task telemetry is scoped to each actual UI action; semantic comparison and full Backup
inspection are performed outside those windows. CPU profiling and uninstrumented timing
are separate. Browser/device load and cold development module compilation affect wall time.

`workspaceProfile.ts` supplies opt-in local stage durations only. It records no Formula
content or identifiers and sends no analytics/network requests. By default no observer runs.

## Reproduction and evidence

- `node scripts/workspace-profile-qa.mjs`: CPU sampling/primitive costs (intended baseline capture).
- `node scripts/workspace-worker-feasibility.mjs`: pure-path/clone comparison.
- `node scripts/workspace-performance-qa.mjs`: 10 UI imports, 10 UI exports, isolated
  long-task windows, full semantic comparison, and 1/10/+50 query scale.
- `node scripts/workspace-browser-qa.mjs`: UI/legacy/Backup/Drop/response matrix.
- `node scripts/workspace-concurrency-qa.mjs`: two-tab races, CAS, quota injection, tab-close abort.
- `node scripts/workspace-production-smoke.mjs`: built application smoke.

Local JSON and CPU-profile evidence is under ignored `.qa/workspace/`.

## Final production repetition (Worker enabled)

Ten actual UI imports and ten actual UI exports of the same large fixture:

| Operation | Min | Median | Max | Maximum main-thread long task |
| --- | ---: | ---: | ---: | ---: |
| Export | 2,403ms | 2,599ms | 2,890ms | 170ms |
| Import | 2,255ms | 2,330ms | 2,602ms | 386ms |

At ten large workspaces: Experiment list 714ms; Time Machine 645ms.
After another 50 small UI imports and a cold page reload: Experiment list 574ms;
Time Machine first opening 1,712ms, with a 145ms maximum long task in that window.
That remaining cold-start wall latency should be checked in final acceptance; it is not
a multi-second main-thread freeze. Timing includes Playwright interaction/visibility waits.

Real Chromium v3 -> v4 migration preserved active/Archive Formula records, 220 Versions,
30 Experiments, settings, and meta. Its post-upgrade export equaled the source file except
exportedAt, and a subsequent UI import succeeded. The unit migration test also restores and
compares the full Backup, including settings/meta.

## Final verification

After the final invalid-date compatibility fix, `npm test -- --run` passed all 112
test files: 840 tests passed and one existing test skipped. `npm run build` passed;
the existing large-main-chunk warning remains. The rebuilt production smoke passed
UI import/export, Time Machine, Experiments, Worker disposal and error handling.
Browser regression covered 34 checks; concurrency regression covered eight checks.

The final development run also checked ten large workspaces plus 100 small ones.
Scoped Experiment/Version/coherent-read timings were 271/95/417ms versus 222/77/391ms
for one large workspace, preserving 30 Experiment and 220 Version results. Development
maximum long tasks were 608ms export and 537ms import; production results above are
the release-facing measurements, not a guarantee for every device or development mode.

A fresh development-server CPU capture (`profile-current.json`) retained the original
before evidence and confirmed Worker stage reporting: JSON parse 42ms, shape projection
90ms, initial graph check 1.7ms, source provenance 4.4ms, remap 7ms, final graph 1ms,
final provenance 3.5ms, ownership sealing 22ms, and storage preparation 0.1ms.
These instrumented single-run timings are diagnostic and are not substituted for the
ten-run production comparison. File text read was 59ms in that capture.

Assessment: PASS WITH CONDITIONS; PERFORMANCE BLOCKER RESOLVED for the tested fixture.
Next: RE-RUN FINAL ACCEPTANCE, including cold Time Machine latency and slower devices.
No commit or push was made.
