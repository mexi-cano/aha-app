import { useLiveQuery } from "dexie-react-hooks";
import type { Aha } from "@workspace/aha-domain";

import { getAhaPdfState } from "@/data/aha-repository";

export function useAhaPdfState(aha: Aha) {
  return useLiveQuery(
    () => getAhaPdfState(aha),
    [aha.id, aha.documentRevision],
  );
}
