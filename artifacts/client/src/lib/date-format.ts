import type { LocalDate } from "@workspace/aha-domain";

export function dateFromLocalDate(value: LocalDate): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

export function formatLongDate(value: LocalDate): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(dateFromLocalDate(value));
}

export function formatShortDate(value: LocalDate): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(dateFromLocalDate(value));
}

export function formatEditorDate(value: LocalDate): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(dateFromLocalDate(value));
}
