# Paid Formula Registry — Phase 7B-1

## Shared Formula Drop lock policy

Registry row `accessMode` selects the policy: `standard` uses
5 failures / 30 minutes; `shared` uses 10 failures / 5 minutes.
Counts remain shared by packageId, not per visitor. A successful verification
clears the count. After a Drop lock expires, its next attempt starts a fresh
10-attempt allowance. An existing lock is honored until its recorded expiry.
Revoked licenses still cannot verify.

New exports always register as `standard`; there is no export policy selector.
Saving a Drop with a licenseId calls the private `admin-set-shared` action.
Only Admin-secret authentication can select shared; verify request fields
cannot override the stored policy. Retrying registration cannot change modes.
The encrypted `.accordbook` file retains `offline-credentials-v1`; its format,
credentials, and packageId are unchanged. Registry mode is an operational policy.

Operator migration: change old Registry accessMode cells to `standard` as planned,
then replace the entire PaidFormulaRegistry.gs and deploy a new version of its
existing Web App. Replace the entire FormulaDropAdmin.gs and Dashboard.html in
the Admin project and deploy it. Old Registry mode strings are NOT supported;
verification fails closed until migrated. Coordinate migration and deployment
during a maintenance window. No live rows are migrated by this implementation.
For existing editable Drops, reopen Edit and save to confirm shared; scheduling
and activation also ensure shared. Empty Draft creation makes no remote request.
Expired Drops are not edited or automatically migrated. If an existing expired
Drop needs a policy change, handle it separately; never reactivate it for migration.
Do not change status, PIN/verifiers, packageId, or lock counters. No file re-export
is required. Publish the frontend update to remove the prior export selector.

`admin-set-shared` accepts packageId and adminSecret in the POST body. It uses a
Script Lock, rejects missing/duplicate package IDs, requires active status and a
standard/shared mode, writes only accessMode and confirms the persisted cell.
Already-shared requests are idempotent. Revocation and existing locks are unchanged.

The Paid Formula Registry remains the only owner of `PaidFormulaLicenses` mutations.

## Private Admin actions

The Registry Web App accepts these server-to-server actions:

- `admin-license-status`
- `admin-revoke`

Both require the Script Property:

```text
PAID_FORMULA_ADMIN_SECRET=<GENERATE_A_HIGH_ENTROPY_SECRET>
```

Use a high-entropy random value of at least 32 random bytes. Never commit it,
place it in a URL, or expose it to browser code. The same value will later be
configured in the Formula Drop Admin project. Phase 7B-1 intentionally uses a
shared secret over HTTPS; HMAC/timestamp signing is deferred.

`admin-revoke` is idempotent:

```text
active  → revoked
revoked → already_revoked
```

It changes only the `status` cell. It does not delete the row, regenerate
credentials, change failed-attempt counters, or affect already imported local
Formulas. Unknown or duplicate package IDs fail safely.

Existing browser actions remain unchanged:

- `register`
- `verify`
- `lock-status`

Do not call the private actions from the React client. They are intended for a
future server-to-server request from Formula Drop Admin using `UrlFetchApp`.
