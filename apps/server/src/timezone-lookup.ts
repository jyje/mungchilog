export const DEFAULT_TIMEZONE = "Asia/Seoul";

export function timestampForTripDate(date: string | undefined): number {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Math.floor(Date.now() / 1000);
  const [year, month, day] = date.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day, 12, 0, 0) / 1000;
  return Number.isFinite(timestamp) ? timestamp : Math.floor(Date.now() / 1000);
}

export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function timezoneFromGoogleResponse(value: unknown): string | null {
  const response = value as { status?: unknown; timeZoneId?: unknown } | null;
  return response?.status === "OK" && isIanaTimeZone(response.timeZoneId) ? response.timeZoneId : null;
}

/**
 * A human-readable reason a Google Time Zone API response did not yield a
 * timezone - for server logs only, never sent to the client. The route's
 * fallback (Asia/Seoul) stays the same regardless of the reason, but
 * REQUEST_DENIED (an API-key/permission problem) and OVER_QUERY_LIMIT are
 * configuration issues that need a person's attention, unlike a genuine
 * ZERO_RESULTS for coordinates the API just doesn't cover. Returns null
 * when the response is OK (nothing to report) or too malformed to say
 * anything more specific than "no timezone".
 */
export function describeGoogleTimezoneFailure(value: unknown): string | null {
  const response = value as { status?: unknown; errorMessage?: unknown } | null;
  if (!response || typeof response.status !== "string" || response.status === "OK") return null;
  const detail = typeof response.errorMessage === "string" && response.errorMessage.trim() ? `: ${response.errorMessage}` : "";
  return `${response.status}${detail}`;
}
