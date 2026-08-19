export type EditorLoadView = "failure" | "loading" | "ready";

export interface EditorLoadError {
  ahaId: string | undefined;
  message: string;
}

interface EditorLoadState {
  activeAhaId: string | undefined;
  isLoading: boolean;
  loadError: EditorLoadError | null;
  snapshotAhaId: string | null;
}

export function getEditorLoadView({
  activeAhaId,
  isLoading,
  loadError,
  snapshotAhaId,
}: EditorLoadState): EditorLoadView {
  if (loadError !== null) {
    return loadError.ahaId === activeAhaId ? "failure" : "loading";
  }
  if (isLoading || (snapshotAhaId !== null && snapshotAhaId !== activeAhaId)) {
    return "loading";
  }
  return snapshotAhaId === null ? "failure" : "ready";
}
