export function supportsNativeFileShare(
  hasShare: boolean,
  canShareFiles: boolean | null,
): boolean {
  return hasShare && canShareFiles === true;
}
