# Formula Time Machine

Accordbook v1.03 preserves stable material row identity and compact row deltas so reconstructable Formula states can be verified without rewriting append-only history.

Legacy v1.02 revisions without snapshots or deltas remain integrity-verifiable but are not reconstructed retroactively. Restoring a past state must create a new revision; it never deletes or rewrites later history.
