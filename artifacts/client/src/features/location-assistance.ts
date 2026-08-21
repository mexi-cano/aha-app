export function cityOrAreaLocationSuggestion(
  cityOrArea: string,
  currentLocation: string,
): string | null {
  const suggestion = cityOrArea.trim();
  if (!suggestion || suggestion === currentLocation.trim()) return null;
  return suggestion;
}

export function jobDefaultLocationSuggestion(
  jobDefaultLocation: string,
  currentLocation: string,
): string | null {
  if (
    !jobDefaultLocation.trim() ||
    jobDefaultLocation.trim() === currentLocation.trim()
  ) {
    return null;
  }
  return jobDefaultLocation;
}
