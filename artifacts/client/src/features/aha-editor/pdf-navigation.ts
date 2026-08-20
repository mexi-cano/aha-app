import type { LocalDate } from "@workspace/aha-domain";

export type PdfReturnDestination = "home" | "history";

export interface PdfNavigationState {
  pdfReturnTo: PdfReturnDestination;
}

export interface PdfReturnNavigation {
  path: string;
  label: string;
}

export function createPdfNavigationState(
  destination: PdfReturnDestination,
): PdfNavigationState {
  return { pdfReturnTo: destination };
}

export function parsePdfReturnDestination(
  value: unknown,
): PdfReturnDestination | null {
  if (!value || typeof value !== "object") return null;
  const destination = (value as { pdfReturnTo?: unknown }).pdfReturnTo;
  return destination === "home" || destination === "history"
    ? destination
    : null;
}

export function resolvePdfReturnNavigation(
  state: unknown,
  ahaId: string,
  ahaDate: LocalDate,
  today: LocalDate,
): PdfReturnNavigation {
  const destination = parsePdfReturnDestination(state);
  if (destination === "home") return { path: "/", label: "Home" };
  if (destination === "history") {
    return { path: "/history", label: "History" };
  }
  return ahaDate === today
    ? { path: `/ahas/${ahaId}/completed`, label: "Completed" }
    : { path: "/history", label: "History" };
}
