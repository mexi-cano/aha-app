import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";

import {
  getBackupSnapshot,
  getBackupSupportItems,
  retryBackupItem,
  subscribeBackupState,
  type BackupViewState,
} from "@/data/backup-runtime";
import { useAuthorization } from "@/features/auth/auth-context";
import { useRecoveryState } from "@/features/restore/restore-gate";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const copy: Record<BackupViewState, string> = {
  saved_local: "Saved on iPad",
  backing_up: "Backing up",
  backed_up: "Backed up",
  waiting_connection: "Backup waiting for connection",
  retry_scheduled: "Backup will retry — saved on iPad",
  paused_auth: "Backup paused — enter access code",
  support_required: "Backup needs support — local copy preserved",
};

export function BackupStatus({ className = "" }: { className?: string }) {
  const { requireAuthorization } = useAuthorization();
  const { isPaused } = useRecoveryState();
  const isOnline = useOnlineStatus();
  const [revision, setRevision] = useState(0);
  const [supportOpen, setSupportOpen] = useState(false);
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  useEffect(
    () => subscribeBackupState(() => setRevision((value) => value + 1)),
    [],
  );
  const snapshot = useLiveQuery(getBackupSnapshot, [revision]);
  const supportItems =
    useLiveQuery(supportOpen ? getBackupSupportItems : async () => [], [
      revision,
      supportOpen,
    ]) ?? [];
  const state = snapshot?.state ?? "saved_local";
  const Icon =
    state === "backed_up"
      ? Check
      : state === "backing_up"
        ? LoaderCircle
        : state === "waiting_connection"
          ? CloudOff
          : state === "paused_auth"
            ? LockKeyhole
            : state === "support_required" || state === "retry_scheduled"
              ? AlertTriangle
              : Cloud;
  const content = (
    <>
      <Icon
        className={`size-4 ${state === "backing_up" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span>{copy[state]}</span>
    </>
  );
  const supportDetails = supportItems
    .map((item) =>
      [
        `Artifact: ${item.title}`,
        `Queue identity: ${item.key}`,
        `State: ${item.state}`,
        `Failure code: ${item.failureCode ?? "none"}`,
        `Last attempt: ${item.lastAttemptAt ?? "not recorded"}`,
        `Local copy: ${item.localCopyState === "safe" ? "safe" : "preserved; needs support"}`,
      ].join("\n"),
    )
    .join("\n\n");
  const actionable =
    state === "support_required" ||
    state === "retry_scheduled" ||
    state === "waiting_connection" ||
    state === "paused_auth";

  const status = actionable ? (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center gap-2 rounded-md text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      onClick={() => {
        setCopyState("idle");
        setRetryError(null);
        setSupportOpen(true);
      }}
    >
      {content}
    </button>
  ) : (
    <p
      className={`inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-muted-foreground ${className}`}
      role="status"
    >
      {content}
    </p>
  );

  return (
    <>
      {status}
      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Backup support
            </DialogTitle>
            <DialogDescription className="text-base font-medium leading-relaxed">
              Your saved work remains on this iPad. Review each item below and
              retry when a connection and recovery state allow it.
            </DialogDescription>
          </DialogHeader>
          {!isOnline ? (
            <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-semibold text-warning-foreground">
              This iPad is offline. Retry becomes available after reconnecting.
            </p>
          ) : null}
          {isPaused ? (
            <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-semibold text-warning-foreground">
              Recovery is paused. Resume recovery before retrying backups.
            </p>
          ) : null}
          {retryError ? (
            <p
              className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive"
              role="alert"
            >
              {retryError}
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            {supportItems.map((item) => (
              <section
                key={item.key}
                className="rounded-[14px] border border-card-border bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold">{item.title}</h3>
                    <p className="mt-1 text-sm font-semibold text-muted-foreground">
                      {item.identity}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#C6CDE8] bg-secondary px-3 py-1 text-xs font-bold uppercase tracking-wide text-secondary-foreground">
                    {item.state.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium leading-relaxed">
                  {item.cause}
                </p>
                <dl className="mt-3 grid gap-1 text-sm text-muted-foreground">
                  <div className="flex gap-2">
                    <dt className="font-semibold">Last attempt:</dt>
                    <dd>
                      {item.lastAttemptAt
                        ? new Date(item.lastAttemptAt).toLocaleString()
                        : "Not recorded"}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-semibold">Local copy:</dt>
                    <dd>
                      {item.localCopyState === "safe"
                        ? "Safe on this iPad"
                        : "Preserved on this iPad; needs support"}
                    </dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 min-h-12 w-full border-[#C6CDE8] text-base font-bold text-primary sm:w-auto"
                  disabled={!isOnline || isPaused || retryingKey !== null}
                  onClick={async () => {
                    setRetryingKey(item.key);
                    setRetryError(null);
                    try {
                      const queued = await retryBackupItem(item.key);
                      if (!queued) {
                        setRetryError(
                          "That item is no longer waiting for backup. Refresh the panel and try again if it reappears.",
                        );
                      }
                    } catch {
                      setRetryError(
                        "We couldn't schedule that backup retry. The local copy was not removed.",
                      );
                    } finally {
                      setRetryingKey(null);
                    }
                  }}
                >
                  {retryingKey === item.key ? "Retrying…" : "Retry backup"}
                </Button>
              </section>
            ))}
          </div>
          <DialogFooter className="gap-2">
            {state === "paused_auth" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-12 text-base font-bold text-primary"
                onClick={() => {
                  setSupportOpen(false);
                  requireAuthorization();
                }}
              >
                Enter access code
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="min-h-12 text-base"
              disabled={!supportDetails}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(supportDetails);
                  setCopyState("copied");
                } catch {
                  setCopyState("failed");
                }
              }}
            >
              Copy support details
            </Button>
            <Button
              type="button"
              className="min-h-12 text-base"
              onClick={() => setSupportOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
          <p
            className="text-sm font-semibold text-muted-foreground"
            role="status"
          >
            {copyState === "copied"
              ? "Support details copied."
              : copyState === "failed"
                ? "Support details could not be copied on this device."
                : "Support details exclude signatures, PDF contents, access codes, and AHA text."}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
