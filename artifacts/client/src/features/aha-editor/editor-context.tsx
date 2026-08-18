import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import type { Aha, Job } from "@workspace/aha-domain";

import {
  dismissPrefillBanner,
  getEditorSnapshot,
  persistEditedAha,
  replaceWithBlankAha,
  type EditorSnapshot,
} from "@/data/aha-repository";
import type { DraftMetadata } from "@/data/draft-metadata";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { Button } from "@/components/ui/button";

export type SaveState = "saved" | "saving" | "error";

type FailedPersistenceOperation =
  | { kind: "autosave" }
  | { kind: "dismissBanner"; ahaId: string }
  | { kind: "startBlank"; ahaId: string; job: Job; date: Aha["date"] };

interface EditorContextValue {
  aha: Aha;
  job: Job;
  metadata: DraftMetadata;
  saveState: SaveState;
  isOnline: boolean;
  updateAha: (update: (current: Aha) => Aha) => void;
  navigateSafely: (path: string) => Promise<boolean>;
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
  const isOnline = useOnlineStatus();
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const draftRef = useRef<Aha | null>(null);
  const pendingRef = useRef<Aha | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
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

    if (!ahaId) {
      if (isCurrent()) {
        setLoadError("The AHA address is incomplete.");
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
        setLoadError("This AHA is not available on this iPad.");
        return;
      }
      pendingRef.current = null;
      failedOperationsRef.current.clear();
      draftRef.current = loaded.aha;
      setSnapshot(loaded);
      setSaveState("saved");
    } catch (error) {
      if (!isCurrent()) return;
      setLoadError(
        error instanceof Error
          ? error.message
          : "Local storage is unavailable.",
      );
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
          const saved = await persistEditedAha(pending);
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
  }, [rememberFailure, settleSaveState]);

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

      const next = update(current);
      draftRef.current = next;
      pendingRef.current = next;
      setSnapshot((value) =>
        value
          ? {
              ...value,
              aha: next,
              metadata: { ...value.metadata, hasUserEdits: true },
            }
          : value,
      );
      setSaveState("saving");
      void runSaveQueue();
    },
    [runSaveQueue],
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
        setSnapshot(replacement);
      } catch {
        rememberFailure(operation);
        return false;
      }
    }

    settleSaveState();
    return failedOperationsRef.current.size === 0;
  }, [flushAhaSaves, rememberFailure, runSaveQueue, settleSaveState]);

  const navigateSafely = useCallback(
    async (path: string) => {
      const saved = await flushSaves();
      if (saved) {
        navigate(path);
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
      setSnapshot(replacement);
      setSaveState("saved");
      return true;
    } catch {
      rememberFailure(operation);
      return false;
    }
  }, [flushSaves, rememberFailure, snapshot]);

  if (isLoading || (snapshot !== null && snapshot.aha.id !== ahaId)) {
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <p className="mx-auto max-w-lg text-center text-base font-semibold text-muted-foreground">
          Opening today's AHA…
        </p>
      </main>
    );
  }

  if (loadError || !snapshot) {
    return (
      <EditorLoadFailure
        message={loadError ?? "Local storage is unavailable."}
        onRetry={() => void load()}
      />
    );
  }

  const contextValue: EditorContextValue = {
    ...snapshot,
    saveState,
    isOnline,
    updateAha,
    navigateSafely,
    retrySave,
    dismissBanner,
    startBlank,
  };

  return (
    <EditorContext.Provider value={contextValue}>
      <Outlet />
    </EditorContext.Provider>
  );
}
