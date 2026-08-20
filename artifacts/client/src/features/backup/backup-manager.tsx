import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { ahaDatabase } from "@/data/database";
import { triggerBackupProcessing } from "@/data/backup-runtime";
import { AUTHORIZATION_CHANGED_EVENT } from "@/features/auth/auth-context";

export function BackupManager() {
  const queueVersion = useLiveQuery(async () => {
    const items = await ahaDatabase.backupQueue.toArray();
    return items.map((item) => `${item.key}:${item.clientUpdatedAt}`).join("|");
  });

  useEffect(() => {
    triggerBackupProcessing();
  }, [queueVersion]);

  useEffect(() => {
    const foreground = () => {
      if (document.visibilityState === "visible") triggerBackupProcessing();
    };
    window.addEventListener("online", triggerBackupProcessing);
    window.addEventListener(
      AUTHORIZATION_CHANGED_EVENT,
      triggerBackupProcessing,
    );
    document.addEventListener("visibilitychange", foreground);
    return () => {
      window.removeEventListener("online", triggerBackupProcessing);
      window.removeEventListener(
        AUTHORIZATION_CHANGED_EVENT,
        triggerBackupProcessing,
      );
      document.removeEventListener("visibilitychange", foreground);
    };
  }, []);

  return null;
}
