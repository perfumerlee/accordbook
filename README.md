# Accordbook

**An open-source formula notebook for perfumers.**

Built by a perfumer, for perfumers.

> **Private by default**  
> Your formulas stay on your device.

Accordbook is a local-first formula notebook designed for perfumers to write, calculate, revise, compare, organize, preserve, experiment with, and share fragrance formulas without requiring an account or backend.

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

## v1.07 — Experiments & Branches

Accordbook v1.07 introduces **Experiments**, a new workspace for developing a Formula through parallel trials and branching directions.

A Formula no longer has to develop as a single linear sequence of revisions.

You can keep a fixed **BASE**, explore alternatives such as **A / B / C**, and continue a promising direction through branches such as **A1 / A2**.

```text
BASE
├─ A
│  ├─ A1
│  └─ A2
├─ B
└─ C
```

This brings Accordbook closer to the way formulas are often developed in a perfumer's working notebook.

### Experiments

- Create an Experiment from the current Formula
- Create an Experiment from a saved Time Machine state
- Preserve the selected starting point as an immutable BASE
- Create independent Variants such as A / B / C
- Continue a Variant through branches such as A1 / A2
- Keep each Variant independent from BASE and sibling Variants
- Edit materials, Parts, CAS / Ref., dilution, Notes, and totals
- Auto Save Experiment changes locally
- Return to Experiments without modifying Formula history

### Parallel Variants

BASE acts as the common reference point for an Experiment.

```text
BASE
├─ A
├─ B
└─ C
```

Each Variant can be edited independently.

Changes made to **A** do not modify:

- BASE
- B
- C
- the current Formula

This makes it possible to test several directions without flattening every trial into unrelated Formula copies.

### Branches

A Variant can continue into a deeper experimental direction.

```text
BASE
├─ A
│  ├─ A1
│  └─ A2
├─ B
└─ C
```

A branch remembers which Variant it came from.

This allows Accordbook to preserve the logical genealogy of an experiment as it develops.

Branch relationships are stored separately from their visible labels, so the experimental structure does not depend on parsing names such as `A1` or `A2`.

### Experiment Comparison

Use **View as Sheet** to compare BASE and Variants side by side.

The comparison workspace helps review:

- Parts changes
- added materials
- removed materials
- CAS / Ref. differences
- dilution differences
- totals

BASE remains the common reference point of the Experiment.

### Experiment entry workflow

Experiments are connected directly to the current Formula.

From a Formula you can:

- browse its Experiments
- create a new Experiment
- choose the BASE source
- open an existing Experiment
- continue working from BASE or a Variant

Experiment selection and creation use a compact entry workflow while the Formula remains the parent context.

### Time Machine as a BASE Source

A new Experiment can begin from:

- **CURRENT**
- a saved Time Machine Version

This makes it possible to return to an earlier Formula state and explore a new direction without changing the Formula's existing history.

---

## Formula notebook

Accordbook remains centered around a simple 1,000-part Formula notebook.

- 1,000-part Formula with a 10.00 g reference batch
- Formula ID and customizable prefix management
- Formula editing with Parts, Material, CAS / Ref., dilution, and Notes
- Automatic concentrate, solvent, batch, shortage, and completion calculations
- Formula duplication and material reset
- Archive, restore, and permanent delete
- Local Auto Save using browser storage
- Experiment entry directly from the current Formula

---

## Time Machine

Perfume formulas often develop through many experiments rather than a single finished draft.

Time Machine lets you preserve meaningful Formula states without turning every Auto Save into a permanent Version.

A simple workflow looks like this:

```text
Current Formula
      ↓
Save Version
      ↓
V1
      ↓
Continue experimenting
      ↓
V2
      ↓
Compare / Restore
```

The current Formula always remains the editable working state.

Saved Versions are immutable snapshots that can be opened later for reference, comparison, restoration, or as the starting BASE of a new Experiment.

### Save meaningful Formula states

- Save permanent Versions manually
- Keep everyday Auto Save separate from Version history
- Add an optional note when saving
- Browse saved states of the current Formula
- Open previous Versions in read-only mode
- Compare multiple saved states
- Compare a saved Version with CURRENT
- Use a saved Version as an Experiment BASE

### Restore without losing history

Restoring an earlier Version does not erase what happened afterward.

When necessary, Accordbook can preserve the current state as a **Restore Point** before applying the historical snapshot.

This allows experimentation to continue without treating restoration as destructive history rewriting.

---

## Experiments vs Time Machine

Time Machine and Experiments solve different problems.

**Time Machine**

Preserves how a Formula changed over time.

```text
CURRENT
   ↓
V1
   ↓
V2
   ↓
V3
```

**Experiments**

Preserve how a Formula is intentionally varied in parallel.

```text
BASE
├─ A
├─ B
└─ C
```

**Branches**

Continue an experimental direction from a Variant.

```text
BASE
└─ A
   ├─ A1
   └─ A2
```

Together, they allow Accordbook to represent both chronological Formula history and experimental genealogy without treating them as the same thing.

---

## Experiment model

Accordbook keeps several concepts intentionally separate.

```text
FORMULA
What to make

VERSION
A saved state of a Formula at a point in time

EXPERIMENT
A workspace for intentionally varying a Formula

BASE
The fixed starting state of an Experiment

VARIANT
A parallel experimental direction

BRANCH
A new direction derived from an existing Variant
```

This separation is designed to keep Formula history, experimental development, and future physical bench records understandable as Accordbook grows.

---

## Starter formulas

Accordbook includes a first-visit workflow for new users.

- Create a new Formula
- Open an existing `.accordbook` Formula File
- Try included Sample formulas
- Sample formulas always create independent editable formulas
- Sample-derived formulas keep their Origin relationship
- Starter formulas do not automatically create Time Machine history
- Users can later create Experiments from their working Formula or saved Versions

---

## Formula Origins

Accordbook keeps Formula Origin simple and focused on the relationship to its source.

Available states include:

- **Original**
- **Inspired by**
- **Adapted from**
- **Unknown**

For example, a Formula created from an Accordbook Sample can be identified as **Adapted from**, while a Formula created from scratch can be identified as **Original**.

Origin information does not change the actual composition of the Formula.

Detailed provenance information can remain stored internally without making the main notebook interface unnecessarily complex.

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
- does not include Experiment history
- does not replace the Notebook

**Notebook Backup**

- preserves the full Notebook
- includes Time Machine history
- includes Experiment data
- preserves Experiment BASE, Variants, and Branch relationships
- is intended for recovery or migration
- restores Notebook-level data

Use **Import formula** for shared formulas.

Use **Restore backup** when restoring the complete Notebook.

---

## Formula files and backup

Accordbook separates portable Formula sharing from full Notebook recovery.

### Formula Files

- Export a single Formula
- Official extension: `.accordbook`
- Import adds a new Formula
- Existing Notebook content remains intact
- Legacy `.json` Formula Files remain supported for import
- Formula Files do not carry Time Machine or Experiment history

### Notebook Backup

Notebook Backup is intended for full recovery and migration.

It preserves Notebook-level information including:

- active Formulas
- archived Formulas
- Formula settings
- Time Machine Versions
- Restore Points
- Experiments
- Experiment BASE snapshots
- Variants
- Branch relationships

Older compatible Backup formats remain supported where applicable.

---

## CAS Check

CAS Check is a local assistant for reviewing material information in the currently open Formula.

Accordbook can fill an empty CAS / Ref. field when the local resolver finds a sufficiently certain match.

Existing user-entered CAS / Ref. values are never overwritten automatically.

Ambiguous or unresolved materials remain available for manual review.

Features include:

- review materials in the current Formula
- safe CAS autofill for exact, single-candidate matches
- visual identification of unresolved materials
- local CAS resolver data
- no live external fragrance-database lookup required during normal use

> CAS Check is an assistance tool. Supplier documentation, SDS information, regulatory references, and other authoritative sources should remain the primary references for material identification.

---

## Interface

Accordbook is designed around a quiet working-notebook interface rather than a dashboard.

The Formula notebook remains the primary workspace, with dedicated surfaces for history, experimentation, and comparison.

Current interface features include:

- English / Korean interface
- responsive Formula and Notebook navigation
- Formula-level Experiment access
- Experiment List / Create workflow
- dedicated BASE / Variant workspace
- Experiment comparison Sheet
- Time Machine workspace
- Multi-Version Sheet
- responsive Notebook and Formula controls
- mobile Formula and Material actions
- current-Formula browser printing
- improved CAS and Origin presentation in printed records
- cleaner print output with interaction controls removed

Wide comparison and Experiment editing workspaces are designed primarily for desktop and landscape working environments.

---

## Privacy and storage

Accordbook is **private by default**.

No account or backend is required for normal Formula storage.

Formula data, Notes, Origins, Time Machine history, Experiments, Variants, Branch relationships, and other working information remain in the browser/device storage used by Accordbook.

CAS Check uses local resolver data during normal use and does not require sending Formula materials to a live external fragrance database.

Formula Files and Notebook Backups are generated locally by the user.

For portability and recovery, keeping a recent Notebook Backup is recommended.

> Browser storage is local to the browser/device environment.  
> Keep a recent Notebook Backup when the data matters.

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

The same Parts-based Formula structure is preserved when Formula states are used as Experiment BASE snapshots and Variants.

---

## Language

Accordbook supports:

- English
- Korean

Only system interface text is translated.

User-entered Formula and Experiment content is never automatically translated.

This includes:

- Formula titles
- Experiment names
- Material names
- CAS / Ref. values
- Notes
- Variant Notes
- Version Notes
- user-entered source information

Technical notation such as `PARTS`, `CAS / REF.`, `DIL`, `ALC`, `DPG`, `IPM`, `TEC`, and `SOLVENT` can remain unchanged across interface languages.

---

## Technical stack

- React
- TypeScript
- Vite
- IndexedDB
- Vitest

Accordbook runs entirely in the browser for normal use.

The application follows a local-first architecture and does not require a backend for standard Formula, Version, or Experiment storage.

---

## Data integrity

Accordbook preserves local provenance and revision information to help maintain a record of how formulas change over time.

Formula content can be fingerprinted using SHA-256, and compatible revision records can be checked for integrity.

Experiment structures preserve explicit relationships between:

- Formula
- Experiment
- BASE
- Variants
- Branches

Variant relationships use persistent internal identifiers rather than relying only on visible labels.

These mechanisms are designed to be **tamper-evident, not tamper-proof**.

Accordbook does not claim to certify original authorship, copyright ownership, Formula authenticity, or trusted timestamps.

---

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

---

## Roadmap

v1.07 establishes the logical genealogy of Formula development through Experiments and Branches.

Future development can extend this structure into physical bench workflows.

Conceptually:

```text
FORMULA
What to make

EXPERIMENT
How to vary it

BATCH
What was physically made
```

Possible future bench concepts include:

```text
Take
Add
Actual
Batch
```

The long-term goal is to let Accordbook record not only **how a Formula changed**, but also **what was physically made during the experiment**.

---

## License

Accordbook is open source under the **MIT License**.

---

**Everything starts with the fundamentals.**
