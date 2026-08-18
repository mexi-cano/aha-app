import Dexie, { type EntityTable } from "dexie";
import type { Aha, Job } from "@workspace/aha-domain";

import type { DraftMetadata } from "./draft-metadata";

export interface AppSetting {
  key: string;
  value: string;
}

export const ACTIVE_JOB_SETTING = "activeJobId";

class AhaDatabase extends Dexie {
  jobs!: EntityTable<Job, "id">;
  ahas!: EntityTable<Aha, "id">;
  settings!: EntityTable<AppSetting, "key">;
  draftMetadata!: EntityTable<DraftMetadata, "ahaId">;

  constructor() {
    super("its-aha");

    this.version(1).stores({
      jobs: "&id",
      ahas: "&id, &[jobId+date], jobId, date, status, sync.savedLocallyAt",
      settings: "&key",
      draftMetadata: "&ahaId, sourceAhaId",
    });
  }
}

export const ahaDatabase = new AhaDatabase();
