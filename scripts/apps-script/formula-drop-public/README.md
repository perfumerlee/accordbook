# Accordbook Formula Drop Public API — Phase 2

This is a separate anonymous public event and read endpoint. It must not be merged with the Licensed Formula Registry or Formula Drop Admin Apps Script projects.

Phase 3 read actions are `list-drops` and `get-drop`. Their response is an explicit public projection containing only `dropId`, derived `slug`, `year`, `sequence`, `title`, `subtitle`, `description`, effective public `status`, `startAt`, and `expiresAt`. Draft and scheduled rows are never exposed. The public script does not return `fileUrl`, `fileName`, `licenseId`, public access values, credentials, or spreadsheet metadata. An ACTIVE row with missing or invalid operational dates fails closed; an ACTIVE row past `expiresAt` is presented as EXPIRED without mutating the Sheet.

The Phase 3 detail page sends one `view` event after a public Drop is successfully loaded. The `/drop` index does not send a view event. Download and import events remain future-phase behavior.

## Setup

1. Create a standalone Apps Script project named `Accordbook Formula Drop Public API`.
2. Add `FormulaDropPublic.gs`.
3. Add Script Property:

```text
FORMULA_DROP_SPREADSHEET_ID=<Accordbook Formula Drop Operations Spreadsheet ID>
```

4. Set the Apps Script timezone to `Asia/Seoul`.
5. Deploy as a Web App configured for anonymous public traffic according to the deployment options shown in the Apps Script UI. Do not assume a specific access label without verifying it in the UI.
6. Copy the deployed Web App URL and configure the deployment environment as:

```text
VITE_FORMULA_DROP_PUBLIC_API_URL=<web-app-url>
```

Do not commit the environment value. The URL is public and is not a secret.

## GitHub Pages route limitation

Formula Drop routes use a small `public/404.html` restoration fallback. A direct first request may initially receive GitHub Pages' 404 response before the browser is restored to the React entry point. This is a route-stability workaround, not true server-side 200 routing or perfect SEO. The fallback only handles `/drop` and strict `/drop/YYYY-NNN` paths; unrelated paths remain normal 404s.

## Manual browser integration test

Before Phase 3, create a temporary `DRAFT` row in `FormulaDrops` with `dropId` `DROP-2026-001`. In the browser DevTools console, replace the endpoint and run:

```js
const endpoint = 'PASTE_DEPLOYED_WEB_APP_URL_HERE';
const base = { action: 'event', eventId: 'evt_550e8400-e29b-41d4-a716-446655440000', dropId: 'DROP-2026-001', visitorId: 'v_550e8400-e29b-41d4-a716-446655440001', sessionId: 's_550e8400-e29b-41d4-a716-446655440002', eventType: 'view', source: 'manual_test', referrerHost: '', failureReason: '' };
const send = body => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) }).then(response => response.json());
await send(base);                 // { ok: true, accepted: true, duplicate: false }
await send(base);                 // { ok: true, accepted: true, duplicate: true }
await send({ ...base, eventId: 'evt_550e8400-e29b-41d4-a716-446655440003' }); // duplicate false; second row
```

Confirm that `FormulaDropEvents` contains two rows, not three. The endpoint must be called from a browser page served by `https://accordbook.org` before Phase 3 begins. Confirm that the same event ID is deduplicated while a new event ID for the same action is retained.
