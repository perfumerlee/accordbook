# Licensed Formula buyer import

This is the buyer-import step following seller registration (called Phase 2 in the latest request).

## Deploy

Replace the Apps Script source with `scripts/apps-script/PaidFormulaRegistry.gs`, then update the existing web app deployment to a new version. Keep the existing deployment URL. No sheet header changes are needed. Keep SELLER_TOKEN and PIN_PEPPER unchanged. Sheet configuration changes alone do not require redeployment; this script code update does.

## Buyer flow

Import formula → choose the Licensed `.accordbook` file → enter buyer name, last four phone digits and six-digit PIN → server verifies active status and HMAC → local AES-GCM decryption → existing Formula import lifecycle.

PINs retain leading zeros and are not stored in the sheet or browser storage. The official app requires connectivity and does not import after failed verification. Apps Script receives only package ID and entered credentials, not Formula contents. Per-package failed verification attempts are limited using Apps Script cache (10 attempts, 15-minute cache TTL). Cache is best-effort and may be evicted; this is not a durable lockout mechanism.

## Limits

The existing offline-credentials-v1 package derives its encryption key from buyer credentials. Server verification in the official app does not prevent standalone decryption by someone with those credentials. Revocation prevents subsequent official imports, not use of already imported Formula data. Imported contents remain normal local editable Formula data, including ordinary export and backup. This is not DRM or server-held-key encryption.

## Deployment QA

After redeploying Apps Script, test a newly issued file with a synthetic buyer: successful import, incorrect PIN, revoked status, offline failure, cancel, duplicate submit, and reload persistence. Check desktop and phone input. Do not use real customer credentials in logs or screenshots. Local tests mock Google services and cannot prove deployed web-app access or CORS behavior.
