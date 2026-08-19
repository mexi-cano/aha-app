import type { LocalDate } from "@workspace/aha-domain";

export interface DraftMetadata {
  ahaId: string;
  sourceAhaId: string | null;
  sourceDate: LocalDate | null;
  bannerDismissed: boolean;
  hasUserEdits: boolean;
}

export function createBlankDraftMetadata(ahaId: string): DraftMetadata {
  return {
    ahaId,
    sourceAhaId: null,
    sourceDate: null,
    bannerDismissed: true,
    hasUserEdits: false,
  };
}

export function createCopiedDraftMetadata(
  ahaId: string,
  sourceAhaId: string,
  sourceDate: LocalDate,
): DraftMetadata {
  return {
    ahaId,
    sourceAhaId,
    sourceDate,
    bannerDismissed: false,
    hasUserEdits: false,
  };
}

export function markDraftEdited(metadata: DraftMetadata): DraftMetadata {
  return { ...metadata, hasUserEdits: true };
}

export function markPrefillBannerDismissed(
  metadata: DraftMetadata,
): DraftMetadata {
  return { ...metadata, bannerDismissed: true };
}
