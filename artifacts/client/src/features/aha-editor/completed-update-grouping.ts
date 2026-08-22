import { applyAhaMutationRules, type Aha } from "@workspace/aha-domain";

import { deriveAhaPdfState, type AhaPdfState } from "@/data/aha-repository";

export type AhaEditorMode = "initial" | "completed_update";

export function shouldShowPrefillBanner(editorMode: AhaEditorMode): boolean {
  return editorMode === "initial";
}

export function applyEditorMutationRules(
  current: Aha,
  next: Aha,
  editorMode: AhaEditorMode,
  loadedPdfState: AhaPdfState,
  now = new Date(),
): Aha {
  const currentPdfState = loadedPdfState.record
    ? deriveAhaPdfState(current, loadedPdfState.record)
    : loadedPdfState;

  return applyAhaMutationRules(current, next, {
    recordSigningUpdateAt: now,
    recordCompletedUpdateAt:
      editorMode === "completed_update" && !current.pendingCompletedUpdate
        ? now
        : undefined,
    completedUpdateBaselineRevision:
      currentPdfState.record?.sourceRevision ?? current.documentRevision,
  });
}
