import { useEffect, useMemo, useState, useRef } from "react";
import type {
  GuideBlock,
  GuideDesktopScale,
  GuideDocument,
  GuideLocale,
  GuideLocaleStatus,
  GuideMedia,
} from "../../models/guide";
import {
  GUIDE_DESKTOP_SCALE_MAX,
  GUIDE_DESKTOP_SCALE_MIN,
  GUIDE_DESKTOP_SCALE_STEP,
  guideLocaleStatuses,
} from "../../models/guide";
import { validateGuideDocument } from "../../services/guideContracts";
import {
  guideNavigation,
  loadGuideDocuments,
} from "../../services/guideContent";
import { GuideMediaVariantEditor } from "./GuideMediaVariantEditor";
import GuidePublishProtocolCheck from "./GuidePublishProtocolCheck";
import { chapterNavigation, GuideRenderer } from "./GuidePage";
import {
  assessLegacyGuideDraftUpgrade,
  createGuideDraftV2,
  draftConnectionMessage,
  safeDraftErrorMessage,
  guideDraftConnectionError,
  draftFingerprintChanged,
  getPublishedGuide,
  guideDraftClient,
  readStoredOperatorKey,
  clearStoredOperatorKey,
  guideFingerprint,
  retainedRevisionMetadata,
  refreshGuideDraft,
  resolveGuideDraftRefresh,
  saveGuideDraftEnvelope,
  upgradeLegacyGuideDraftToV2,
  upgradeLegacyGuideDraft,
  type GuideDraftEnvelope,
  type GuideDraftMeta,
  type PublishedGuideSnapshot,
} from "../../services/guideDrafts";
import {
  hasStagedGuideAssetPath,
  stagedGuideAssetPreviewForPath,
} from "../../services/guideAssetStaging";
import {
  collectGuideAssetReferences,
  confirmPublishIntent,
  getPublishEligibility,
  guidePublisher,
  requiresGuideKoTranslationGuard,
} from "../../services/guidePublisher";
import { usePublicationAssetBlocker } from "./usePublicationAssetBlocker";
import { guardPublicationAssets } from "../../services/guidePublicationAssets";
import {
  assessGuideKoTranslationReadiness,
  markGuideKoTranslationReady,
  refreshGuideKoTranslationSource,
  reopenGuideKoTranslationDraft,
  startGuideKoTranslation,
} from "../../services/guideTranslation";
import "./guide-editor.css";
import "./guide-editor-polish.css";
import "./guide-operator-login.css";
import "./guide-publish-feedback.css";
import "./guide-media-presentation-editor.css";
const source = loadGuideDocuments();
const locales: GuideLocale[] = ["en", "ko"];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function makeBlock(d: GuideDocument, t: GuideBlock["type"]): GuideBlock {
  const n = d.blocks.length + 1;
  const id = `${t}-${String(n).padStart(3, "0")}`;

  if (t === "divider") return { blockId: id, type: t };

  if (t === "screenshot") {
    return {
      blockId: id,
      type: t,
      media: { figureId: `${id}-figure`, variants: {} },
    };
  }

  if (t === "heading") {
    return {
      blockId: id,
      type: t,
      level: 2,
      content: { en: { text: "" }, ko: { text: "" } },
    };
  }

  if (t === "step") {
    return {
      blockId: id,
      type: t,
      step: d.blocks.filter((block) => block.type === "step").length + 1,
      content: { en: { text: "" }, ko: { text: "" } },
    };
  }

  if (t === "link") {
    return {
      blockId: id,
      type: t,
      href: "/guide",
      kind: "internal",
      content: { en: { text: "" }, ko: { text: "" } },
    };
  }

  return {
    blockId: id,
    type: t,
    content: { en: { text: "" }, ko: { text: "" } },
  };
}

function GuideDesktopSizeControl({
  media,
  onChange,
}: {
  media: GuideMedia;
  onChange: (media: GuideMedia) => void;
}) {
  const stored = media.presentation?.desktopScale;
  const effective = stored ?? GUIDE_DESKTOP_SCALE_MAX;
  const percent = Math.round(effective * 100);

  const setScale = (scale?: GuideDesktopScale) => {
    const next = clone(media);
    if (scale === undefined) {
      if (next.presentation) {
        delete next.presentation.desktopScale;
        if (!Object.keys(next.presentation).length) delete next.presentation;
      }
    } else {
      next.presentation = {
        ...(next.presentation ?? {}),
        desktopScale: scale,
      };
    }
    onChange(next);
  };

  const setPercent = (value: number) => {
    const clamped = Math.min(100, Math.max(10, Math.round(value / 10) * 10));
    setScale(clamped / 100);
  };

  return (
    <fieldset className="guide-desktop-size-control">
      <legend>DESKTOP SIZE</legend>
      <div className="guide-desktop-size-toolbar">
        <button
          type="button"
          aria-pressed={stored === undefined}
          onClick={() => setScale(undefined)}
        >
          AUTO
        </button>
        <strong>{stored === undefined ? `AUTO · ${percent}%` : `${percent}%`}</strong>
      </div>
      <div className="guide-desktop-size-range">
        <span>10%</span>
        <input
          type="range"
          min={GUIDE_DESKTOP_SCALE_MIN * 100}
          max={GUIDE_DESKTOP_SCALE_MAX * 100}
          step={GUIDE_DESKTOP_SCALE_STEP * 100}
          value={percent}
          aria-label="Desktop image size"
          onChange={(event) => setPercent(Number(event.target.value))}
        />
        <span>100%</span>
      </div>
      <small>
        Desktop only · 10% steps · Tablet and mobile keep their responsive width.
      </small>
    </fieldset>
  );
}

export default function GuideEditor() {
  const [selected, setSelected] = useState(source[0]?.guideId ?? "");
  const [doc, setDoc] = useState<GuideDocument>(() => clone(source[0]));
  const [baseline, setBaseline] = useState<GuideDocument>(() =>
    clone(source[0]),
  );
  const [dirty, setDirty] = useState(false);
  const [key, setKey] = useState(() => readStoredOperatorKey());
  const [connected, setConnected] = useState(false);
  const [restoringSession, setRestoringSession] = useState(
    () => Boolean(readStoredOperatorKey()),
  );
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const sessionRestoreStarted = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setMessage(safeDraftErrorMessage(error));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const [draft, setDraft] = useState<GuideDraftEnvelope>();
  const [history, setHistory] = useState<GuideDraftMeta[]>([]);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [publishedChanged, setPublishedChanged] = useState(false);
  const [previewLocale, setPreviewLocale] = useState<GuideLocale>("en");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [authoritative, setAuthoritative] = useState<PublishedGuideSnapshot>();
  const [authoritativeReady, setAuthoritativeReady] = useState(false);
  const [refreshConflicts, setRefreshConflicts] = useState<
    import("../../services/guideThreeWayMerge").GuideMergeConflict[]
  >([]);
  const [refreshResolutions, setRefreshResolutions] = useState<
    Record<string, "published" | "mine">
  >({});
  const [publishState, setPublishState] = useState<
    "IDLE" | "PUBLISHING" | "PUBLISHED" | "WARNING" | "FAILED"
  >("IDLE");
  const [publishMessage, setPublishMessage] = useState("");
  const [publishCommitSha, setPublishCommitSha] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [translationCheck, setTranslationCheck] = useState<Awaited<ReturnType<typeof assessGuideKoTranslationReadiness>>>();
  useEffect(() => {
    const stored = readStoredOperatorKey();
    if (!stored) {
      setRestoringSession(false);
      return;
    }

    // React StrictMode runs mount effects twice in development.
    // Restore exactly once and always leave the loading state.
    if (sessionRestoreStarted.current) return;
    sessionRestoreStarted.current = true;

    void run(async () => {
      try {
        const ok = await connect(stored);
        if (!ok) {
          clearStoredOperatorKey();
          setKey("");
        }
      } finally {
        setRestoringSession(false);
      }
    });
  }, []);
  const valid = useMemo(() => validateGuideDocument(doc), [doc]);
  useEffect(() => {
    let active = true;
    void assessGuideKoTranslationReadiness(doc).then((result) => { if (active) setTranslationCheck(result); });
    return () => { active = false; };
  }, [doc]);
  const applyTranslationTransition = async (
    transition: typeof startGuideKoTranslation,
    successMessage = "TRANSLATION UPDATED · Save Draft to persist.",
  ) => {
    const result = await transition(doc);
    if (result.ok) {
      setPublishState("IDLE");
      setPublishMessage("");
      setPublishCommitSha("");
      setDoc(result.document);
      setDirty(true);
      setMessage(successMessage);
    } else {
      setMessage(
        result.issues[0]?.message ?? "Translation transition is not available.",
      );
    }
  };
  const update = (fn: (d: GuideDocument) => void) => {
    setPublishState("IDLE");
    setPublishMessage("");
    setPublishCommitSha("");
    setDoc((old) => {
      const n = clone(old);
      fn(n);
      setDirty(true);
      return n;
    });
  };
  const refreshHistory = async (id = doc.guideId) => {
    const r = await guideDraftClient.listDraftRevisions(id);
    if (r.ok) {
      setHistory(retainedRevisionMetadata(r.revisions ?? []));
      return true;
    }
    setMessage("Draft history could not be loaded.");
    return false;
  };
  const connect = async (operatorKey = key): Promise<boolean> => {
    setMessage("CONNECTING…");
    const ok = await guideDraftClient.connect(operatorKey);
    if (!ok) {
      setConnected(false);
      setAuthoritativeReady(false);
      setMessage(guideDraftConnectionError());
      return false;
    }
    const published = await getPublishedGuide(doc.guideId);
    if (
      !published.ok ||
      !published.document ||
      !published.publishedFingerprint
    ) {
      setConnected(false);
      setAuthoritativeReady(false);
      setMessage(
        "CONNECTED · Published source could not be loaded. Editing is paused.",
      );
      return false;
    }
    const snapshot: PublishedGuideSnapshot = {
      guideId: published.guideId ?? doc.guideId,
      document: published.document,
      publishedFingerprint: published.publishedFingerprint,
      commitSha: published.commitSha,
    };
    if (snapshot.guideId !== doc.guideId) {
      setConnected(false);
      setAuthoritativeReady(false);
      setMessage("CONNECTED · Published source guide mismatch.");
      return false;
    }
    setAuthoritative(snapshot);
    setAuthoritativeReady(true);
    const r = await guideDraftClient.getDraft(doc.guideId);
    if (r.ok && r.draft) {
      setDraft(r.draft);
      setDoc(clone(r.draft.document));
      setBaseline(clone(r.draft.document));
      setDirty(false);
      setPublishedChanged(
        draftFingerprintChanged(r.draft, snapshot.publishedFingerprint),
      );
      await refreshHistory();
      setMessage("CONNECTED");
    } else if (!r.ok && r.code === "NO_DRAFT") {
      setDoc(clone(snapshot.document));
      setBaseline(clone(snapshot.document));
      setDirty(false);
      setMessage("CONNECTED");
    } else if (!r.ok) {
      setConnected(false);
      setAuthoritativeReady(false);
      setMessage(draftConnectionMessage(r));
      return false;
    }

    setConnected(true);
    return true;
  };
  const loadHead = async (force = false) => {
    if (
      dirty &&
      !force &&
      !window.confirm("Replace current unsaved edits with the latest Draft?")
    )
      return;
    const r = await guideDraftClient.getDraft(doc.guideId);
    if (r.ok && r.draft) {
      setDraft(r.draft);
      setDoc(clone(r.draft.document));
      setBaseline(clone(r.draft.document));
      setDirty(false);
      setConflict(false);
      setPublishedChanged(
        draftFingerprintChanged(
          r.draft,
          await guideFingerprint(source.find((d) => d.guideId === selected)!),
        ),
      );
      await refreshHistory();
      setMessage(`DRAFT LOADED · r${r.draft.revision}`);
    } else setMessage(r.ok ? "NO DRAFT" : draftConnectionMessage(r));
  };
  const loadRevision = async (revision: number) => {
    const r = await guideDraftClient.getDraftRevision(doc.guideId, revision);
    if (r.ok && r.draft) {
      setDoc(clone(r.draft.document));
      setBaseline(clone(r.draft.document));
      setDirty(true);
      setMessage(
        `UNSAVED RECOVERY STATE · r${revision} · HEAD r${draft?.revision ?? "?"}`,
      );
    } else
      setMessage(r.ok ? "Revision unavailable" : draftConnectionMessage(r));
  };
  const save = async () => {
    if (
      !authoritativeReady ||
      !authoritative ||
      authoritative.guideId !== doc.guideId
    ) {
      setMessage("Chapter source is not ready. Re-select this chapter before saving.");
      return;
    }
    let envelope: GuideDraftEnvelope;
    if (draft && draft.formatVersion === 2)
      envelope = { ...draft, document: clone(doc) };
    else if (draft) {
      const assessment = assessLegacyGuideDraftUpgrade(draft, authoritative);
      if (!assessment.eligible) {
        setPublishedChanged(true);
        setMessage(
          "PUBLISHED SOURCE CHANGED · This legacy Draft cannot be upgraded safely.",
        );
        return;
      }
      envelope = upgradeLegacyGuideDraftToV2(draft, authoritative);
      envelope = { ...envelope, document: clone(doc) };
    } else
      envelope = createGuideDraftV2({
        document: doc,
        published: authoritative,
      });
    const r = await saveGuideDraftEnvelope(
      doc.guideId,
      draft?.revision ?? null,
      envelope,
    );
    if (r.ok && r.draft) {
      setDraft(r.draft);
      setBaseline(clone(doc));
      setDirty(false);
      setConflict(false);
      await refreshHistory();
      setMessage("DRAFT SAVED · r" + r.draft.revision);
    } else if (!r.ok && r.code === "REVISION_CONFLICT") {
      setConflict(true);
      setMessage(
        "A newer saved Draft exists" +
          (r.currentRevision ? " (r" + r.currentRevision + ")" : "") +
          ". Your edits were preserved.",
      );
    } else setMessage(r.ok ? "DRAFT SAVED" : safeDraftErrorMessage(r));
  };
  const refresh = async () => {
    if (!draft || !authoritativeReady) {
      setMessage(
        "Published source is not ready. Connect again before refreshing.",
      );
      return;
    }
    setMessage("REFRESHING…");
    const r = await refreshGuideDraft(
      doc.guideId,
      draft.revision,
      draft.basePublishedFingerprint,
    );
    if (!r.ok) {
      setMessage(
        r.code === "REVISION_CONFLICT" ||
          r.code === "BASE_REVISION_CONFLICT" ||
          r.code === "REMOTE_REVISION_CONFLICT"
          ? "The published Guide changed again. Refresh once more to continue."
          : "REFRESH FAILED · Your current work was preserved.",
      );
      return;
    }
    if (r.status === "conflicts") {
      setRefreshConflicts(r.conflicts ?? []);
      setRefreshResolutions({});
      setMessage("REFRESH NEEDS REVIEW");
      return;
    }
    if (r.draft && r.authoritativePublished) {
      setDraft(r.draft);
      setDoc(clone(r.draft.document));
      setBaseline(clone(r.draft.document));
      setAuthoritative(r.authoritativePublished);
      setDirty(false);
      setPublishedChanged(false);
      setRefreshConflicts([]);
      await refreshHistory();
      setMessage(
        r.status === "already-current"
          ? "SAVED · Published source is current"
          : "REFRESHED · Changes preserved",
      );
    }
  };
  const resolveRefresh = async (
    conflictId: string,
    choice: "published" | "mine",
  ) => {
    if (!draft) return;
    const choices = { ...refreshResolutions, [conflictId]: choice };
    setRefreshResolutions(choices);
    setMessage("REFRESHING…");
    const r = await resolveGuideDraftRefresh(
      doc.guideId,
      draft.revision,
      draft.basePublishedFingerprint,
      choices,
    );
    if (!r.ok) {
      setMessage(
        r.code === "REMOTE_REVISION_CONFLICT"
          ? "The published Guide changed again. Refresh once more to continue."
          : "REFRESH FAILED · Your current work was preserved.",
      );
      return;
    }
    if (r.status === "refreshed" && r.draft && r.authoritativePublished) {
      setDraft(r.draft);
      setDoc(clone(r.draft.document));
      setBaseline(clone(r.draft.document));
      setAuthoritative(r.authoritativePublished);
      setDirty(false);
      setPublishedChanged(false);
      setRefreshConflicts([]);
      await refreshHistory();
      setMessage("REFRESHED · Changes preserved");
    } else if (r.status === "conflicts") {
      setRefreshConflicts(r.conflicts ?? []);
      setMessage("REFRESH NEEDS REVIEW");
    }
  };
  const discard = async () => {
    if (
      !draft ||
      !window.confirm(
        `Discard the saved Draft for “${doc.locales.en.title}”? The published Guide will not change.`,
      )
    )
      return;
    const r = await guideDraftClient.deleteDraft(doc.guideId);
    if (r.ok) {
      const fresh = clone(source.find((d) => d.guideId === selected)!);
      setDoc(fresh);
      setBaseline(fresh);
      setDraft(undefined);
      setHistory([]);
      setDirty(false);
      setConflict(false);
      setPublishedChanged(false);
      setMessage("DRAFT DISCARDED");
    } else setMessage("Draft could not be discarded.");
  };
  const logout = () => {
    clearStoredOperatorKey();
    setKey("");
    setConnected(false);
    setRestoringSession(false);
    sessionRestoreStarted.current = false;
    setAuthoritative(undefined);
    setAuthoritativeReady(false);
    setDraft(undefined);
    setHistory([]);
    setConflict(false);
    setPublishedChanged(false);
    setRefreshConflicts([]);
    setRefreshResolutions({});
    setPublishState("IDLE");
    setPublishMessage("");
    setConfirmPublish(false);
    setMessage("");
  };

  const reset = () => {
    if (!dirty || window.confirm("Reset changes?")) {
      setDoc(clone(baseline));
      setDirty(false);
    }
  };
  const choose = async (id: string) => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    const fresh = source.find((d) => d.guideId === id);
    if (fresh) {
      setSelected(id);
      setDoc(clone(fresh));
      setBaseline(clone(fresh));
      setDraft(undefined);
      setHistory([]);
      setConflict(false);
      setPublishedChanged(false);
      setDirty(false);
      setPublishState("IDLE");
      setPublishMessage("");
      setConfirmPublish(false);
      setMessage("");
      setAuthoritative(undefined);
      setAuthoritativeReady(false);

      if (connected) {
        // A working chapter can legitimately exist in the local Guide source
        // before it exists as a remotely published Guide. Use that exact local
        // source as the Draft V2 base for this chapter.
        const freshFingerprint = await guideFingerprint(fresh);
        const chapterSource: PublishedGuideSnapshot = {
          guideId: id,
          document: clone(fresh),
          publishedFingerprint: freshFingerprint,
        };
        setAuthoritative(chapterSource);
        setAuthoritativeReady(true);

        setMessage("CHECKING SAVED DRAFT…");
        const result = await guideDraftClient.getDraft(id);
        if (result.ok && result.draft) {
          setDraft(result.draft);
          setDoc(clone(result.draft.document));
          setBaseline(clone(result.draft.document));
          setDirty(false);
          setPublishedChanged(
            draftFingerprintChanged(
              result.draft,
              freshFingerprint,
            ),
          );
          await refreshHistory(id);
          setMessage(`DRAFT LOADED · r${result.draft.revision}`);
        } else if (!result.ok && result.code === "NO_DRAFT") {
          setMessage("CONNECTED · No saved Draft");
        } else {
          setMessage(draftConnectionMessage(result));
        }
      }
    }
  };
  const text = (i: number, l: GuideLocale, v: string) =>
    update((d) => {
      const b = d.blocks[i] as Extract<GuideBlock, { content: unknown }>;
      if (b.content) b.content[l] = { text: v };
    });
  const assetReadiness = usePublicationAssetBlocker(draft?.document);
  const assetBlocker = assetReadiness.reason;
  const baseEligibility = useMemo(
    () =>
      getPublishEligibility({
        connected,
        draftExists: Boolean(draft),
        dirty,
        historical: Boolean(
          draft && draft.revision !== history[0]?.revision && dirty,
        ),
        conflict,
        publishedChanged,
        document: doc,
        translationCheck,
      }),
    [connected, draft, dirty, history, conflict, publishedChanged, doc, translationCheck],
  );
  const draftMatchesPublishedBase =
    Boolean(authoritative?.commitSha) &&
    draft?.formatVersion === 2 &&
    !dirty &&
    JSON.stringify(draft.document) === JSON.stringify(draft.basePublishedDocument);

  const eligibility =
    baseEligibility.enabled && assetBlocker
      ? { enabled: false, reason: assetBlocker }
      : baseEligibility.enabled && draftMatchesPublishedBase
        ? {
            enabled: false,
            reason: "Up to date · Make and save a change before publishing again.",
          }
        : baseEligibility;

  const publishedEn = authoritative?.document.locales.en.status === "PUBLISHED";
  const publishedKo =
    authoritative?.document.locales.ko?.status === "PUBLISHED";
  const publishButtonComplete =
    publishState === "PUBLISHED" || draftMatchesPublishedBase;
  const publish = async () => {
    if (!draft || !eligibility.enabled) return;
    if (requiresGuideKoTranslationGuard(doc.guideId)) {
      const latestTranslationCheck = await assessGuideKoTranslationReadiness(doc);
      setTranslationCheck(latestTranslationCheck);
      if (!latestTranslationCheck.ready) {
        setPublishState("FAILED");
        setPublishMessage(
          `PUBLISH BLOCKED · ${latestTranslationCheck.issues[0]?.message ?? "Korean translation is not READY."}`,
        );
        return;
      }
    }
    if (
      !confirmPublishIntent(
        doc.locales.en.title,
        doc.guideId,
        draft.revision,
        doc.locales.en.status,
        doc.locales.ko?.status,
      )
    )
      return;
    setConfirmPublish(false);
    setPublishState("PUBLISHING");
    setPublishMessage("PUBLISHING…");
    const r = (await guardPublicationAssets(
      draft.document,
      () => guidePublisher.publish(doc.guideId, draft.revision),
      (reason) => {
        setPublishState("FAILED");
        setPublishMessage(reason);
      },
    )) as Awaited<ReturnType<typeof guidePublisher.publish>> | undefined;
    if (!r) return;
    if (!r.ok && r.code === "PUBLISH_SUCCEEDED_DRAFT_REBASE_FAILED") {
      setPublishState("WARNING");
      setPublishMessage(
        "PUBLISHED TO GITHUB · Private Draft baseline could not be refreshed.",
      );
    } else if (r.ok) {
      setPublishState("PUBLISHED");
      setPublishMessage(
        r.stagingWarning
          ? "Published successfully · Local asset cleanup needs attention."
          : "Published successfully.",
      );
      setPublishCommitSha(r.commitSha?.slice(0, 7) ?? "");
      setMessage("");

      const publishedDocument = r.draft?.document ?? doc;
      if (r.draft) {
        setDraft(r.draft);
        setDoc(clone(r.draft.document));
        setBaseline(clone(r.draft.document));
      } else {
        setDraft((prev) =>
          prev && r.draftRevisionAfterPublish
            ? { ...prev, revision: r.draftRevisionAfterPublish }
            : prev,
        );
      }

      setConflict(false);
      setPublishedChanged(false);
      setDirty(false);
      if (r.publishedFingerprint)
        setAuthoritative({
          guideId: doc.guideId,
          document: clone(publishedDocument),
          publishedFingerprint: r.publishedFingerprint,
          commitSha: r.commitSha,
        });
      await refreshHistory();
    } else {
      setPublishState("FAILED");
      setPublishMessage(
        r.code === "PUBLISHED_SOURCE_CHANGED"
          ? "PUBLISHED SOURCE CHANGED · Publication was blocked."
          : r.code === "PUBLISH_CONFLICT"
            ? "PUBLISH CONFLICT · The repository changed during publication."
            : r.code === "REVISION_CONFLICT"
              ? "PUBLISH CONFLICT · A newer saved Draft exists."
              : r.code === "UNPUBLISHED_ASSET_REFERENCE"
                ? "UNPUBLISHED ASSET · Referenced asset is not in the published repository."
                : r.code === "GITHUB_AUTH_FAILED"
                  ? "PUBLISH FAILED · GitHub publisher authentication is not configured."
                  : r.code === "GITHUB_SOURCE_NOT_FOUND"
                    ? "PUBLISH FAILED · Published Guide source or asset was not found."
                    : r.code === "GITHUB_WRITE_FAILED"
                      ? "PUBLISH FAILED · GitHub could not accept the publication."
                      : `PUBLISH FAILED · ${r.code}`,
      );
    }
  };
  const nav = chapterNavigation(doc.slug, source);
  const loginMessage =
    !busy &&
    message &&
    message !== "CONNECTED" &&
    !message.startsWith("CONNECTED ·")
      ? message
      : "";
  const workingLabel =
    publishState === "PUBLISHING"
      ? "Publishing Guide…"
      : message.startsWith("CHECKING PUBLISHED SOURCE")
        ? "Loading published source…"
        : message.startsWith("CHECKING SAVED DRAFT")
          ? "Loading saved Draft…"
          : message.startsWith("REFRESHING")
            ? "Refreshing Guide…"
            : "Working…";

  if (restoringSession) {
    return (
      <main className="operator-login-page">
        <div className="operator-login-backdrop" aria-hidden="true" />
        <section
          className="operator-session-restore"
          role="status"
          aria-live="polite"
        >
          <span className="operator-loader operator-session-restore-loader" aria-hidden="true" />
          <div>
            <p className="operator-kicker">ACCORD BOOK / OPERATOR</p>
            <strong>Restoring operator session…</strong>
            <small>Checking access, published source, and the latest saved Draft.</small>
          </div>
        </section>
      </main>
    );
  }

  if (!connected) {
    return (
      <main className="operator-login-page">
        <div className="operator-login-backdrop" aria-hidden="true" />
        <section
          className="operator-login-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="operator-login-title"
          aria-describedby="operator-login-description"
        >
          <div className="operator-login-brand">
            <p className="operator-kicker">ACCORD BOOK / OPERATOR</p>
            <h1 id="operator-login-title">Guide Editor</h1>
            <p id="operator-login-description">
              Enter the Operator Key to open the private Guide workspace.
            </p>
          </div>

          <form
            className="operator-login-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || !key.trim()) return;
              void run(async () => {
                const ok = await connect(key.trim());
                setRestoringSession(false);
                if (!ok && guideDraftConnectionError()) {
                  setMessage(guideDraftConnectionError());
                }
              });
            }}
          >
            <label htmlFor="guide-operator-key">Operator Key</label>
            <input
              id="guide-operator-key"
              type="password"
              value={key}
              autoComplete="off"
              autoFocus
              disabled={busy}
              onChange={(event) => {
                setKey(event.target.value);
                if (message) setMessage("");
              }}
              placeholder="Enter operator key"
            />

            <button
              className="operator-login-submit"
              type="submit"
              disabled={busy || !key.trim()}
            >
              {busy ? (
                <>
                  <span className="operator-loader" aria-hidden="true" />
                  CONNECTING
                </>
              ) : (
                "CONNECT"
              )}
            </button>

            <div className="operator-login-status" aria-live="polite">
              {busy ? (
                <span>
                  Checking access and loading the latest Guide data…
                </span>
              ) : loginMessage ? (
                <strong>{loginMessage}</strong>
              ) : key ? (
                <span>Operator Key ready · Press Connect to continue.</span>
              ) : (
                <span>Private operator access · Session-only credential.</span>
              )}
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <>
      {busy && (
        <div className="operator-working-indicator" role="status" aria-live="polite">
          <span className="operator-loader" aria-hidden="true" />
          <span>{workingLabel}</span>
        </div>
      )}
      <main className="operator-guide">
      <header>
        <div>
          <p className="operator-kicker">ACCORD BOOK / OPERATOR</p>
          <h1>Guide Editor</h1>
        </div>
        <span className="operator-notice">
          PRIVATE DRAFT · No public publish action
        </span>
        <span>{draft ? `DRAFT · r${draft.revision}` : "DRAFT · Not saved"}</span>
        <div className="operator-session-controls">
          <span className="connection-status header-connection-status" role="status">
            <span className="header-connection-dot" aria-hidden="true" />
            Connected
          </span>
          <button
            type="button"
            className="operator-logout"
            disabled={busy}
            onClick={() => {
              if (dirty && !window.confirm("Log out and discard current unsaved changes?")) return;
              logout();
            }}
          >
            LOG OUT
          </button>
        </div>
        {dirty && <strong className="dirty">UNSAVED CHANGES</strong>}
        <div className="header-actions">
          <button type="button" onClick={() => document.getElementById("guide-live-preview")?.scrollIntoView({ behavior: "smooth" })}>PREVIEW</button>
          <details className="editor-more">
            <summary>MORE</summary>
            <div className="editor-more-menu">
              <button type="button" onClick={() => document.getElementById("guide-draft-history")?.scrollIntoView({ behavior: "smooth" })}>Draft History</button>
              <button type="button" disabled={!dirty || busy} onClick={reset}>Discard unsaved changes</button>
              <button type="button" disabled={busy || !connected || !draft} onClick={() => void run(() => discard())}>Delete saved Draft</button>
              <button type="button" disabled={busy || !connected} onClick={logout}>Log out</button>
              {import.meta.env.DEV && <details className="more-diagnostics"><summary>Diagnostics</summary><GuidePublishProtocolCheck /></details>}
            </div>
          </details>
        </div>
      </header>
      <div className="operator-toolbar">
        <button
          type="button"
          disabled={
            busy ||
            !connected ||
            !authoritativeReady ||
            !dirty ||
            refreshConflicts.length > 0
          }
          onClick={() => void run(() => save())}
        >
          SAVE DRAFT
        </button>
        <section className="publication-panel">
          {assetReadiness.message && <small>{assetReadiness.message}</small>}
          <button
            type="button"
            className={publishButtonComplete ? "publish-complete" : undefined}
            disabled={
              busy ||
              publishState === "PUBLISHING" ||
              publishState === "WARNING" ||
              publishButtonComplete ||
              !eligibility.enabled
            }
            onClick={() => void run(() => publish())}
          >
            {publishButtonComplete ? "PUBLISHED" : "PUBLISH"}
          </button>
          {!eligibility.enabled &&
            publishState !== "PUBLISHED" &&
            !draftMatchesPublishedBase && <small>{eligibility.reason}</small>}
          {publishState === "WARNING" && (
            <small>
              Reconnect and load the latest Draft before publishing again.
            </small>
          )}
          {publishState !== "PUBLISHED" &&
            draftMatchesPublishedBase && (
              <small className="publish-up-to-date">
                Published version is current · Edit and save the Draft to publish again.
              </small>
            )}
        </section>
        {publishState !== "PUBLISHED" &&
          message &&
          message !== "CONNECTED" && (
            <div className="draft-status-area">
              <span role="status">{message}</span>
            </div>
          )}
        <label className="chapter-selector">
          Chapter
          <select
            value={selected}
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value;
              void run(() => choose(id));
            }}
          >
            {guideNavigation.map(([id, title], index) => (
              <option
                key={id}
                value={id}
                disabled={!source.some((d) => d.guideId === id)}
              >
                {String(index + 1).padStart(2, "0")} · {title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {publishState === "PUBLISHED" && (
        <section className="publish-receipt" role="status" aria-live="polite">
          <div className="publish-receipt-result">
            <strong>PUBLISHED</strong>
            {publishCommitSha && <code>{publishCommitSha}</code>}
            <span>{publishMessage || "Published successfully."}</span>
          </div>
          <div className="publish-receipt-meta">
            <small>GitHub updated · Public deployment may take a moment.</small>
            {(publishedEn || publishedKo) && (
              <nav className="publish-receipt-links" aria-label="Published Guide links">
                <span>VIEW</span>
                {publishedEn && (
                  <a
                    href={`https://accordbook.org/guide/en/${doc.slug}/`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    EN
                  </a>
                )}
                {publishedKo && (
                  <a
                    href={`https://accordbook.org/guide/ko/${doc.slug}/`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    KO
                  </a>
                )}
              </nav>
            )}
          </div>
        </section>
      )}
      {conflict && (
        <aside className="editor-warning">
          <b>REVISION CONFLICT</b>
          <span>Your current browser edits have been preserved.</span>
          <button type="button" onClick={() => void run(() => loadHead())}>
            LOAD LATEST DRAFT
          </button>
        </aside>
      )}
      {publishedChanged && (
        <aside className="editor-warning">
          <b>PUBLISHED SOURCE CHANGED</b>
          <span>The published Guide changed while you were working.</span>
          <button
            type="button"
            disabled={busy || refreshConflicts.length > 0}
            onClick={() => void run(() => refresh())}
          >
            REFRESH &amp; KEEP CHANGES
          </button>
        </aside>
      )}
      {refreshConflicts.length > 0 && (
        <aside className="editor-warning">
          <b>REFRESH NEEDS REVIEW</b>
          <span>
            {refreshConflicts.length} conflict
            {refreshConflicts.length === 1 ? "" : "s"} need your choice before
            refresh can continue.
          </span>
          {refreshConflicts.map((conflict) => (
            <div key={conflict.conflictId}>
              <strong>{conflict.fieldPath ?? conflict.kind}</strong>
              <small>Published and your version differ.</small>
              <button
                type="button"
                onClick={() =>
                  void run(() =>
                    resolveRefresh(conflict.conflictId, "published"),
                  )
                }
              >
                KEEP PUBLISHED
              </button>
              <button
                type="button"
                onClick={() =>
                  void run(() => resolveRefresh(conflict.conflictId, "mine"))
                }
              >
                KEEP MINE
              </button>
            </div>
          ))}
        </aside>
      )}
      <div className="operator-grid">
        <section className="operator-editor">
          <details className="document-settings">
            <summary>DOCUMENT SETTINGS · {doc.guideId}</summary>
            <fieldset>
            <legend>Chapter metadata</legend>
            <p className="readonly-meta">
              guideId: <b>{doc.guideId}</b> · slug: <b>{doc.slug}</b> · order:{" "}
              <b>{doc.order}</b>
            </p>
            {locales.map((l) => (
              <div className="locale-meta" key={l}>
                <h2>{l.toUpperCase()}</h2>
                {l === "ko" && translationCheck && (
                  <div className="translation-workflow" aria-label="Korean translation workflow">
                    <strong>KO · {translationCheck.legacyMode ? (doc.locales.ko?.status === "PUBLISHED" ? "PUBLISHED" : "NOT STARTED") : (translationCheck.translationState ?? "NOT_STARTED")}</strong>
                    {translationCheck.legacyMode && doc.locales.ko?.status === "PUBLISHED" ? (
                      <small>Translation tracking not initialized.</small>
                    ) : (
                      <>
                        {translationCheck.freshness === "STALE" || translationCheck.freshness === "STALE_DRAFT_SOURCE" ? (
                          <>
                            <small>EN changed since translation started. Review the KO copy, then update its EN source.</small>
                            {(doc.locales.ko?.translation?.state === "DRAFT" || doc.locales.ko?.translation?.state === "REVIEW") && (
                              <button
                                type="button"
                                onClick={() =>
                                  void applyTranslationTransition(
                                    refreshGuideKoTranslationSource,
                                    "EN SOURCE UPDATED · Review KO, then Mark Ready and Save Draft.",
                                  )
                                }
                              >
                                UPDATE EN SOURCE
                              </button>
                            )}
                          </>
                        ) : null}
                        {(!doc.locales.ko?.translation || doc.locales.ko.translation.state === "NOT_STARTED") && <button type="button" onClick={() => void applyTranslationTransition(startGuideKoTranslation, "TRANSLATION STARTED · Save Draft to persist.")}>START TRANSLATION</button>}
                        {(doc.locales.ko?.translation?.state === "DRAFT" || doc.locales.ko?.translation?.state === "REVIEW") && <button type="button" disabled={translationCheck.issues.some((issue) => issue.code !== "TRANSLATION_STATE_NOT_READY")} onClick={() => void applyTranslationTransition(markGuideKoTranslationReady, "TRANSLATION READY · Save Draft to persist.")}>MARK READY</button>}
                        {(doc.locales.ko?.translation?.state === "READY" || doc.locales.ko?.translation?.state === "REVIEW") && <button type="button" onClick={() => void applyTranslationTransition(reopenGuideKoTranslationDraft)}>REOPEN DRAFT</button>}
                        {translationCheck.issues.filter((issue) => issue.code !== "TRANSLATION_STATE_NOT_READY").length > 0 ? <small>Translation check · {translationCheck.issues.filter((issue) => issue.code !== "TRANSLATION_STATE_NOT_READY").length} item(s) need attention.</small> : <small>Translation complete · Ready for your review.</small>}
                      </>
                    )}
                  </div>
                )}
                <label>
                  Title
                  <input
                    value={doc.locales[l]?.title ?? ""}
                    onChange={(e) =>
                      update((d) => {
                        d.locales[l] = {
                          ...(d.locales[l] ?? d.locales.en),
                          title: e.target.value,
                        };
                      })
                    }
                  />
                </label>
                <label>
                  Subtitle
                  <input
                    value={doc.locales[l]?.subtitle ?? ""}
                    onChange={(e) =>
                      update((d) => {
                        d.locales[l] = {
                          ...(d.locales[l] ?? d.locales.en),
                          subtitle: e.target.value,
                        };
                      })
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={doc.locales[l]?.status ?? "DRAFT"}
                    onChange={(e) =>
                      update((d) => {
                        if (l !== "en" || e.target.value !== "NOT_TRANSLATED")
                          d.locales[l] = {
                            ...(d.locales[l] ?? d.locales.en),
                            status: e.target.value as GuideLocaleStatus,
                          };
                      })
                    }
                  >
                    {guideLocaleStatuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  SEO title
                  <input
                    value={doc.locales[l]?.seo.title ?? ""}
                    onChange={(e) =>
                      update((d) => {
                        d.locales[l] = {
                          ...(d.locales[l] ?? d.locales.en),
                          seo: {
                            ...(d.locales[l] ?? d.locales.en).seo,
                            title: e.target.value,
                          },
                        };
                      })
                    }
                  />
                </label>
                <label>
                  SEO description
                  <textarea
                    value={doc.locales[l]?.seo.description ?? ""}
                    onChange={(e) =>
                      update((d) => {
                        d.locales[l] = {
                          ...(d.locales[l] ?? d.locales.en),
                          seo: {
                            ...(d.locales[l] ?? d.locales.en).seo,
                            description: e.target.value,
                          },
                        };
                      })
                    }
                  />
                </label>
              </div>
            ))}
            </fieldset>
          </details>
          <div className="block-toolbar">
            <h2>Blocks</h2>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value)
                  update((d) =>
                    d.blocks.push(
                      makeBlock(d, e.target.value as GuideBlock["type"]),
                    ),
                  );
                e.currentTarget.value = "";
              }}
            >
              <option value="">+ ADD BLOCK</option>
              {[
                "heading",
                "paragraph",
                "step",
                "screenshot",
                "note",
                "warning",
                "divider",
                "link",
              ].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {doc.blocks.map((b, i) => (
            <section className="editor-block" key={b.blockId}>
              <header>
                <b>
                  {String(i + 1).padStart(2, "0")} · {b.type}
                </b>
                <code>{b.blockId}</code>
                <button
                  type="button"
                  onClick={() =>
                    update((d) => {
                      if (i > 0)
                        [d.blocks[i - 1], d.blocks[i]] = [
                          d.blocks[i],
                          d.blocks[i - 1],
                        ];
                    })
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update((d) => {
                      if (i < d.blocks.length - 1)
                        [d.blocks[i + 1], d.blocks[i]] = [
                          d.blocks[i],
                          d.blocks[i + 1],
                        ];
                    })
                  }
                >
                  ↓
                </button>
                <details className="block-actions">
                  <summary aria-label={`Actions for block ${i + 1}`}>⋯</summary>
                  <button type="button" onClick={() => update((d) => d.blocks.splice(i, 1))}>
                    Delete block
                  </button>
                </details>
              </header>
              {(b.type === "screenshot" || (b.type === "step" && b.media)) && (
                <div className="guide-media-editor-stack">
                  <GuideMediaVariantEditor
                    guideId={doc.guideId}
                    locale={previewLocale}
                    device={device}
                    media={b.type === "screenshot" ? b.media : b.media!}
                    onChange={(media) =>
                      update((d) => {
                        (d.blocks[i] as any).media = media;
                      })
                    }
                  />
                  <GuideDesktopSizeControl
                    media={b.type === "screenshot" ? b.media : b.media!}
                    onChange={(media) =>
                      update((d) => {
                        (d.blocks[i] as any).media = media;
                      })
                    }
                  />
                </div>
              )}{" "}
              {"content" in b && (
                <div className="localized-fields">
                  {locales.map((l) => (
                    <label key={l}>
                      {l.toUpperCase()}
                      <textarea
                        value={b.content[l]?.text ?? ""}
                        onChange={(e) => text(i, l, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>
          ))}
          {!valid.ok && (
            <div className="validation">
              <b>VALIDATION</b>
              {valid.issues.map((x, i) => (
                <p key={i}>
                  {x.path}: {x.message}
                </p>
              ))}
            </div>
          )}
        </section>
        <aside className="operator-preview" id="guide-live-preview">
          <div className="preview-controls">
            <strong>LIVE PREVIEW</strong>
            <button type="button" onClick={() => setPreviewLocale("en")}>
              EN
            </button>
            <button type="button" onClick={() => setPreviewLocale("ko")}>
              KO
            </button>
            <button type="button" onClick={() => setDevice("desktop")}>
              DESKTOP
            </button>
            <button type="button" onClick={() => setDevice("mobile")}>
              MOBILE
            </button>
          </div>
          <p className="route-preview">
            /guide/{previewLocale}/{doc.slug}/ · {nav.previous?.[1] ?? "—"} ←{" "}
            {nav.next?.[1] ?? "—"}
          </p>
          {draft && (
            <section className="draft-history" id="guide-draft-history">
              <h2>DRAFT HISTORY</h2>
              {history.map((r) => (
                <div key={r.revision}>
                  <span>
                    r{r.revision} · {new Date(r.updatedAt).toLocaleString()}{" "}
                    {r.revision === draft.revision ? "· CURRENT" : ""}
                  </span>
                  {r.revision !== draft.revision && (
                    <button
                      type="button"
                      onClick={() => void run(() => loadRevision(r.revision))}
                    >
                      LOAD REVISION
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          <article
            className={
              device === "mobile" ? "preview-frame mobile" : "preview-frame"
            }
          >
            <h1>{doc.locales[previewLocale]?.title ?? doc.locales.en.title}</h1>
            <p>
              {doc.locales[previewLocale]?.subtitle ?? doc.locales.en.subtitle}
            </p>
            <GuideRenderer
              document={doc}
              locale={previewLocale}
              deviceOverride={device}
              assetResolver={stagedGuideAssetPreviewForPath}
            />
          </article>
        </aside>
      </div>
      </main>
    </>
  );
}
