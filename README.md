# Accordbook

**An open-source formula notebook for perfumers.**

Built by a perfumer, for perfumers.

> **Private by default**  
> Your formulas stay on your device.

Accordbook is a local-first formula notebook designed for perfumers to write, calculate, revise, organize, preserve, and share fragrance formulas without requiring an account or backend.

---

## Try Accordbook

**[Open Accordbook.org →](https://accordbook.org/)**

---

## Preview

### Desktop

<!-- DESKTOP SCREENSHOT -->
<img width="1672" height="941" alt="accordbook_readme_main1" src="https://github.com/user-attachments/assets/0e841547-f4b3-4be3-8f60-a6c5583a798b" />

### Smartphone

<!-- SMARTPHONE SCREENSHOT -->
<img width="1672" height="941" alt="accordbook_readme_main2" src="https://github.com/user-attachments/assets/0ad68896-ae2e-4514-b6a5-6c84fd47bccd" />

---

## v1.06 — Time Machine

Accordbook v1.06 introduces **Time Machine**, a new way to preserve meaningful stages of a formula while continuing to experiment with the current version.

This release also improves first-time onboarding, Sample formulas, Formula Origins, Notebook Backup, responsive layouts, and printed formula records.

### Time Machine

- Save meaningful formula states as permanent versions
- Keep everyday Auto Save separate from version history
- Browse the history of the current formula
- Add an optional note when saving a version
- Open historical versions in read-only mode
- Compare saved versions with other versions or the current formula
- See added, removed, changed, and unchanged materials
- Restore a previous version without deleting later history
- Automatically preserve the current state as a Restore Point when needed

### Formula notebook

- 1,000-part formula notebook with a 10.00 g reference batch
- Formula ID and customizable prefix management
- Formula editing with Parts, Material, CAS / Ref., dilution, and Notes
- Automatic concentrate, solvent, batch, shortage, and completion calculations
- Formula duplication and material reset
- Archive, restore, and permanent delete
- Local Auto Save using browser storage

### Starter formulas

- First-visit onboarding for new users
- Create a new formula or open an existing `.accordbook` file
- Try included Sample formulas
- Sample formulas always create independent editable formulas
- Sample-derived formulas keep their Origin relationship
- Starter formulas never create Time Machine history automatically

### Formula Origins

Accordbook keeps Formula Origin simple and focused on the relationship to its source.

Available states include:

- Original
- Inspired by
- Adapted from
- Unknown

Detailed provenance information can remain stored internally without making the main notebook interface unnecessarily complex.

### Formula files and backup

- Standalone `.accordbook` Formula Files for sharing individual formulas
- Formula imports add a new Formula without replacing the existing Notebook
- Legacy `.json` Formula Files remain supported for import
- Notebook Backup for full recovery and migration
- Notebook Backup now preserves Time Machine versions and Restore Points
- Older backup formats remain supported
- Formula Files and Notebook Backups remain separate workflows

### CAS Check

- Review materials in the current formula
- Safe CAS autofill for exact, single-candidate matches
- Existing user-entered CAS / Ref. values are never overwritten automatically
- Visual identification of unresolved materials
- Local CAS resolver data
- No live external fragrance-database lookup required during normal use

### Interface

- English / Korean interface
- Desktop, tablet, and smartphone-safe layouts
- Dedicated Time Machine workspace
- Improved first-visit experience
- Responsive Notebook and Formula navigation
- Mobile Formula and Material actions
- Current-formula browser printing
- Improved CAS and Origin presentation in printed records
- Cleaner print output with interaction controls removed

---

## Time Machine

Perfume formulas often develop through many experiments rather than a single finished draft.

Time Machine lets you preserve the stages that matter without turning every Auto Save into a version.

A simple workflow looks like this:

```text
Current Formula
      ↓
Save Version
      ↓
v1
      ↓
Continue experimenting
      ↓
v2
      ↓
Compare / Restore
```

The current Formula always remains the editable working state.

Saved versions are immutable snapshots that can be opened later for reference or comparison.

### Restore without losing history

Restoring an earlier version does not erase what happened afterward.

When necessary, Accordbook creates a **Restore Point** before applying the historical state.

This allows experimentation to continue without treating restoration as destructive history rewriting.

---

## Formula sharing

Accordbook uses a dedicated Formula File for sharing individual formulas.

The official extension is:

```text
.accordbook
```

A Formula File can be exported from the currently open Formula and imported into another Accordbook Notebook.

When imported:

- the Formula is added as a new Notebook entry
- existing formulas are not replaced
- archived formulas are not changed
- a new local Formula identity is created

Formula Files remain intentionally separate from Notebook Backups.

### Formula File vs Notebook Backup

**Formula File**

- shares one Formula
- uses `.accordbook`
- imports additively
- does not include Time Machine history
- does not replace the Notebook

**Notebook Backup**

- preserves the full Notebook
- includes Time Machine history
- is intended for recovery or migration
- restores Notebook-level data

Use **Import formula** for shared formulas.

Use **Restore backup** when restoring the complete Notebook.

---

## Formula Origins

Formula Origins describe how a Formula relates to its source.

Accordbook uses four simple classifications:

- **Original**
- **Inspired by**
- **Adapted from**
- **Unknown**

For example, a Formula created from an Accordbook Sample is identified as **Adapted from**, while a Formula created from scratch is **Original**.

Origin information does not change the actual composition of the Formula.

---

## CAS Check

CAS Check is a local assistant for reviewing material information in the currently open Formula.

Accordbook can fill an empty CAS / Ref. field when the local resolver finds a sufficiently certain match.

Existing user-entered CAS / Ref. values are never overwritten automatically.

Ambiguous or unresolved materials remain available for manual review.

> CAS Check is an assistance tool. Supplier documentation, SDS information, regulatory references, and other authoritative sources should remain the primary references for material identification.

---

## Privacy and storage

Accordbook is **private by default**.

No account or backend is required for normal Formula storage.

Formula data, Notes, Origins, Time Machine history, and other working information remain in the browser/device storage used by Accordbook.

CAS Check uses local resolver data during normal use and does not require sending Formula materials to a live external fragrance database.

Formula Files and Notebook Backups are generated locally by the user.

For portability and recovery, keeping a recent Notebook Backup is recommended.

---

## Formula rules

Accordbook uses a simple 1,000-parts system.

- **1,000 parts = 10.00 g**
- **1 part = 0.01 g**
- Percentage is derived from Parts
- Diluted materials retain notation such as `@10% in ALC`
- Direct solvent rows are included in solvent calculations
- Dilution carriers are included in solvent calculations

Common solvent tokens include:

- ALC
- DPG
- IPM
- TEC

---

## Language

Accordbook supports:

- English
- Korean

Only system interface text is translated.

User-entered Formula content is never automatically translated.

This includes Formula titles, Material names, CAS / Ref. values, Notes, Version Notes, and user-entered source information.

Technical notation such as `PARTS`, `CAS / REF.`, `DIL`, `ALC`, `DPG`, `IPM`, and `TEC` can remain unchanged across interface languages.

---

## Technical stack

- React
- TypeScript
- Vite
- IndexedDB
- Vitest

Accordbook runs entirely in the browser for normal use.

---

## Data integrity

Accordbook preserves local provenance and revision information to help maintain a record of how formulas change over time.

Formula content can be fingerprinted using SHA-256, and compatible revision records can be checked for integrity.

These mechanisms are designed to be **tamper-evident, not tamper-proof**.

Accordbook does not claim to certify original authorship, copyright ownership, formula authenticity, or trusted timestamps.

---

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

---

## License

Accordbook is open source under the **MIT License**.

---

**Everything starts with the fundamentals.**
