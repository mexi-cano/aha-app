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
  subscribeBackupState,
  type BackupViewState,
} from "@/data/backup-runtime";
import { useAuthorization } from "@/features/auth/auth-context";

const copy: Record<BackupViewState, string> = {
  saved_local: "Saved on iPad",
  backing_up: "Backing up",
  backed_up: "Backed up",
  waiting_connection: "Backup waiting for connection",
  retry_scheduled: "Backup will retry — saved on iPad",
  paused_auth: "Backup paused — enter access code",
  support_required: "Backup needs support — saved on iPad",
};

export function BackupStatus({ className = "" }: { className?: string }) {
  const { requireAuthorization } = useAuthorization();
  const [revision, setRevision] = useState(0);
  useEffect(
    () => subscribeBackupState(() => setRevision((value) => value + 1)),
    [],
  );
  const snapshot = useLiveQuery(getBackupSnapshot, [revision]);
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
  return state === "paused_auth" ? (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      onClick={requireAuthorization}
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
}
