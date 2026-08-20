import Dexie, { type EntityTable } from "dexie";
import type { Aha, Job } from "@workspace/aha-domain";

import type { DraftMetadata } from "./draft-metadata";

export interface AppSetting {
  key: string;
  value: string;
}

export interface AhaPdfRecord {
  ahaId: string;
  filename: string;
  bytes: ArrayBuffer;
  generatedAt: string;
  sourceRevision: number;
}

export const ACTIVE_JOB_SETTING = "activeJobId";

class AhaDatabase extends Dexie {
  jobs!: EntityTable<Job, "id">;
  ahas!: EntityTable<Aha, "id">;
  settings!: EntityTable<AppSetting, "key">;
  draftMetadata!: EntityTable<DraftMetadata, "ahaId">;
  ahaPdfs!: EntityTable<AhaPdfRecord, "ahaId">;

  constructor() {
    super("its-aha");

    this.version(1).stores({
      jobs: "&id",
      ahas: "&id, &[jobId+date], jobId, date, status, sync.savedLocallyAt",
      settings: "&key",
      draftMetadata: "&ahaId, sourceAhaId",
    });

    this.version(2).stores({
      jobs: "&id",
      ahas: "&id, &[jobId+date], jobId, date, status, sync.savedLocallyAt",
      settings: "&key",
      draftMetadata: "&ahaId, sourceAhaId",
      ahaPdfs: "&ahaId, sourceRevision, generatedAt",
    });
  }
}

export const ahaDatabase = new AhaDatabase();
