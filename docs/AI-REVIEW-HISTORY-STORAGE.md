# AI Review History storage policy

Formula AI Review records are separate local IndexedDB records. They keep the exact validated AI context that was submitted, the validated response, response locale, creation time, and a source Formula reference. They do not store access tokens, request headers, model names, usage, or cost values that the frontend does not receive.

Full `.accordbook` backups use format v5 and include Formula AI Reviews and Experiment Compare Reviews. Experiment records contain the exact sanitized submitted composition context, deterministic deltas, and validated generated response. These backups are plain local JSON files and may contain Formula and Experiment context plus AI-generated text; protect downloaded files accordingly. Licensed Formula packages remain Formula-only and do not include either kind of Review History.

Legacy v1-v3 imports omit Review History and preserve all local reviews. A v4 backup contains Formula Reviews only; importing it replaces Formula Reviews from that backup while merging and preserving local Experiment Compare Reviews. A v5 backup includes both review types and replaces the complete review history with its validated contents.

When importing legacy v1-v3 backups, Review History is omitted from the import payload, so the existing local Review store is preserved. This avoids deleting newer local history while restoring a backup that could not contain it. Reviews whose source Formula is absent remain in the Review store as orphans and can be discovered through the all-reviews query.

The v5 IndexedDB upgrade creates the `reviews` object store and its `sourceFormulaId` index without rewriting existing Formula, Version, or Experiment records. The v6 upgrade adds the `experimentId` index to that same store; it preserves all existing Formula Review rows and does not rewrite Formula, Version, or Experiment records. If IndexedDB is unavailable and storage runs in memory mode, Review saves report `session-only`; they are not represented as durable local saves.
