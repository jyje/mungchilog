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
