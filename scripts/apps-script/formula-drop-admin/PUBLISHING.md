# Public Archive / Social Preview publishing

Deploy `FormulaDropPublisher.gs` **in the same private Apps Script project** as
`FormulaDropAdmin.gs`, with the updated `Dashboard.html`. Never install the publisher
in the public read/download project. Existing Save/status/licensing behavior is unchanged.

## Operator configuration (not performed by implementation)

1. Review/deploy the repository's v0.01 archive build first: JSON validation, static
   routes, AUTO/CUSTOM OG and sitemap generation must be on main before publication.
2. Keep Admin restricted to owner/authorized operators. Existing HtmlService
   deployment identity is the authorization boundary, not a new browser login.
   Script project editors can access ScriptProperties: trust every project editor.
3. Create a **fine-grained PAT**, resource owner `perfumerlee`, selected repository
   **accordbook only**, **Contents: read and write** (Metadata read is implicit).
   No Actions/Workflows/admin permission is needed. Set expiration and rotate/revoke
   through GitHub. Never paste the token into Dashboard, Sheets, URL, source or logs.
4. Add these **Script Properties**:

   | Property | Value |
   | --- | --- |
   | `FORMULA_DROP_GITHUB_TOKEN` | operator-created secret, server only |
   | `FORMULA_DROP_GITHUB_OWNER` | `perfumerlee` |
   | `FORMULA_DROP_GITHUB_REPO` | `accordbook` |
   | `FORMULA_DROP_GITHUB_BRANCH` | `main` |

5. Authorize spreadsheet/external-request scopes when deploying the updated private
   script. Never broaden web-app access to anonymous users.
6. Check main branch protection/rulesets before a real publish. Required PRs,
   signatures or checks can reject direct commits. **Do not disable protections or
   grant bypass**: that requires a separately reviewed PR publishing strategy.
   Non-main configuration is disabled because the existing workflow is main-only.
7. Confirm `.github/workflows/deploy.yml`, Pages permissions/environment, and the
   `VITE_FORMULA_DROP_PUBLIC_API_URL` repository variable. PAT commits use the normal
   main push workflow; no extra dispatch or workflow credential is introduced.

GitHub references: [tree/base_tree behavior](https://docs.github.com/en/rest/git/trees#create-a-tree),
[non-force reference updates](https://docs.github.com/en/rest/git/refs#update-a-reference).
Contents permission is repository-wide (not GitHub path-scoped); server code additionally
constrains paths. A read-only unauthenticated branch API check on 2026-09-12 returned
`main`, `protected: false`. This is not a test of the operator's future PAT permissions
or a guarantee that repository rules cannot change; review them again at setup.

## Daily operation

Create/edit → Save → activate (or wait for scheduled public start) → Admin Drop detail
→ PUBLIC ARCHIVE / SOCIAL PREVIEW → explicit Publish/confirmation → commit → Actions
→ check the public page. Ordinary Save/activate/schedule/end never publishes.

- AUTO is default; no image upload or manual OG design. Preview is an HTML/CSS
  approximation of **saved** title/subtitle, not the final renderer. Edit/save text
  first and return to preview.
- CUSTOM PNG: **5 MiB** maximum, at least **600 × 315**, at most **40 MP**, no animation.
  Selection stays in page memory; navigating/reloading discards it. Upload occurs
  only at confirmed Publish. Select only content intended to become public.
- Existing CUSTOM preview uses the public repository image at the checked commit.
  A private repository will not support this unauthenticated image URL. Never put a
  token into a preview URL; this configuration assumes the public Accordbook repo.
- AUTO → CUSTOM creates `og-source.png`; replacement updates it; CUSTOM → AUTO
  deletes the source (recoverable in Git history). There is no archive-delete action.
- Only currently public or expired Drops with title/description are publishable.
  Draft/future scheduled content cannot leak early. Expiry stops downloads under
  existing rules; the published archive remains. Third-party caches may retain it.
- Updates use existing edit permissions → Save → Publish again. A `2026-002` AUTO
  publish creates `public/formula-drops/2026-002/drop.json`; build generates its
  route, OG and sitemap entry without any manual JSON/route/image/sitemap edit.

## Data contract and safety

Server reloads the Sheet and allowlists `slug`, `title`, `subtitle`, `description`,
valid `expiresAt`. It does not invent dates. Existing public optional `summary`,
`publishedAt`, `updatedAt` are preserved. Unknown/private repository JSON fields fail
validation. No file paths/URLs, license IDs, accessName/Last4/PIN, customer data,
private parts/CAS or admin DTOs are copied. Operators must still review public prose:
an allowlist cannot recognize a secret pasted into a description.

Only these server-constructed validated paths can change:

- `public/formula-drops/<YYYY-NNN>/drop.json`
- `public/formula-drops/<YYYY-NNN>/og-source.png`

Client sends mode, optional PNG base64, checked head and Sheet revision: no arbitrary
path, JSON, token or commit message. Image bytes never enter Sheets, ScriptProperties,
localStorage or logs. Server verifies PNG signature/chunk CRC/bounds/dimensions;
build performs final image decoding and 1200 × 630 center-crop normalization.
Malformed compressed image data can still fail final decoding: inspect Actions.

## Atomicity, errors and status

Read head → base commit/tree → read sources at immutable head → required blobs →
tree with `base_tree` → **one commit** parented to checked head → ref update with
**force:false**. JSON/image changes appear together, unrelated files are inherited,
and no dist file is committed. Script lock serializes Admin mutations; human GitHub
changes cause non-fast-forward rejection. Refresh/review before an explicit retry.
Failed ref updates may leave unreachable Git objects, not partial branch changes.

- NOT PUBLISHED: no JSON at checked head.
- SYNCED: semantic JSON equality independent of key order; mode from source presence.
  This means repository synchronized, **not live deployment confirmed**.
- CHANGES NOT PUBLISHED: saved public text differs or local mode/image changed.
- PUBLISHING: request in flight; repeat click disabled.
- PUBLICATION REQUESTED: branch update succeeded; Actions/deploy still must pass.
- ERROR: safe message; refresh before retry, especially after uncertain network errors.
- NOT CONFIGURED: setup missing; normal Admin remains usable.

Auth/rate-limit/network/image/conflict failures never change Sheet/licensing. A lost
response after ref update might still mean success: status refresh is authoritative.
Identical sources do not create a new commit. No automatic conflict retry/force push.

## Validation / first live check

Run `npm test -- tests/formulaDropPublisher.test.ts tests/formulaDropArchive.test.ts tests/formulaDropRoutes.test.ts`,
`npm test`, `npm run build`, `git diff --check`. Unit tests use mocked Apps Script/GitHub;
they never perform remote writes.

After operator configuration, verify an authorized first AUTO publish in the real
Admin: one commit touching only allowed paths, Actions success, archive direct
refresh, final OG size. Test CUSTOM transitions only on an operator-approved Drop.
Do not claim live verification from mocks. Social previews may remain cached after
deploy; use platform re-scrape tools or allow expiry. Canonical URLs stay unchanged.
