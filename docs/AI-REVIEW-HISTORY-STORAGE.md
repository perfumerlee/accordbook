# AI Review History storage policy

Formula AI Review records are separate local IndexedDB records. They keep the exact validated AI context that was submitted, the validated response, response locale, creation time, and a source Formula reference. They do not store access tokens, request headers, model names, usage, or cost values that the frontend does not receive.

Full `.accordbook` backups use format v4 and include Review History. These backups are plain local JSON files and may contain the submitted Formula context and AI-generated text; protect downloaded files accordingly. Licensed Formula packages remain Formula-only and do not include Review History.

When importing legacy v1-v3 backups, Review History is omitted from the import payload, so the existing local Review store is preserved. This avoids deleting newer local history while restoring a backup that could not contain it. Reviews whose source Formula is absent remain in the Review store as orphans and can be discovered through the all-reviews query.

The v4 IndexedDB upgrade creates the `reviews` object store and its `sourceFormulaId` index without rewriting existing Formula, Version, or Experiment records. If IndexedDB is unavailable and storage runs in memory mode, Review saves report `session-only`; they are not represented as durable local saves.
