# Workspace Phase 7B — final acceptance

## Scope and method

Production output is served at the local HTTPS preview origin. Every acceptance context
uses an isolated browser profile; no personal notebook is modified. The original
11,139,355-byte Phase 7 fixture is unchanged (75 Current rows, 200 manual Versions,
20 restore points, 30 Experiments, 540 Variants, 360 Branches, 540 Evaluations and
300 original provenance revisions). Import adds its expected provenance event.

The normal fixture has 30 materials, 20 manual Versions, three restore points,
three Experiments, 24 Variants (including six Branches), and 24 Evaluations.

`workspace-final-acceptance.mjs` tests five normal exports/imports, five large exports,
ten large imports (first five timed), clean-context semantic equality, duplicate IDs,
1/10/+50 query isolation, five cold/warm Time Machine openings, Worker lifecycle and
fallback, and separate provenance tampering. Production UI and Worker assets are
loaded from dist. Explicit test-fixture/inspection imports alone use the development
server; they run outside operation timing windows. Long tasks and animation-frame
progress are observed in the main thread. No thresholds are inserted into unit tests.

`workspace-browser-qa.mjs` is also run against dist, with the same explicit helper
routing, for actual Compare/Sheet/Composition/Make Batch, BASE/Branch/Evaluation,
draft barriers, Backup, legacy/protected/Drop flows and responsive layouts.

`workspace-migration-acceptance.mjs` seeds v3 before the production app starts,
compares every key/value in all six stores, then exercises the migrated UI and Backup.
`workspace-cold-acceptance.mjs` separately instruments IDB queries, Version sorting,
date formatting, click-to-DOM/paint and Chrome script/layout/style durations.
These diagnostic timings must not be conflated with pure React render duration.

## Concrete defects corrected

Phase 7A classified every file inside a Workspace Worker before dispatching legacy or
Licensed content to its existing parser. A Worker startup failure therefore blocked
otherwise valid legacy imports and the Licensed dialog. Phase 7B parses the JSON
envelope once on the main thread, immediately routes legacy/protected content, and
sends Workspace objects to the Worker for full validation. No Workspace shape,
graph, cryptographic or size checks are removed. Worker validation errors retain
the existing actionable UI categories. Two focused regression tests prove that
legacy/protected routing never constructs a Worker, even when its constructor throws.

This is a narrow routing correction. No schema, provenance semantics, transaction
architecture, or feature redesign is included. Phase 7A's note that JSON parsing
happens in the Worker is superseded by this routing correction; heavy validation,
remapping, provenance and export serialization remain in the Worker.

The final Backup comparison also exposed omitted optional annotations: the existing
Backup normalizer discarded Current-row `memo` and Version snapshot `memo`/`marked`
fields carried by imported Workspaces. The normalizer now preserves valid strings and
booleans. A complete import→Backup→restore equality test covers both true and false
marks, annotations, all history and import metadata. This preserves fields within the
existing schema; no schema or Backup format change was made. The v3 QA Archive
fixture was corrected to omit a release pointer owned by a different Formula, and its
temporary legacy file now supplies its required notes field. Those were QA-data errors,
not application migration regressions.

## Evidence locations

All raw local evidence is under ignored `.qa/workspace/`:

- `final-acceptance.json`: production measurements and acceptance checks.
- `cold-acceptance.json`: five cold/warm diagnostic breakdowns.
- `migration-acceptance.json`: exact v3→v4 record preservation and Backup checks.
- `release-file-performance.json`: five production imports/exports using actual paths.
- `fallback-file-performance.json`: real-file Worker-unavailable measurement.
- `inline-input-performance.json` and `inline-input.cpuprofile`: injected-input diagnostic.
- `report.json`: production UI/regression and 14 responsive viewport results.
- `production-smoke.json`: standalone dist smoke with Worker cleanup/error mapping.
- `concurrency-report.json`: deterministic concurrent import/atomicity checks, if emitted by the concurrency runner.

## Verification boundaries

Physical Android and iOS devices are not verified. Licensed live registry and Formula
Drop live API are not verified; protected routing and mocked handoff are exercised.
Worker availability is expected in current mainstream browsers; actual module-Worker
loading is verified here in Chromium. See MDN's Worker constructor documentation:
https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker
No formal minimum browser-version matrix was found in the repository.

## Measured production results

All figures are milliseconds. Release large-file timings use real file paths, matching
Phase 7A's input method. Five samples per row except where explicitly stated.

| Scenario | Min | Median | Max | Max long task |
| --- | ---: | ---: | ---: | ---: |
| Normal export | 103 | 116 | 127 | 0 observed |
| Normal import | 143 | 147 | 162 | 0 observed |
| Large export, actual file path | 595 | 634 | 752 | 71 |
| Large import, actual file path | 874 | 980 | 1,076 | 184 |
| Time Machine warm | 174 | 198 | 205 | 115 |
| Time Machine cold, including intro | 2,759 | 2,817 | 2,963 | 156 |
| Experiments | 457 | 530 | 548 | 234 |

Normal Time Machine/Experiments single openings were 178ms/101ms. Large operation
animation frames continued; exactly one Worker was created per operation and zero
remained afterward. Fallback, measured once with a real file path, completed import
in 629ms (223ms long task) and export in 434ms (189ms long task). This does not promise
equivalent responsiveness on slower devices without Workers. Integrity results matched.

The initial inline-buffer Playwright import measurements were 5,506–5,738ms,
including a 3,001ms long task; the inline fallback measured 3,084ms. These outliers are
retained in `final-acceptance.json`. They are not silently dropped or mixed with the
file-path production measurements. A separate file-path rerun uses the same app,
fixture and UI and verifies the normal user file-selection path without transmitting
an 11MB inline payload through Playwright's injected file setter. Additional profiling
of that injected path is recorded separately.

The diagnostic CPU profile identifies the dominant anonymous callback (875ms sampled
self time) as a child of Playwright's injected `setInputFiles`, not the application
bundle. Its source creates file bytes with `Uint8Array.from(atob(file.buffer), ...)`
and constructs a DataTransfer before dispatching the application's input event. This
supports attributing the inline-only stall to the automation setter. The profiled run's
maximum task was 1,234ms; the earlier unprofiled 3,001ms outlier remains documented.

## Cold-start explanation

`IntroSplash` has an existing 2,800ms timer, and `main.tsx` sets `oncePerSession=false`.
The overlay intercepts the Time Machine click until it disappears on each reload.
This explains why Phase 7A's explicit one-second post-reload wait left roughly 1.7s
of apparent first-open latency. It is repeatable startup presentation, not an unrelated
history scan or a one-time JIT explanation.

A separate five-run diagnostic recorded:

- Version index read: 65–98ms, 220 results, always completed before the click.
- Instrumented preparation (Version sorting/date formatting): about 0.6–1.5ms in
  the opening interval; this is not a claim that every React preparation step is isolated.
- Actual click to completed DOM: 34–165ms (median 37ms).
- Actual click to a subsequent paint opportunity: 47–183ms (median 51ms).
- Chrome script CPU during the measured interval: 47–71ms.
- Style/layout CPU: 33–163ms (the 163ms first-run outlier is retained).
- End-to-end cold diagnostic wall time: 2,729–3,300ms, including intro and automation
  actionability waits. This diagnostic is distinct from the primary repetition table.

There is no evidence here requiring a Workspace architectural change. Startup animation
is left unchanged under the acceptance-only scope. It remains a visible limitation.

## Scale isolation

| Dataset | Version query | Experiment query | Experiment UI |
| --- | ---: | ---: | ---: |
| One large | 60 | 167 | 495 |
| Ten large | 63 | 195 | 536 |
| Ten large + 50 small | 56 | 216 | 546 |

Selected results remain 220 Versions and 30 Experiments. Cold Time Machine wall times
must not be compared directly with warm openings; the intro explanation above applies.

## Automated and UI regression

All 112 test files passed after both fixes: 843 tests passed, one existing skip, zero failures.
Production UI regression passed 34 checks, including 14 viewport sizes and breakpoint
neighbors. Deterministic concurrency QA passed eight checks. The valid/tampered
revision, fingerprint and checkpoint inputs produced matching Worker/fallback integrity
outcomes, with unchanged storage on rejection. Startup/runtime Worker errors cleaned
up and a subsequent valid import succeeded. Legacy v1/v2 and Licensed dialog routing
were additionally verified with a throwing Worker constructor.

Final migration QA passed exact key/value comparisons across all six stores before/after
v3→v4, then the actual Released Version UI, Workspace export/import, and complete
Backup replacement/restore equality. The final rebuilt production smoke passed without
page errors. Build succeeded with the pre-existing large-main-chunk warning.
`git diff --check` passed; only line-ending conversion notices were emitted.

## Final decision

READY WITH KNOWN LIMITATIONS. The complete Workspace feature should ship, with the
startup-intro wait, physical-device coverage and unverified live external services stated
separately. No release-blocking issue remains in the tested scope. The performance
blocker identified in Phase 7 remains resolved. No further performance redesign was made.

No commit, push, staging, or deployment is performed.
