# Direct Formula Drop handoff

The primary detail action navigates to `/?from=drop&drop=DROP-YYYY-NNN`. Only canonical IDs enter the resolver; the previous `YYYY-NNN` download-guidance links retain their manual flow. Arbitrary package URL query parameters are never read.

The dialog prepares a normal Formula package and requires confirmation. Both local file import and handoff converge on `finishFormulaImport` and `importFormula`. Successful handoff removes only `from` and `drop`, preserving other query parameters and the hash. Reload before confirmation safely restarts preparation. Each confirmed repeat creates a new Formula, matching existing import behavior.

Handoff language uses saved Drop session language, then saved Drop language, then the notebook language. It never updates core language settings. Errors offer the existing download service. Invalid IDs link to the Drop index.

The resolver permits only HTTPS accordbook.org static .accordbook assets under the matching Drop directory. Redirects are disabled. HTTP failures, malformed JSON/Formula rows, paid types and responses over 16 MB are rejected. Apps Script buffers UrlFetch responses before the application size check; the allowlist constrains that fetch. The browser additionally streams and bounds resolver responses (32 MB envelope, 16 MB package text).

Analytics emits the four requested handoff events and existing import_attempt/import_success/import_failed with source=direct_handoff. Existing dashboard source groups and Import totals therefore include direct imports. Click events use keepalive during navigation.

## Deployment precheck (not executed)

- Deploy the public Apps Script resolver/event contract before enabling the client CTA in production.
- Update existing FormulaDropEvents eventType validation with the new admin event list; changing source alone does not migrate a live Sheet validation rule.
- Publish the corrected free DROP 001 asset and verify the configured row points to that exact accordbook.org asset, is active, and has the matching title. Remove legacy free-Drop license/access configuration through an approved operator migration; existing admin activation rules still reflect the legacy licensed workflow.
- Verify live CORS, resolver availability, cache freshness and raw events/dashboard counts. Local QA mocks external requests and does not test live deployment.
- Run `node scripts/qa-drop-direct.cjs` against the local HTTPS Vite server on port 5178 for the three viewport scenarios.

No deployment, commit, push, live registry operation or spreadsheet mutation is part of this implementation.
