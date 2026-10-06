# AI-1C local mock integration

This phase has no OpenAI dependency, paid model, deployment, shared token, or production enablement.
The production Notebook mounts the isolated panel after the backup reminder and before the Formula table.
Only `AccordbookNotebook.tsx` and `.env.example` are modified existing files.

## Local use

Start the separate AI-1B backend with its documented loopback Firestore emulator and explicitly allowed development origin.
Set public frontend configuration in the local development shell:

```powershell
$env:VITE_AI_ENABLED='true'
$env:VITE_AI_ENDPOINT='http://127.0.0.1:8080/v1/ai/formula-review'
npm run dev
```

Use the exact origin printed by Vite in the backend DEV_ORIGINS setting (including scheme and port).
Only loopback endpoints with the exact route, without credentials, query or fragment, are accepted.
The feature is disabled unconditionally in production builds during AI-1C.
Never put a token in an environment variable prefixed VITE_, a URL, configuration file, or source.

Open AI REVIEW, read and accept disclosure, supply an individually provisioned local development token in the masked field, and press Execute Review.
Entering a token does not authenticate or transmit it until an explicit review request.
Closing the panel, clearing the token, or changing Formula clears the token and results.
The acceptance harness below provisions only random emulator accounts and keeps raw tokens in process/browser memory.
No production issuance flow is provided in this phase.

## Ownership and request semantics

The panel receives the latest active React Formula as a read-only prop; no storage or write callback is supplied.
The existing AI-1A builder is unchanged. A deferred execution captures the latest committed editing state after blur;
it does not flush autosave or provenance. IME composition must finish before execution.
The builder freezes the projected DTO. Name and Notes default off.
Backend operational limits (positive total, 200 rows, bounded text and 64 KiB request) are checked separately without changing AI-1A.

A local sequence + Formula ID + content/selection marker owns each request. This marker is never transmitted or stored.
Changes invalidate/abort the current operation; late responses are discarded. Completed results are labeled stale after edits.
The Notebook keys the boundary by Formula ID, which unmounts the previous panel on switching or removal.
Disclosure storage contains only version 1 and an ISO acceptance timestamp; unavailable storage falls back to memory.
All requests use a new UUID v4, bearer authentication, omitted credentials, no-store cache and no redirects.
Responses are limited to 64 KiB and strictly validated, then rendered as React text.
There is no retry, replay cache, Core write, AI analytics, result persistence, or Workspace mutation lock.
Browser cancellation cannot undo backend reservation or usage.

## Reproducible verification

Prerequisites: frontend dependencies/browser, compiled unchanged AI-1B sibling repository, and a running loopback Firestore emulator.
The scripts use fresh demo projects and fresh browser profiles. They never use the user's browser data.
Ports 5183, 5184 and 8086 must be free.

```powershell
npm test
npm run build
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8085'
# Optional: AI_QA_BACKEND overrides the sibling repository path.
# Optional: AI_QA_OUTPUT selects an artifact directory; default is ignored .qa/workspace/ai.
node scripts/ai-mock-qa.mjs
node scripts/ai-disabled-qa.mjs
```

Run browser scripts sequentially because they share port 5183.
The mock harness imports the backend's existing compiled application, real authentication, CORS and transactional Firestore quota store.
It injects only test runner behaviors (delay, invalid result, inert HTML text) and explicit test configuration.
It does not change backend files or weaken authentication/security.
The disabled harness serves the production build, using dev modules only for synthetic fixture setup/inspection and a separate boundary probe.

Coverage includes exact outgoing HTTP DTO/canaries; separate opted-in text; auth/revocation/expiry/rate/quota/duplicate;
body timeout and abort; latest pre-autosave edits; CAS blur; IME; stale/switch/close handling;
HTML-as-text; Core and Backup deep equality plus zero idle writes; equal normal-versus-AI autosave write counts;
production-disabled Workspace export/import, Time Machine, Experiments and editing; isolated render failure/no Formula.
Responsive measurements cover 1440×900, 1920×1080, 1180×820, 1024×768, 820×1180, 768×1024,
430×932, 390×844, 375×812, 360×800, 1199×900, 1200×900 and 767×1024.
Each size checks result and token/error/disabled layouts; 768×1024 supplies the other boundary side.
Screenshots and metadata-only JSON reports go to AI_QA_OUTPUT.

Privacy comparisons account for existing Core localStorage entries, including the active Formula ID.
AI does not remove existing Core storage; it adds only the disclosure metadata.
Raw requests/results/tokens are not written to acceptance reports or logs.
The deliberate render-failure probe produces React's normal development diagnostic with a fixed synthetic error, not user/provider data.

## Acceptance limits

Local mock acceptance is not production authorization. Real model quality, billing, cost controls, cloud IAM/deployment,
production token issuance and production endpoint configuration remain outside AI-1C.
The mock backend still retains its original no-result-replay semantics.
Existing Vite large-chunk warnings and dev public-asset import warnings are unrelated to AI integration.
