# AI notebook surfaces

`src/components/aiNotebookDesign.css` owns the visual rules for Formula AI Review,
Experiment AI Compare, AI Next Round, and the global Experiment Review History.
Their component styles retain layout and state visibility. The shared stylesheet
is imported after component imports in `src/main.tsx` and scoped to `ai-notebook`.
Use `ai-panel` for the panel surface. Do not add isolated button/font overrides
to fix one AI screen; inspect the equivalent state on all four surfaces.

## Visual rules

- Warm notebook paper, restrained brown rules, no extra shadows or orange frames.
- Serif reading text at 14px with 1.75–1.8 line height; 18–20px panel headings.
- Consistent UI font for controls in both KO and EN. Metadata stays at 12px.
- Controls: 40px desktop, at least 44px below 768px, 13px labels. Close uses an
  icon with an accessible localized name. Preserve visible keyboard focus.
- Active setup/history tab connects to the content with a paper-colored edge.
- Token inputs and their buttons align on one row when space allows.
- Long review previews use three lines. Full saved content remains in detail.
- History actions sit below the copy, aligned right, with equal mobile widths.
- Result paragraphs have a bounded reading width; responsive cards never force
  action labels into vertical single-character columns.
- Hover transitions respect reduced-motion preferences.

## Browser verification

Run `node scripts/qa-ai-design.mjs` from the repository root (Playwright Chromium
required). It starts an isolated loopback Vite server on port 5187, mounts actual
components with synthetic in-memory records, and blocks external browser requests.
Three provider responses are fulfilled by Playwright; no provider is contacted.
It checks KO/EN at 360, 390, 768 and 1440px, control heights, horizontal overflow,
setup/history/detail and mock execution/result states. No production storage is
read or changed. Screenshots and a JSON report are written to the OS temporary
directory `accordbook-ai-design-qa`, or `AI_DESIGN_QA_OUTPUT` when set.

Fixtures live in `scripts/fixtures/ai-design` and are not imported by the app.
This is component-level visual QA; it does not assert production deployment.
