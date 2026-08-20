import {
  parseStoredAha,
  parseStoredJob,
  type Aha,
  type Job,
} from "@workspace/aha-domain";

export interface ReadableRecordPartition<T> {
  records: T[];
  unreadableCount: number;
}

export function partitionReadableRecords<T>(
  rows: readonly unknown[],
  parse: (row: unknown) => T,
): ReadableRecordPartition<T> {
  const records: T[] = [];
  let unreadableCount = 0;

  for (const row of rows) {
    try {
      records.push(parse(row));
    } catch {
      unreadableCount += 1;
    }
  }

  return { records, unreadableCount };
}

export function partitionReadableAhas(
  rows: readonly unknown[],
): ReadableRecordPartition<Aha> {
  return partitionReadableRecords(rows, parseStoredAha);
}

export function partitionReadableJobs(
  rows: readonly unknown[],
): ReadableRecordPartition<Job> {
  return partitionReadableRecords(rows, parseStoredJob);
}
