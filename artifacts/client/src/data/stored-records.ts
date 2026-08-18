import { parseStoredAha, type Aha } from "@workspace/aha-domain";

export interface ReadableAhaPartition {
  records: Aha[];
  unreadableCount: number;
}

export function partitionReadableAhas(
  rows: readonly unknown[],
): ReadableAhaPartition {
  const records: Aha[] = [];
  let unreadableCount = 0;

  for (const row of rows) {
    try {
      records.push(parseStoredAha(row));
    } catch {
      unreadableCount += 1;
    }
  }

  return { records, unreadableCount };
}
