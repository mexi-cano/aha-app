export type EmergencyContactQuality = "blank" | "recognized" | "unrecognized";

const standalonePhoneCharacters = /^[+\d\s().-]+$/;
const northAmericanPhone =
  /(?:^|[^\d])(?:\+?1[\s().-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}(?=$|[^\d])/;
const internationalPhone = /(?:^|[^\d])\+\d(?:[\s().-]*\d){7,14}(?=$|[^\d])/;
const emergencyServiceNumber = /(?:^|[^\d])9[\s.-]*1[\s.-]*1(?=$|[^\d])/;

function formatNorthAmericanNumber(digits: string): string {
  const hasCountryCode = digits.length === 11;
  const offset = hasCountryCode ? 1 : 0;
  const area = digits.slice(offset, offset + 3);
  const exchange = digits.slice(offset + 3, offset + 6);
  const subscriber = digits.slice(offset + 6, offset + 10);
  const formatted = `(${area}) ${exchange}-${subscriber}`;
  return hasCountryCode ? `+1 ${formatted}` : formatted;
}

/**
 * Formats only an entire standalone North American number. Free-form safety
 * instructions, labels, extensions, and ambiguous content are returned exactly
 * as received.
 */
export function normalizeStandaloneEmergencyContact(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !standalonePhoneCharacters.test(trimmed)) return value;

  const digits = trimmed.replace(/\D/g, "");
  if (digits === "911") return "911";
  if (digits.length === 10 && !trimmed.startsWith("+")) {
    return formatNorthAmericanNumber(digits);
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return formatNorthAmericanNumber(digits);
  }
  return value;
}

export function classifyEmergencyContact(
  value: string,
): EmergencyContactQuality {
  const trimmed = value.trim();
  if (!trimmed) return "blank";
  if (
    emergencyServiceNumber.test(trimmed) ||
    northAmericanPhone.test(trimmed) ||
    internationalPhone.test(trimmed)
  ) {
    return "recognized";
  }
  return "unrecognized";
}
