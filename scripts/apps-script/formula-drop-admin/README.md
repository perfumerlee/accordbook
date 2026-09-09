# Accordbook Formula Drop Admin — Phase 1

This standalone Apps Script project initializes the separate operational workbook for Formula Drops. It does not contain a Web App UI or `doGet`/`doPost` endpoint yet.

## Operator setup

1. Create a new Google Spreadsheet named `Accordbook Formula Drop Operations`.
2. Do not use the existing spreadsheet that contains `PaidFormulaLicenses` or `PaidFormulaConfig`.
3. Copy the new Spreadsheet ID.
4. Create a new standalone Apps Script project named `Accordbook Formula Drop Admin`.
5. Add `FormulaDropAdmin.gs` to that project.
6. Add this Script Property:

```text
FORMULA_DROP_SPREADSHEET_ID=<spreadsheet-id>
```

7. Set the Apps Script project timezone to `Asia/Seoul`.
8. Set the Spreadsheet timezone to `Asia/Seoul` under Spreadsheet → Settings → Time zone.
9. Run `initializeFormulaDropSheets()` and complete Google authorization.
10. Verify that the workbook contains exactly these operational sheets:

```text
FormulaDrops
FormulaDropEvents
```

11. Verify header Notes, frozen row 1, filters, validation, and Plain Text handling for `publicAccessLast4` and `publicAccessPin`.
12. Verify that no `PaidFormulaLicenses` data exists in this workbook.

The initializer is fail-safe for non-empty sheets with mismatched headers. It does not rewrite, move, or delete production data.

## Phase 6 — private read-only dashboard

`FormulaDropAdmin.gs` and `Dashboard.html` also provide a read-only HtmlService Web App. Deploy it as a Web App restricted to the owner/operator or explicitly authorized Google accounts. Anonymous access must not be enabled. The dashboard reads only `FormulaDrops` and `FormulaDropEvents`, aggregates metrics server-side, and never returns PINs, file URLs, license IDs, or visitor/session/event ID lists. It has no write, status, revoke, export, or scheduler actions. Verify the restriction with an incognito/logged-out browser before production use.

## Phase 7A — private Drop management

The private Admin Web App can create DRAFT Drops, edit permitted fields, schedule, activate, return SCHEDULED Drops to DRAFT, and mark ACTIVE Drops EXPIRED. These actions use `google.script.run`, server-side validation, Script Lock, and `updatedAt` conflict checks. They only modify `FormulaDrops`; they never modify `FormulaDropEvents`, `PaidFormulaLicenses`, or the Licensed Formula Registry. `END DROP` changes only the Drop status and does not revoke the underlying License. Before activation, the operator must manually confirm that the packageId, asset, public credentials, and Paid Formula License are correct.

## Phase 7B-2A — private License status bridge

Drop Detail can read the connected Licensed Formula status through a server-to-server request to the Paid Formula Registry. The Admin project reads `FormulaDrops.licenseId` and calls only `admin-license-status`; it never opens the Paid Formula Spreadsheet directly and never calls `admin-revoke`.

Configure these Script Properties in the Formula Drop Admin project only after the code has been deployed and reviewed:

```text
PAID_FORMULA_REGISTRY_ADMIN_URL=<deployed-registry-web-app-url>
PAID_FORMULA_ADMIN_SECRET=<GENERATE_A_HIGH_ENTROPY_SECRET>
```

Use the exact same high-entropy secret in the Paid Formula Registry project. Generate at least 32 random bytes locally or with an operator-approved password generator. Never commit or paste the secret into browser code, a Sheet, a URL, or this repository. HMAC signing is intentionally deferred in v0.01; the bridge uses the shared secret over HTTPS.

The browser receives only `active`, `revoked`, or a normalized unavailable/configuration result. It never receives the Registry URL, packageId, or Admin Secret. The Dashboard Home does not perform Registry calls; status is loaded only when Drop Detail opens or when the operator clicks `상태 새로고침`.

## Phase 7B-2B — Close & Revoke

`CLOSE & REVOKE`는 ACTIVE Drop에서만 사용할 수 있습니다. 확인 창에 Drop ID를 정확히 입력하면 Admin 서버가 먼저 Drop을 EXPIRED로 확정하고, Script Lock을 해제한 뒤 Paid Formula Registry의 `admin-revoke`를 호출합니다. Registry 호출 중에는 Lock을 점유하지 않습니다.

Drop 종료가 성공한 뒤 Registry revoke가 실패하면 상태를 되돌리지 않습니다. 화면에는 partial 상태를 표시하고, EXPIRED Drop에 표시되는 `REVOKE LICENSE`로 재시도할 수 있습니다. DRAFT/SCHEDULED에는 revoke 동작이 없습니다.

브라우저는 licenseId나 Secret을 보내지 않고 dropId와 확인용 Drop ID만 보냅니다. Registry Secret은 Apps Script Script Properties에만 있습니다. revoke는 되돌릴 수 없으며, 이미 정상 Import된 로컬 Formula를 삭제하지 않습니다. 기존 `END DROP`은 계속 Drop만 종료하고 Licensed Formula를 revoke하지 않습니다.
# Shared license policy on save

Registry `accessMode` values are `standard` (5 failures / 30 minutes) and
`shared` (10 failures / 5 minutes). Export initially registers standard.
Saving a Drop with a licenseId, scheduling, or activating confirms shared through
the server-only `admin-set-shared` Registry action before writing the Drop.
Blank Drafts require no Registry connection. Existing shared mode is idempotent.
Policy confirmation failure blocks local save and reports license_policy_not_confirmed.
The Admin Script Lock covers validation, remote confirmation and local write so
another Admin save cannot change the mapping during this operation. Slow Registry
requests can therefore delay other Admin mutations.

The two projects do not share a transaction: a remote timeout or subsequent local
write failure may leave the License shared even if the Drop was not saved. Reopen
and retry; there is no automatic rollback to standard. Removing a license mapping
or ending a Drop does not reset its mode. END DROP and revoke semantics are unchanged.
Update Registry first, then replace the entire Admin GS/HTML files and deploy.
The operator migrates old Registry modes to standard; old names are unsupported.
The encrypted file's accessMode is a separate file-format marker and is unchanged.
