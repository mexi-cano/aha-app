import type { Job } from "@workspace/aha-domain";

export const JOB_SEARCH_THRESHOLD = 5;

const jobCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function sortJobsForSelection(jobs: readonly Job[]): Job[] {
  return [...jobs].sort((left, right) => {
    const byName = jobCollator.compare(left.name, right.name);
    if (byName !== 0) return byName;
    const byCity = jobCollator.compare(left.cityLabel, right.cityLabel);
    return byCity !== 0 ? byCity : left.id.localeCompare(right.id);
  });
}

export function filterJobsForSelection(
  jobs: readonly Job[],
  query: string,
): Job[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...jobs];
  return jobs.filter((job) =>
    `${job.name}\n${job.cityLabel}`.toLocaleLowerCase().includes(normalized),
  );
}
