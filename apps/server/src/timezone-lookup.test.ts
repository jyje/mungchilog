import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_TIMEZONE, isIanaTimeZone, timestampForTripDate, timezoneFromGoogleResponse } from "./timezone-lookup.js";

test("timezone lookup accepts an IANA id from Google and rejects invalid responses", () => {
  assert.equal(timezoneFromGoogleResponse({ status: "OK", timeZoneId: "Europe/Paris" }), "Europe/Paris");
  assert.equal(timezoneFromGoogleResponse({ status: "ZERO_RESULTS", timeZoneId: "Europe/Paris" }), null);
  assert.equal(timezoneFromGoogleResponse({ status: "OK", timeZoneId: "Not/AZone" }), null);
  assert.equal(isIanaTimeZone(DEFAULT_TIMEZONE), true);
});

test("timezone lookup uses midday of the trip date", () => {
  assert.equal(timestampForTripDate("2026-10-01"), Date.UTC(2026, 9, 1, 12, 0, 0) / 1000);
  assert.equal(Number.isFinite(timestampForTripDate(undefined)), true);
});
