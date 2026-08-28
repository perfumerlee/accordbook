# Accordbook v0.01 — Codex Development Specification

Repository: `perfumerlee/accordbook`  
Project: **Accordbook**  
Version: **v0.01**  
Target: GitHub Pages / Browser-based local-first web app  
Primary stack: **React + TypeScript + Vite + IndexedDB**  
Primary UI language: **English**  
Secondary UI language: **Korean**

---

# 1. Project Purpose

Accordbook is a minimal, notebook-inspired formula editor for perfumers.

The product should feel like a real perfumer's working notebook translated into a simple digital tool.

The core idea is:

> **A simple formula notebook for perfumers.**

The product must remain easy enough for beginners to use without reading a manual.

Do not turn v0.01 into an ERP, fragrance database, IFRA system, inventory system, AI assistant, or manufacturing management tool.

---

# 2. Core Product Principles

## 2.1 Local-first

Accordbook v0.01 must work without login, account creation, server database, or cloud sync.

User formula data must remain on the user's device.

Primary product message:

> **Private by default**  
> Your formulas stay on your device.

Use IndexedDB for production implementation.

Do not send formula data to any server.

---

## 2.2 Notebook-inspired UI

The visual direction is based on a real perfumer's handwritten experiment notebook.

Design keywords:

- Notebook-inspired
- Warm paper tone
- Ruled lines
- Perfumer's lab notes
- Structured formula sheet
- Quiet
- Tactile
- Minimal
- Practical

Do not over-design the interface.

The interface must feel like a working notebook, not a SaaS dashboard.

---

## 2.3 Beginner friendly

The primary workflow must be understandable immediately:

1. Create formula
2. Enter parts
3. Enter material
4. Reach total 1,000 parts
5. Optionally configure dilution
6. Add notes
7. Formula saves automatically

Avoid unnecessary settings or advanced controls in v0.01.

---

# 3. Fundamental Formula Rule

This rule is critical and must never be changed without explicit approval.

## Standard Accordbook Formula Rule

```text
1,000 parts = 10.00 g
1 part = 0.01 g
```

A formula is complete when the sum of all material parts equals:

```text
1,000
```

Example:

```text
Benzyl acetate     400
Linalool           150
Hedione            150
...
----------------------
TOTAL             1000
```

The percentage of each material is:

```text
Percent = parts / 10
```

Examples:

```text
400 parts = 40.0%
150 parts = 15.0%
15 parts  = 1.5%
1 part    = 0.1%
```

Batch weight:

```text
weight_g = parts × 0.01
```

---

# 4. Formula ID System

Every formula must have an immutable Formula ID.

Do not call it PAGE in the final implementation.

Display label:

```text
FORMULA ID
```

Korean:

```text
포뮬러 ID
```

## Format

```text
PREFIX-YYMM-XXX
```

Example:

```text
ACC-2608-001
ACC-2608-002
ACC-2608-003
```

Where:

```text
ACC  = user-defined Formula ID prefix
26   = year 2026
08   = August
001  = sequential number
```

## Important numbering rule

The demonstration/sample formula may use:

```text
ACC-2608-000
```

Real user-created formulas must begin at:

```text
001
```

Example:

```text
ACC-2608-000   sample
ACC-2608-001   first real formula
ACC-2608-002   second real formula
```

Deleted or archived IDs must never be reused.

Example:

```text
001
002
003 deleted
004
005
```

Do not generate 003 again.

---

# 5. Formula ID Prefix

Sidebar setting:

English:

```text
Formula ID prefix
```

Korean:

```text
포뮬러 ID 접두사
```

User may configure the prefix.

Example:

```text
ACC
YDO
LAB
JAS
```

Prefix rules:

- uppercase
- letters/numbers allowed
- optionally `-` or `_`
- maximum 12 characters
- changing prefix affects only newly created formulas
- existing Formula IDs must never change

Save button width must remain visually stable when language switches between:

```text
Save
저장
```

---

# 6. Formula Data Model

Use TypeScript interfaces.

Recommended model:

```ts
export interface FormulaMaterial {
  id: string;

  parts: number | '';

  material: string;

  cas?: string;

  marked?: boolean;

  dilution?: {
    enabled: boolean;
    percent: number;
    solvent: string;
  };
}

export interface Formula {
  id: string;

  formulaId: string;

  date: string;

  name: string;

  notes: string;

  rows: FormulaMaterial[];

  createdAt: string;

  updatedAt: string;

  archivedAt?: string;
}
```

Application settings:

```ts
export interface AccordbookSettings {
  formulaIdPrefix: string;
  language: 'en' | 'ko';
}
```

Do not store translated copies of user-entered data.

---

# 7. Formula Editor

Primary columns on desktop:

```text
Parts | Material | CAS / Ref. | Percent | Actions
```

## Parts

- numeric input
- integer based
- minimum 0
- browser/native step behavior
- `step=1`
- one increment/decrement = exactly 1 part

Do not add large custom +/- buttons.

The simpler number input concept from the early MVP is preferred.

---

## Material

Free text.

Examples:

```text
Benzyl acetate
Linalool
Hedione
Indole
DPG
```

User-entered material names must never be automatically translated.

---

## CAS / Ref.

Optional free text field.

Examples:

```text
140-11-4
78-70-6
24851-98-7
```

CAS is not validated against any database in v0.01.

---

## Percent

Calculated automatically.

Formula:

```text
percent = parts / 10
```

Display example:

```text
40.0%
15.0%
1.5%
```

Percent is preferred over grams as the primary right-side formula column.

---

# 8. Dilution

Dilution support is part of v0.01.

A material may be configured as a dilution.

Example:

```text
Indole @10% in ALC
Benzyl acetate @10% in DPG
```

## Important UI rule

Dilution state and dilution editor open/closed state are separate concepts.

The material row must always visibly show the dilution notation whenever a dilution is configured.

Example:

```text
Benzyl acetate @10% in DPG
```

The notation must remain visible even when the dilution editor is closed.

The `DIL` button only opens/closes the dilution editor.

It must not enable/disable or remove the dilution state once configured.

---

## Dilution notation

Use:

```text
@10% in DPG
@20% in ALC
@50% in TEC
```

Material name and dilution notation remain separate data internally.

Do not save the combined string as the material name.

Correct internal data:

```ts
material: 'Indole'

dilution: {
  enabled: true,
  percent: 10,
  solvent: 'ALC'
}
```

Rendered UI:

```text
Indole @10% in ALC
```

---

## Dilution calculation

Example:

```text
Indole
15 parts
@10% in ALC
```

Formula row solution weight:

```text
15 parts × 0.01 g = 0.15 g
```

Actual Indole:

```text
0.15 g × 10% = 0.015 g
```

ALC:

```text
0.15 g × 90% = 0.135 g
```

Interpretation:

```text
Solution 0.15 g
Indole 0.015 g
ALC 0.135 g
```

---

# 9. Solvent Recognition

The following material names must automatically be classified as solvent/carrier materials:

```text
ALC
DPG
IPM
TEC
```

Detection must be case-insensitive.

Examples:

```text
dpg
DPG
 DPG
```

must all resolve to:

```text
DPG
```

## SOLVENT badge

When the material name exactly matches one of:

```text
ALC
DPG
IPM
TEC
```

display:

```text
SOLVENT
```

The badge must remain `SOLVENT` in both English and Korean UI modes.

Do not translate it to `용매`.

Do not add a tooltip.

Badge style must remain stable across language changes.

Preferred CSS behavior:

```css
line-height: 2;
padding: 0 5px;
```

Do not allow Korean/English language switching to alter the shape of the badge.

---

# 10. Solvent Calculation

Total solvent calculation must include two sources.

## A. Direct solvent materials

Example:

```text
DPG 100 parts
```

All 100 parts are solvent.

At 1,000 total parts:

```text
DPG = 10%
```

---

## B. Solvent contained inside diluted materials

Example:

```text
Indole 15 parts @10% in ALC
```

Active:

```text
1.5 effective parts
```

Solvent:

```text
13.5 solvent parts
```

---

# 11. Concentrate Strength Calculation

The formula should show effective concentrate strength.

For each non-solvent material:

```text
undiluted material strength = 100%
```

For diluted material:

```text
effective active parts = parts × dilutionPercent
```

Direct solvent materials contribute:

```text
0 active parts
100% solvent parts
```

## Formula

```text
Effective concentrate strength
=
effective active parts
÷ total parts
× 100
```

Solvent share:

```text
Solvent %
=
total solvent parts
÷ total parts
× 100
```

At a complete 1,000-part formula:

```text
Concentrate % + Solvent % = 100%
```

allowing for normal floating-point rounding.

---

# 12. Total UI

Keep Total extremely simple.

Preferred visual structure:

```text
Total

Formula       1,000 / 1,000

Batch         10.00 g
Concentrate   92.75%
Solvent        7.25% · 0.73 g

Complete
```

Do not display unnecessary advanced values by default.

Active material grams may be calculated internally but do not need to be prominently displayed in v0.01.

Incomplete states:

```text
Add 40 more parts.
```

or:

```text
Reduce by 20 parts.
```

Korean versions must be translated through the UI dictionary.

---

# 13. Formula Notes

Each formula includes a Notes section.

Notes must feel like a notebook writing area.

Use ruled-line styling.

Text line-height should visually align with background lines.

Notes are user-entered data.

Never translate Notes automatically.

---

# 14. Formula Highlighting

Rows may optionally be highlighted.

Use subtle notebook/highlighter styling.

This is a visual marker only.

Do not assign regulatory or calculation meaning to highlight state.

---

# 15. Autosave

There should be no primary manual Save button for formulas.

Formula data must save automatically when the user changes:

- formula name
- parts
- material
- CAS
- Notes
- dilution
- solvent
- highlight state

Show autosave state near Formula ID / Date.

States:

English:

```text
Saving…
Saved locally
Session only
```

Korean:

```text
저장 중…
로컬 저장 완료
현재 세션만
```

## Storage fallback

IndexedDB is the production storage.

If storage becomes unavailable, the app must remain usable in memory for the current session if possible.

Do not crash the UI.

---

# 16. IndexedDB

Production v0.01 must migrate away from MVP localStorage formula storage.

Use IndexedDB.

Recommended stores:

```text
formulas
archive
settings
meta
```

Suggested keys:

```text
formulas: formula.id
archive: formula.id
settings: key
meta: key
```

Meta may include sequence information for Formula IDs.

Use a lightweight IndexedDB wrapper only if necessary.

Do not introduce a large dependency merely for storage.

---

# 17. Archive

Deleting a formula should not immediately destroy it.

Primary action:

```text
Move to Archive
```

Korean:

```text
보관함으로 이동
```

Archive is reversible.

Archive contains:

```text
Formula ID
Formula name
Restore
Delete permanently
```

---

# 18. Permanent Delete

Permanent deletion must require a deliberate two-stage interaction.

Do not use browser `confirm()` for permanent deletion.

Preferred flow:

```text
Delete permanently
↓
Confirm delete
↓
3.5 second progress fill
↓
Delete now
↓
second click
↓
deleted
```

During the 3.5-second progress animation, clicking must not delete anything.

After progress completes:

```text
Delete now
```

becomes actionable.

Permanent deletion removes the formula from Archive.

Formula IDs must never be reused.

---

# 19. JSON Export

Export entire Accordbook notebook as JSON.

Include:

```text
app name
formatVersion
exportedAt
settings
active formulas
archive formulas
```

Suggested shape:

```json
{
  "app": "Accordbook",
  "formatVersion": 1,
  "exportedAt": "2026-08-28T00:00:00.000Z",
  "data": {
    "settings": {},
    "formulas": [],
    "archive": []
  }
}
```

Filename:

```text
accordbook-backup-YYYYMMDD.json
```

JSON export is the primary backup format.

---

# 20. JSON Import

Import JSON backup.

v0.01 behavior:

```text
Import backup
→ validate
→ ask user before replacement
→ replace current notebook
```

Do not silently merge data in v0.01.

Validate:

- file parses as JSON
- formulas is an array
- rows is an array
- essential fields exist or can be normalized

Gracefully normalize missing optional fields.

Never execute any data contained in imported JSON.

---

# 21. PDF Export

Export current formula only.

Do not add a heavy PDF library in v0.01 unless absolutely necessary.

Preferred implementation:

```text
Print / Save current formula as PDF
```

Use print CSS and:

```js
window.print()
```

Target flow:

```text
Export
→ Print / Save current formula as PDF
→ browser print dialog
→ Save as PDF
```

Print output should hide:

- sidebar
- editing buttons
- DIL controls
- archive controls
- language controls
- autosave controls

Print should preserve:

- Accordbook notebook layout
- Formula ID
- Date
- Formula title
- formula rows
- dilution notation
- solvent badge if appropriate
- Notes
- Total

Test PDF behavior on actual Chrome/GitHub Pages, not only embedded previews.

---

# 22. Language Toggle

Default language:

```text
English
```

Available languages:

```text
English
Korean
```

Use SVG flags only.

Do not use emoji flags.

Display:

```text
US flag SVG
Korean flag SVG
```

No visible `EN / KO` text required.

Keep:

```text
aria-label
title
```

for accessibility on the language buttons.

---

# 23. Translation Scope

Only UI text changes with language.

Translate:

- labels
- buttons
- warnings
- autosave status
- archive actions
- Total labels
- placeholders
- import/export messages

Never translate automatically:

- Formula name
- Material names
- CAS
- Formula ID
- Notes
- dilution solvent values entered by user

Technical labels that remain English:

```text
ALC
DPG
IPM
TEC
DIL
SOLVENT
CAS
```

---

# 24. i18n Implementation

Do not hardcode translated strings across components.

Create a central dictionary.

Example:

```ts
export const messages = {
  en: {
    material: 'Material',
    notes: 'Notes',
    moveArchive: 'Move to Archive'
  },

  ko: {
    material: '원료',
    notes: '노트',
    moveArchive: '보관함으로 이동'
  }
}
```

Persist language preference locally.

Do not use an external translation API.

---

# 25. Typography

## English

The current notebook concept uses serif typography where appropriate.

Examples:

```text
Georgia
Times New Roman
```

Use sans-serif/monospace only where functionally appropriate.

---

## Korean

Use a readable serif stack to visually balance English typography.

Recommended:

```css
font-family:
  "Noto Serif KR",
  "Nanum Myeongjo",
  "AppleMyungjo",
  "Batang",
  "Times New Roman",
  serif;
```

Do not bundle font files into the repository.

Use local/system fallback fonts.

Technical numeric information should remain monospace when appropriate.

Examples:

```text
FORMULA ID
Parts
Percent
CAS
```

---

# 26. Header Design

The Formula title underline and the lower border of the Date area must align visually on the same horizontal line.

Right header:

```text
FORMULA ID   ACC-2608-001
DATE         2026 / 08 / 28
```

Below:

```text
Saved locally            [US flag] [KR flag]
```

Autosave badge and language toggle should be visually balanced.

Do not allow language switching to shift the header layout.

---

# 27. Footer Phrase

Use the following phrase in the left notebook footer.

English:

> **Everything starts with the fundamentals.**

Korean:

> **모든 것은 기본기에서 시작된다.**

This replaces any visible MVP/revision text.

Do not display:

```text
Accordbook notebook concept · MVP rev.xx
```

in the final UI.

Version information may exist in source metadata, README, or About UI later.

---

# 28. Sidebar

Desktop sidebar should contain:

```text
Accordbook
A formula notebook for perfumers

Formula ID prefix
[ ACC ] [ Save ]

+ New formula

Notebook
[ formula list ]

Data
[ Export ]
[ Import JSON ]

Archive
```

At bottom:

```text
Private by default
Your formulas stay on your device.

Everything starts with the fundamentals.
```

Do not overload sidebar with additional tools in v0.01.

---

# 29. New Formula

`+ New formula`

must create a blank formula.

Do not repeatedly create demo formulas.

A sample formula may exist only as:

```text
ACC-YYMM-000
```

for first-run/demo purposes.

First real formula begins at:

```text
001
```

---

# 30. Duplicate Formula

Allow:

```text
Duplicate as new page
```

This must:

- copy rows
- copy notes
- copy dilution settings
- copy highlight states
- generate new Formula ID
- preserve original
- set new createdAt
- update updatedAt

Do not reuse the original Formula ID.

---

# 31. Reset Materials

Button:

```text
Reset materials
```

Meaning:

Clear all material rows only.

Keep:

```text
Formula ID
Formula name
Notes
Date
```

Do not delete the whole formula.

Require confirmation.

---

# 32. Responsive Strategy

Project strategy:

```text
Desktop-first
Tablet-friendly
Mobile-safe
```

Do not build a separate mobile application.

Minimum phone behavior below approximately 640px:

- sidebar moves above content
- formula does not overflow viewport
- CAS / Ref. may be hidden
- primary visible columns:

```text
Parts
Material
Percent
Actions
```

- DIL editor stacks vertically
- buttons have adequate touch size
- Notes remain usable
- Total stacks vertically
- Formula ID / Date remain readable

Mobile support is intentionally minimal in v0.01.

Do not compromise desktop notebook design to optimize phone UX.

---

# 33. Recommended Project Structure

```text
accordbook/
│
├─ .github/
│  └─ workflows/
│     └─ deploy.yml
│
├─ public/
│  ├─ favicon.svg
│  └─ icons/
│
├─ src/
│  │
│  ├─ components/
│  │  ├─ Header/
│  │  │  ├─ FormulaHeader.tsx
│  │  │  ├─ AutosaveStatus.tsx
│  │  │  └─ LanguageToggle.tsx
│  │  │
│  │  ├─ FormulaEditor/
│  │  │  ├─ FormulaEditor.tsx
│  │  │  ├─ FormulaRow.tsx
│  │  │  ├─ DilutionEditor.tsx
│  │  │  └─ SolventBadge.tsx
│  │  │
│  │  ├─ FormulaTotal/
│  │  │  └─ FormulaTotal.tsx
│  │  │
│  │  ├─ Sidebar/
│  │  │  ├─ Sidebar.tsx
│  │  │  ├─ FormulaList.tsx
│  │  │  ├─ ArchiveList.tsx
│  │  │  └─ FormulaIdPrefix.tsx
│  │  │
│  │  ├─ Notes/
│  │  │  └─ FormulaNotes.tsx
│  │  │
│  │  └─ common/
│  │     ├─ Button.tsx
│  │     └─ Input.tsx
│  │
│  ├─ pages/
│  │  └─ NotebookPage.tsx
│  │
│  ├─ models/
│  │  ├─ formula.ts
│  │  └─ settings.ts
│  │
│  ├─ services/
│  │  ├─ formulaCalculator.ts
│  │  ├─ dilutionCalculator.ts
│  │  ├─ solventClassifier.ts
│  │  ├─ formulaIdGenerator.ts
│  │  ├─ exportJson.ts
│  │  ├─ importJson.ts
│  │  └─ printFormula.ts
│  │
│  ├─ storage/
│  │  ├─ database.ts
│  │  ├─ formulaRepository.ts
│  │  ├─ archiveRepository.ts
│  │  └─ settingsRepository.ts
│  │
│  ├─ i18n/
│  │  └─ messages.ts
│  │
│  ├─ utils/
│  │  ├─ ids.ts
│  │  ├─ dates.ts
│  │  └─ numbers.ts
│  │
│  ├─ styles/
│  │  ├─ global.css
│  │  ├─ notebook.css
│  │  ├─ responsive.css
│  │  └─ print.css
│  │
│  ├─ App.tsx
│  └─ main.tsx
│
├─ tests/
│  ├─ formulaCalculator.test.ts
│  ├─ dilutionCalculator.test.ts
│  ├─ solventClassifier.test.ts
│  └─ formulaIdGenerator.test.ts
│
├─ .gitignore
├─ LICENSE
├─ README.md
├─ CHANGELOG.md
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ VERSION
```

Do not create unnecessary empty feature folders beyond this specification.

---

# 34. Calculation Services

Keep calculations independent from React UI.

This is important.

Example functions:

```ts
calculateTotalParts(rows)
calculatePercent(parts)
calculateBatchWeight(parts)
calculateDilution(row)
calculateFormulaStrength(rows)
calculateSolventShare(rows)
isSolventMaterial(material)
```

Do not bury calculations inside React component rendering logic.

Long-term goal:

```text
Accordbook UI
     ↓
Accordbook Core
```

The calculation core should eventually be reusable by:

```text
Web
CLI
MCP
```

but do not build CLI/MCP in v0.01.

---

# 35. Solvent Classifier

Recommended:

```ts
const SOLVENTS = new Set([
  'ALC',
  'DPG',
  'IPM',
  'TEC'
]);
```

Normalize:

```ts
trim()
toUpperCase()
```

Function:

```ts
export function isSolventMaterial(name: string): boolean
```

Do not classify arbitrary materials as solvents.

Only the explicit v0.01 list is supported.

---

# 36. Formula ID Generator

Formula ID generation must be isolated from UI.

Function concept:

```ts
generateFormulaId({
  prefix,
  date,
  existingFormulaIds
})
```

Must consider:

```text
active formulas
archived formulas
permanently deleted sequence history
```

If permanent deletion occurs, keep sequence metadata so the ID is never reused.

Recommended meta state:

```ts
{
  "ACC-2608": 17
}
```

Then next ID:

```text
ACC-2608-018
```

This is safer than scanning only current formulas.

---

# 37. Tests

At minimum, automated tests must cover calculations.

## Total

```text
400 + 150 + 450 = 1000
```

expect:

```text
complete
10.00 g
```

---

## Percentage

```text
400 parts → 40.0%
15 parts → 1.5%
```

---

## Dilution

```text
15 parts
10%
ALC
```

expect:

```text
solution = 0.15 g
active = 0.015 g
solvent = 0.135 g
```

---

## Direct solvent

```text
DPG = 100 parts
total = 1000
```

expect:

```text
10% solvent contribution
```

---

## Mixed concentrate

Example:

```text
900 parts neat aromatic materials
100 parts DPG
```

expect:

```text
Concentrate 90%
Solvent 10%
```

---

## Formula ID

Given:

```text
ACC-2608-001
ACC-2608-002
ACC-2608-004
```

and sequence metadata indicates:

```text
004
```

next must be:

```text
ACC-2608-005
```

Never generate:

```text
003
```

---

# 38. GitHub Pages

The repository must be deployable through GitHub Pages.

Use GitHub Actions.

Expected production URL:

```text
https://perfumerlee.github.io/accordbook/
```

Vite base configuration must support:

```text
/accordbook/
```

Do not assume root `/`.

---

# 39. GitHub Actions

Create:

```text
.github/workflows/deploy.yml
```

Flow:

```text
push to main
↓
npm install / npm ci
↓
npm test
↓
npm run build
↓
GitHub Pages deploy
```

Do not deploy if tests fail.

---

# 40. README

README should remain concise.

Suggested structure:

```markdown
# Accordbook

An open-source formula notebook for perfumers.

Built by a perfumer, for perfumers.

> **Private by default**  
> Your formulas stay on your device.

## Try Accordbook

[Open Accordbook →](...)

## Status

Current version: **v0.01**
```

Do not advertise features that are not implemented.

English README is primary.

A Korean README may later be:

```text
README.ko.md
```

but it is not required for initial development if time is limited.

---

# 41. CHANGELOG

Create:

```text
CHANGELOG.md
```

Initial:

```markdown
# Changelog

## v0.01

### Added

- Formula notebook
- 1,000-part formula system
- 10.00 g standard batch
- Formula ID system
- Dilution support
- Solvent classification
- Concentrate / solvent calculation
- Notes
- Autosave
- Archive
- JSON import/export
- PDF print export
- EN / KO UI
- Minimal mobile-safe layout
```

---

# 42. VERSION

Create:

```text
VERSION
```

Contents:

```text
0.01
```

UI does not need to show version prominently.

---

# 43. License

Use:

```text
MIT License
```

unless the repository already has another explicitly selected license.

Do not change license without approval.

---

# 44. Non-Goals for v0.01

Do NOT implement:

```text
IFRA calculations
allergen calculations
supplier database
raw material database
CAS lookup API
cost calculation
inventory
production management
cloud sync
user accounts
team sharing
AI assistant
formula generation AI
MCP
CLI
server backend
payments
subscriptions
analytics tracking
```

These are future possibilities.

Do not expand scope while implementing v0.01.

---

# 45. Security / Privacy

Never upload formula data.

No analytics by default.

No third-party tracking.

No external translation API.

No API keys.

JSON import must only parse data.

Do not use `eval`.

Do not dynamically execute imported code.

---

# 46. Accessibility

Minimum:

- buttons accessible by keyboard
- language flag buttons have aria labels
- form inputs have accessible labels
- active language has visual state
- color is not the only indicator for destructive actions
- buttons must have visible focus states

---

# 47. Browser Targets

Primary:

```text
Current Chrome
Current Edge
Current Safari
Current Firefox
```

Desktop is primary.

Tablet should be usable.

Phone must not break.

No need to support legacy IE.

---

# 48. Implementation Order

Codex should implement in this order.

## Phase 1 — Foundation

1. Initialize React + TypeScript + Vite
2. Configure GitHub Pages base path
3. Create core folder structure
4. Add VERSION / CHANGELOG
5. Implement global notebook theme

Do not implement advanced features before foundation works.

---

## Phase 2 — Core Calculation Engine

Implement and test:

```text
parts
percent
10.00 g conversion
dilution
direct solvent recognition
concentrate %
solvent %
```

Calculations must pass tests before UI integration.

---

## Phase 3 — Storage

Implement IndexedDB:

```text
formulas
archive
settings
meta
```

Add autosave.

---

## Phase 4 — Formula Editor

Implement:

```text
Formula ID
Formula title
Parts
Material
CAS
Percent
Notes
highlight
DIL
SOLVENT badge
Total
```

---

## Phase 5 — Formula Lifecycle

Implement:

```text
New formula
Duplicate
Reset materials
Archive
Restore
Permanent delete
```

---

## Phase 6 — Import / Export

Implement:

```text
JSON Export
JSON Import
Print / PDF
```

---

## Phase 7 — i18n

Implement:

```text
English default
Korean toggle
SVG flags
local language preference
```

Do not translate user content.

---

## Phase 8 — Responsive

Add:

```text
tablet-friendly
mobile-safe
```

Do not redesign product for mobile.

---

## Phase 9 — Tests / Deploy

Run:

```text
npm test
npm run build
```

Then configure GitHub Pages deployment.

---

# 49. Acceptance Criteria

v0.01 is complete only if all of the following are true.

### Core

- [ ] New formula can be created
- [ ] First real Formula ID starts at `001`
- [ ] Formula IDs never reuse deleted numbers
- [ ] Formula total is calculated correctly
- [ ] 1,000 parts equals 10.00 g
- [ ] Percent calculation is correct

### Dilution

- [ ] Dilution can be configured
- [ ] `@10% in DPG` remains visible when DIL editor is closed
- [ ] Dilution calculation is correct
- [ ] `ALC / DPG / IPM / TEC` are recognized as solvents
- [ ] SOLVENT badge remains English in EN and KO UI
- [ ] SOLVENT badge has no tooltip
- [ ] Concentrate % is correct
- [ ] Solvent % is correct

### Storage

- [ ] Formula autosaves
- [ ] Reload restores formulas
- [ ] Language preference persists
- [ ] Prefix preference persists

### Archive

- [ ] Formula can move to Archive
- [ ] Archived formula can Restore
- [ ] Permanent deletion uses 3.5-second progress confirmation
- [ ] Deleted Formula ID is never reused

### Export / Import

- [ ] JSON export works
- [ ] JSON import works
- [ ] JSON import validates data
- [ ] Current formula print/PDF works in a normal browser

### Language

- [ ] English is default
- [ ] Korean UI works
- [ ] User formula data never changes when language toggles
- [ ] SVG flag toggle works
- [ ] Layout does not shift significantly when language changes

### Responsive

- [ ] Desktop layout matches notebook concept
- [ ] Tablet is usable
- [ ] Phone layout does not overflow horizontally
- [ ] CAS may be hidden on small phones

### Deployment

- [ ] tests pass
- [ ] production build succeeds
- [ ] GitHub Pages deploy succeeds

---

# 50. Important Do-Not-Break Rules

Codex must preserve these rules throughout development.

1. **1,000 parts = 10.00 g**
2. **1 part = 0.01 g**
3. Formula data is local-first and private.
4. No login in v0.01.
5. English UI is default.
6. User-entered content is never automatically translated.
7. `SOLVENT` remains English in both UI languages.
8. Formula ID numbers are never reused.
9. `DIL` is an editor control, not a dilution-state toggle once configured.
10. Dilution notation remains visible when the editor is closed.
11. Direct `ALC / DPG / IPM / TEC` rows count as solvent.
12. Keep Total simple.
13. Keep the notebook visual concept.
14. Do not add unrequested v0.01 scope.
15. Mobile support is minimal, not a redesign.

---

# 51. Reference Prototype

The development should follow the approved MVP behavior and visual direction from the latest prototype.

The prototype is a concept/behavior reference only.

Do NOT keep the production app as a single monolithic HTML file.

Refactor into:

```text
React
TypeScript
services
storage
components
tests
```

Preserve behavior, not prototype code structure.

---

# 52. Codex Working Rules

Before modifying code:

1. inspect the existing repository
2. understand current files
3. preserve working features
4. avoid unnecessary rewrites

When implementing a feature:

1. implement calculation/service logic first
2. add tests
3. integrate UI
4. verify EN / KO
5. verify desktop
6. verify mobile-safe state
7. run build

Never silently remove working behavior.

If a requested change conflicts with this specification, stop and clearly report the conflict before implementing it.

---

# 53. Recommended Initial Commands

If repository has not yet been initialized with Vite:

```bash
npm create vite@latest . -- --template react-ts
npm install
npm run dev
```

Before any destructive initialization, inspect the repository and preserve:

```text
README.md
LICENSE
.gitignore
existing project files
```

Do not overwrite the repository blindly.

---

# 54. Definition of Done

Accordbook v0.01 should feel like:

> A real perfumer's formula notebook, made digital.

Not:

> A complex fragrance management system.

The user must be able to open Accordbook and immediately understand:

```text
Enter parts
Enter materials
Reach 1,000
See percent
Set dilution if needed
Write notes
Done
```

If the app becomes harder than that, simplify it.

---

End of Accordbook v0.01 Codex Development Specification.
