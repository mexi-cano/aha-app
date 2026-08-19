import type { LocalDate } from "@workspace/aha-domain";

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const editorDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function dateFromLocalDate(value: LocalDate): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

export function formatLongDate(value: LocalDate): string {
  return longDateFormatter.format(dateFromLocalDate(value));
}

export function formatShortDate(value: LocalDate): string {
  return shortDateFormatter.format(dateFromLocalDate(value));
}

export function formatEditorDate(value: LocalDate): string {
  return editorDateFormatter.format(dateFromLocalDate(value));
}

export function formatTime(value: string): string {
  return timeFormatter.format(new Date(value));
}
