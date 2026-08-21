export interface PdfVersionIdentity {
  sourceRevision: number;
  generatedAt: string;
}

export class InvalidPdfVersionTimestampError extends Error {
  readonly name = "InvalidPdfVersionTimestampError";

  constructor(value: string) {
    super(`Invalid PDF version timestamp: ${value}`);
  }
}

const SUPPORTED_PDF_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|([+-])(\d{2})(?::?(\d{2}))?)$/;

export function canonicalizePdfTimestamp(value: string): string {
  const normalized = value.trim();
  const match = SUPPORTED_PDF_TIMESTAMP.exec(normalized);
  if (!match) {
    throw new InvalidPdfVersionTimestampError(value);
  }
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fraction,
    zone,
    ,
    offsetHour,
    offsetMinute,
  ] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const validDay = new Date(Date.UTC(yearNumber, monthNumber, 0)).getUTCDate();
  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > validDay ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    (offsetHour !== undefined && Number(offsetHour) > 23) ||
    (offsetMinute !== undefined && Number(offsetMinute) > 59)
  ) {
    throw new InvalidPdfVersionTimestampError(value);
  }
  const canonicalZone =
    zone === "Z" ? "Z" : `${zone!.slice(0, 3)}:${offsetMinute ?? "00"}`;
  const milliseconds = Date.parse(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction ?? ""}${canonicalZone}`,
  );
  if (!Number.isFinite(milliseconds)) {
    throw new InvalidPdfVersionTimestampError(value);
  }
  return new Date(milliseconds).toISOString();
}

export function isValidPdfTimestamp(value: string): boolean {
  try {
    canonicalizePdfTimestamp(value);
    return true;
  } catch {
    return false;
  }
}

export function pdfVersionIdentityKey(
  ahaId: string,
  sourceRevision: number,
  generatedAt: string,
): string {
  if (!ahaId || !Number.isInteger(sourceRevision) || sourceRevision < 0) {
    throw new Error("A valid PDF version identity is required");
  }
  return `${encodeURIComponent(ahaId)}:${sourceRevision}:${encodeURIComponent(
    canonicalizePdfTimestamp(generatedAt),
  )}`;
}

export function comparePdfVersionIdentity(
  left: PdfVersionIdentity,
  right: PdfVersionIdentity,
): number {
  return (
    left.sourceRevision - right.sourceRevision ||
    Date.parse(canonicalizePdfTimestamp(left.generatedAt)) -
      Date.parse(canonicalizePdfTimestamp(right.generatedAt))
  );
}

export function isSamePdfVersionIdentity(
  left: PdfVersionIdentity,
  right: PdfVersionIdentity,
): boolean {
  return comparePdfVersionIdentity(left, right) === 0;
}
