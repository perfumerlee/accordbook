# Paid Formula Registry — Phase 7B-1

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
