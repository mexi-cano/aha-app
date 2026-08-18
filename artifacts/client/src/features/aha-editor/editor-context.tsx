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

  const load = useCallback(async () => {
    if (!ahaId) {
      setLoadError("The AHA address is incomplete.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const loaded = await getEditorSnapshot(ahaId);
      if (!loaded) {
        setLoadError("This AHA is not available on this iPad.");
        return;
      }
      draftRef.current = loaded.aha;
      setSnapshot(loaded);
      setSaveState("saved");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Local storage is unavailable.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [ahaId]);

  useEffect(() => {
    void load();
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
          setSaveState("error");
          return false;
        }
      }

      setSaveState("saved");
      return true;
    })().finally(() => {
      savePromiseRef.current = null;
      if (!saveFailed && pendingRef.current) {
        queueMicrotask(() => void runSaveQueue());
      }
    });

    savePromiseRef.current = savePromise;
    return savePromise;
  }, []);

  const flushSaves = useCallback(async () => {
    let attemptedSave = false;
    while (pendingRef.current || savePromiseRef.current) {
      attemptedSave = true;
      const saved = await runSaveQueue();
      if (!saved) return false;
    }
    return attemptedSave || saveState !== "error";
  }, [runSaveQueue, saveState]);

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
    if (!pendingRef.current && draftRef.current) {
      pendingRef.current = draftRef.current;
    }
    return flushSaves();
  }, [flushSaves]);

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
    try {
      await dismissPrefillBanner(snapshot.aha.id);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              metadata: { ...current.metadata, bannerDismissed: true },
            }
          : current,
      );
    } catch {
      setSaveState("error");
    }
  }, [snapshot]);

  const startBlank = useCallback(async () => {
    if (!snapshot) return false;
    if (!(await flushSaves())) {
      return false;
    }

    try {
      const replacement = await replaceWithBlankAha(
        snapshot.aha.id,
        snapshot.job,
        snapshot.aha.date,
      );
      pendingRef.current = null;
      draftRef.current = replacement.aha;
      setSnapshot(replacement);
      setSaveState("saved");
      return true;
    } catch {
      setSaveState("error");
      return false;
    }
  }, [flushSaves, snapshot]);

  if (isLoading) {
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
