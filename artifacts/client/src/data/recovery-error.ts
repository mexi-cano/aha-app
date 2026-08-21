import { ApiError } from "@workspace/api-client-react";

export function recoveryErrorMessage(
  error: unknown,
  isOnline: boolean,
): string {
  if (!isOnline) {
    return "Recovery is waiting for a connection. Your verified copies remain saved in this browser.";
  }
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Enter the crew access code, then try recovery again.";
    }
    if (error.status === 404) {
      return "A saved recovery item is no longer available. Nothing local was removed.";
    }
    if (error.status === 503 || error.status >= 500) {
      return "The recovery service is temporarily unavailable. Try again later.";
    }
  }
  return "Recovery stopped safely. Nothing verified was removed. Try again.";
}
