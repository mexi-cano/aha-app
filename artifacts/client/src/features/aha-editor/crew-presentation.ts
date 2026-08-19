import type { AhaCrewMember } from "@workspace/aha-domain";

function normalizeComparableCrewName(value: string): string {
  return value.trim().toLowerCase();
}

export function getForemanWorkerId(
  crew: readonly Pick<AhaCrewMember, "workerId" | "name">[],
  personInCharge: string,
): string | null {
  const normalizedPersonInCharge = normalizeComparableCrewName(personInCharge);
  if (!normalizedPersonInCharge) return null;

  return (
    crew.find(
      ({ name }) =>
        normalizeComparableCrewName(name) === normalizedPersonInCharge,
    )?.workerId ?? null
  );
}
