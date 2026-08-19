import type { AhaCrewMember } from "@workspace/aha-domain";

export function getForemanWorkerId(
  crew: readonly Pick<AhaCrewMember, "workerId" | "name">[],
  personInCharge: string,
): string | null {
  const normalizedPersonInCharge = personInCharge.trim().toLocaleLowerCase();
  if (!normalizedPersonInCharge) return null;

  return (
    crew.find(
      ({ name }) =>
        name.trim().toLocaleLowerCase() === normalizedPersonInCharge,
    )?.workerId ?? null
  );
}
