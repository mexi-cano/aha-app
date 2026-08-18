export type EditorLoadView = "failure" | "loading" | "ready";

interface EditorLoadState {
  activeAhaId: string | undefined;
  isLoading: boolean;
  loadError: string | null;
  snapshotAhaId: string | null;
}

export function getEditorLoadView({
  activeAhaId,
  isLoading,
  loadError,
  snapshotAhaId,
}: EditorLoadState): EditorLoadView {
  if (loadError !== null) return "failure";
  if (isLoading || (snapshotAhaId !== null && snapshotAhaId !== activeAhaId)) {
    return "loading";
  }
  return snapshotAhaId === null ? "failure" : "ready";
}
