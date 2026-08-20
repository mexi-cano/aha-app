export type PdfOpenMode = "embedded" | "native";

export interface PdfViewerEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

export function getPdfOpenMode({
  userAgent,
  platform,
  maxTouchPoints,
}: PdfViewerEnvironment): PdfOpenMode {
  const identifiesIosDevice = /iPad|iPhone|iPod/i.test(userAgent);
  const isDesktopModeIpad = platform === "MacIntel" && maxTouchPoints > 1;
  return identifiesIosDevice || isDesktopModeIpad ? "native" : "embedded";
}

export function getCurrentPdfOpenMode(): PdfOpenMode {
  return getPdfOpenMode({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}
