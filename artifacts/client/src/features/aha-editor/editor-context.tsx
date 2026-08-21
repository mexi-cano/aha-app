import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  type NavigateOptions,
} from "react-router";
import { type Aha, type Job } from "@workspace/aha-domain";

import {
  dismissPrefillBanner,
  getEditorSnapshot,
  getAhaPdfState,
  persistEditedAha,
  replaceWithBlankAha,
  type AhaPdfState,
  type EditorSnapshot,
} from "@/data/aha-repository";
import type { DraftMetadata } from "@/data/draft-metadata";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { Button } from "@/components/ui/button";

import { getEditorLoadView, type EditorLoadError } from "./editor-load-state";
import {
  applyEditorMutationRules,
  type AhaEditorMode,
} from "./completed-update-grouping";
import { createSerializedPersistence } from "./persistence-queue";

export type SaveState = "saved" | "saving" | "error";

type FailedPersistenceOperation =
  | { kind: "autosave" }
  | { kind: "dismissBanner"; ahaId: string }
  | { kind: "startBlank"; ahaId: string; job: Job; date: Aha["date"] };

interface EditorContextValue {
  aha: Aha;
  job: Job;
  metadata: DraftMetadata;
  pdf: AhaPdfState;
  isCompletedLocked: boolean;
  editorMode: AhaEditorMode;
  editorBasePath: string;
  saveState: SaveState;
  isOnline: boolean;
  updateAha: (update: (current: Aha) => Aha) => void;
  commitAha: (update: (current: Aha) => Aha) => Promise<Aha | null>;
  navigateSafely: (path: string, options?: NavigateOptions) => Promise<boolean>;
  retrySave: () => Promise<boolean>;
  dismissBanner: () => Promise<void>;
  startBlank: () => Promise<boolean>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useAhaEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) {
    throw new Error("useAhaEditor must be used inside AhaEditorLayout");
  }
  return value;
}

function EditorLoadFailure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="min-h-screen bg-background px-5 py-12">
      <section className="mx-auto max-w-lg rounded-2xl border border-card-border bg-card p-7 shadow-sm">
        <h1 className="text-2xl font-bold">We couldn't open this AHA</h1>
        <p className="mt-3 text-base font-medium text-muted-foreground">
          {message} Its saved data has not been deleted.
        </p>
        <Button className="mt-6 min-h-12 px-6 text-base" onClick={onRetry}>
          Try again
        </Button>
      </section>
    </main>
  );
}

export function AhaEditorLayout() {
  const { ahaId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const editorMode = location.pathname.includes("/update/")
    ? "completed_update"
    : "initial";
  const isOnline = useOnlineStatus();
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<EditorLoadError | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [resetAnnouncement, setResetAnnouncement] = useState("");
  const [persistSerially] = useState(() =>
    createSerializedPersistence(persistEditedAha),
  );

  const draftRef = useRef<Aha | null>(null);
  const pendingRef = useRef<Aha | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const criticalSavePromiseRef = useRef<Promise<Aha | null> | null>(null);
  const sourcePdfStateRef = useRef<AhaPdfState>({
    status: "missing",
    record: null,
  });
  const loadGenerationRef = useRef(0);
  const failedOperationsRef = useRef(
    new Map<FailedPersistenceOperation["kind"], FailedPersistenceOperation>(),
  );

  const rememberFailure = useCallback(
    (operation: FailedPersistenceOperation) => {
      failedOperationsRef.current.set(operation.kind, operation);
      setSaveState("error");
    },
    [],
  );

  const settleSaveState = useCallback(() => {
    setSaveState(failedOperationsRef.current.size ? "error" : "saved");
  }, []);

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    const isCurrent = () => generation === loadGenerationRef.current;
    const clearLoadedSnapshot = () => {
      draftRef.current = null;
      sourcePdfStateRef.current = { status: "missing", record: null };
      setSnapshot(null);
    };

    if (!ahaId) {
      if (isCurrent()) {
        clearLoadedSnapshot();
        setLoadError({
          ahaId,
          message: "The AHA address is incomplete.",
        });
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const loaded = await getEditorSnapshot(ahaId);
      if (!isCurrent()) return;
      if (!loaded) {
        clearLoadedSnapshot();
        setLoadError({
          ahaId,
          message: "This AHA is not available on this iPad.",
        });
        return;
      }
      pendingRef.current = null;
      failedOperationsRef.current.clear();
      draftRef.current = loaded.aha;
      sourcePdfStateRef.current = loaded.pdf;
      setSnapshot(loaded);
      setSaveState("saved");
    } catch (error) {
      if (!isCurrent()) return;
      clearLoadedSnapshot();
      setLoadError({
        ahaId,
        message:
          error instanceof Error
            ? error.message
            : "Local storage is unavailable.",
      });
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [ahaId]);

  useEffect(() => {
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [load]);

  const applyMutationRules = useCallback(
    (current: Aha, next: Aha): Aha =>
      applyEditorMutationRules(
        current,
        next,
        editorMode,
        sourcePdfStateRef.current,
      ),
    [editorMode],
  );

  const runSaveQueue = useCallback((): Promise<boolean> => {
    if (savePromiseRef.current) {
      return savePromiseRef.current;
    }

    let saveFailed = false;
    const savePromise = (async () => {
      setSaveState("saving");

      while (pendingRef.current) {
        const pending = pendingRef.current;
        pendingRef.current = null;
        try {
          const saved = await persistSerially(pending);
          if (draftRef.current === pending) {
            draftRef.current = saved;
            setSnapshot((current) =>
              current ? { ...current, aha: saved } : current,
            );
          }
        } catch {
          saveFailed = true;
          pendingRef.current = pendingRef.current ?? pending;
          rememberFailure({ kind: "autosave" });
          return false;
        }
      }

      failedOperationsRef.current.delete("autosave");
      settleSaveState();
      return true;
    })().finally(() => {
      savePromiseRef.current = null;
      if (!saveFailed && pendingRef.current) {
        queueMicrotask(() => void runSaveQueue());
      }
    });

    savePromiseRef.current = savePromise;
    return savePromise;
  }, [persistSerially, rememberFailure, settleSaveState]);

  const flushAhaSaves = useCallback(async () => {
    let attemptedSave = false;
    while (pendingRef.current || savePromiseRef.current) {
      attemptedSave = true;
      const saved = await runSaveQueue();
      if (!saved) return false;
    }
    return (
      (attemptedSave || pendingRef.current === null) &&
      !failedOperationsRef.current.has("autosave")
    );
  }, [runSaveQueue]);

  const flushSaves = useCallback(async () => {
    if (!(await flushAhaSaves())) return false;
    return failedOperationsRef.current.size === 0;
  }, [flushAhaSaves]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden" && pendingRef.current) {
        void runSaveQueue();
      }
    };
    const flushOnPageHide = () => {
      if (pendingRef.current) {
        void runSaveQueue();
      }
    };

    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushOnPageHide);
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushOnPageHide);
    };
  }, [runSaveQueue]);

  const updateAha = useCallback(
    (update: (current: Aha) => Aha) => {
      const current = draftRef.current;
      if (!current) return;

      const next = applyMutationRules(current, update(current));
      if (next === current) return;
      draftRef.current = next;
      pendingRef.current = next;
      setSnapshot((value) =>
        value
          ? {
              ...value,
              aha: next,
              metadata: { ...value.metadata, hasUserEdits: true },
              pdf:
                value.pdf.status === "current" &&
                next.documentRevision !== current.documentRevision
                  ? { status: "stale", record: value.pdf.record }
                  : value.pdf,
            }
          : value,
      );
      setSaveState("saving");
      void runSaveQueue();
    },
    [applyMutationRules, runSaveQueue],
  );

  const commitAha = useCallback(
    (update: (current: Aha) => Aha): Promise<Aha | null> => {
      if (criticalSavePromiseRef.current) {
        return criticalSavePromiseRef.current;
      }

      const promise = (async () => {
        if (!(await flushSaves())) return null;
        const current = draftRef.current;
        if (!current) return null;

        setSaveState("saving");
        try {
          const next = applyMutationRules(current, update(current));
          const saved = await persistSerially(next);
          if (draftRef.current !== current) {
            return null;
          }
          draftRef.current = saved;
          pendingRef.current = null;
          failedOperationsRef.current.delete("autosave");
          setSnapshot((value) =>
            value
              ? {
                  ...value,
                  aha: saved,
                  metadata: { ...value.metadata, hasUserEdits: true },
                  pdf:
                    value.pdf.status === "current" &&
                    saved.documentRevision !== current.documentRevision
                      ? { status: "stale", record: value.pdf.record }
                      : value.pdf,
                }
              : value,
          );
          settleSaveState();
          return saved;
        } catch {
          setSaveState("error");
          return null;
        }
      })().finally(() => {
        criticalSavePromiseRef.current = null;
      });

      criticalSavePromiseRef.current = promise;
      return promise;
    },
    [applyMutationRules, flushSaves, persistSerially, settleSaveState],
  );

  const retrySave = useCallback(async () => {
    if (!failedOperationsRef.current.size && draftRef.current) {
      pendingRef.current = pendingRef.current ?? draftRef.current;
      failedOperationsRef.current.set("autosave", { kind: "autosave" });
    }

    setSaveState("saving");
    const operations = [
      failedOperationsRef.current.get("autosave"),
      failedOperationsRef.current.get("dismissBanner"),
      failedOperationsRef.current.get("startBlank"),
    ].filter((operation): operation is FailedPersistenceOperation =>
      Boolean(operation),
    );

    for (const operation of operations) {
      try {
        if (operation.kind === "autosave") {
          if (!pendingRef.current && draftRef.current) {
            pendingRef.current = draftRef.current;
          }
          if (!(await runSaveQueue())) return false;
          continue;
        }

        if (operation.kind === "dismissBanner") {
          if (!(await flushAhaSaves())) return false;
          await dismissPrefillBanner(operation.ahaId);
          failedOperationsRef.current.delete(operation.kind);
          setSnapshot((current) =>
            current?.aha.id === operation.ahaId
              ? {
                  ...current,
                  metadata: { ...current.metadata, bannerDismissed: true },
                }
              : current,
          );
          continue;
        }

        if (!(await flushAhaSaves())) return false;
        const replacement = await replaceWithBlankAha(
          operation.ahaId,
          operation.job,
          operation.date,
        );
        pendingRef.current = null;
        failedOperationsRef.current.clear();
        draftRef.current = replacement.aha;
        sourcePdfStateRef.current = replacement.pdf;
        setSnapshot(replacement);
        setResetAnnouncement(
          "Started with saved job details and crew. Previous work was removed.",
        );
      } catch {
        rememberFailure(operation);
        return false;
      }
    }

    settleSaveState();
    return failedOperationsRef.current.size === 0;
  }, [flushAhaSaves, rememberFailure, runSaveQueue, settleSaveState]);

  const navigateSafely = useCallback(
    async (path: string, options?: NavigateOptions) => {
      const saved = await flushSaves();
      if (saved) {
        const current = draftRef.current;
        if (current && path.includes(`/ahas/${current.id}/update/`)) {
          try {
            sourcePdfStateRef.current = await getAhaPdfState(current);
          } catch {
            // Retain the last successfully loaded state so a transient read
            // failure cannot discard saved work or block the local editor.
          }
        }
        navigate(path, options);
      }
      return saved;
    },
    [flushSaves, navigate],
  );

  const dismissBanner = useCallback(async () => {
    if (!snapshot) return;
    if (!(await flushSaves())) return;

    const operation: FailedPersistenceOperation = {
      kind: "dismissBanner",
      ahaId: snapshot.aha.id,
    };
    setSaveState("saving");
    try {
      await dismissPrefillBanner(operation.ahaId);
      failedOperationsRef.current.delete(operation.kind);
      setSnapshot((current) =>
        current?.aha.id === operation.ahaId
          ? {
              ...current,
              metadata: { ...current.metadata, bannerDismissed: true },
            }
          : current,
      );
      settleSaveState();
    } catch {
      rememberFailure(operation);
    }
  }, [flushSaves, rememberFailure, settleSaveState, snapshot]);

  const startBlank = useCallback(async () => {
    if (!snapshot) return false;
    if (!(await flushSaves())) {
      return false;
    }

    const operation: FailedPersistenceOperation = {
      kind: "startBlank",
      ahaId: snapshot.aha.id,
      job: snapshot.job,
      date: snapshot.aha.date,
    };
    setSaveState("saving");
    try {
      const replacement = await replaceWithBlankAha(
        operation.ahaId,
        operation.job,
        operation.date,
      );
      pendingRef.current = null;
      failedOperationsRef.current.clear();
      draftRef.current = replacement.aha;
      sourcePdfStateRef.current = replacement.pdf;
      setSnapshot(replacement);
      setResetAnnouncement(
        "Started with saved job details and crew. Previous work was removed.",
      );
      setSaveState("saved");
      return true;
    } catch {
      rememberFailure(operation);
      return false;
    }
  }, [flushSaves, rememberFailure, snapshot]);

  const loadView = getEditorLoadView({
    activeAhaId: ahaId,
    isLoading,
    loadError,
    snapshotAhaId: snapshot?.aha.id ?? null,
  });

  if (loadView === "failure") {
    return (
      <EditorLoadFailure
        message={loadError?.message ?? "Local storage is unavailable."}
        onRetry={() => void load()}
      />
    );
  }

  if (loadView === "loading") {
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <p className="mx-auto max-w-lg text-center text-base font-semibold text-muted-foreground">
          Opening today's AHA…
        </p>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <EditorLoadFailure
        message="Local storage is unavailable."
        onRetry={() => void load()}
      />
    );
  }

  if (editorMode === "completed_update" && snapshot.isCompletedLocked) {
    return (
      <main className="min-h-screen bg-background px-5 py-12 text-center">
        <h1 className="text-2xl font-bold">This AHA is read-only</h1>
        <p className="mx-auto mt-3 max-w-md text-base font-medium text-muted-foreground">
          A later AHA has already started for this job. Its signed checkpoint,
          PDFs, and document history remain available.
        </p>
        <Button
          className="mt-6 min-h-12"
          onClick={() => navigate(`/ahas/${snapshot.aha.id}/completed`)}
        >
          Return to Completed
        </Button>
      </main>
    );
  }

  const contextValue: EditorContextValue = {
    ...snapshot,
    editorMode,
    editorBasePath:
      editorMode === "completed_update"
        ? `/ahas/${snapshot.aha.id}/update`
        : `/ahas/${snapshot.aha.id}`,
    saveState,
    isOnline,
    updateAha,
    commitAha,
    navigateSafely,
    retrySave,
    dismissBanner,
    startBlank,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      <p className="sr-only" role="status" aria-live="polite">
        {resetAnnouncement}
      </p>
      <Outlet />
    </EditorContext.Provider>
  );
}
