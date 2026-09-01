# Trip location sharing: server contract

Location sharing is **disabled by default**. The trip UI exposes the feature only when the server release gate is enabled. Current-location display and itinerary following do not implicitly enable sharing.

## Deployment release gate

The initial store is process memory, with no database table, filesystem write, snapshot, restart recovery, or coordinate log. It is intentionally usable only with one live server process. Every restart ends sharing and discards pending confirmations. Authorization reads the existing users, sessions and trip membership database.

The Helm chart owns both environment variables. Its default renders both as
`false`, regardless of `envFrom`; do not supply either name through `extraEnv`.
To enable the endpoints, use this release configuration:

```text
locationSharing.enabled=true
replicaCount=1
```

When enabled, the chart renders `LOCATION_SHARING_ENABLED=true` and
`LOCATION_SHARING_SINGLE_PROCESS=true` directly on the workload, requires one
replica, and changes the Deployment strategy to `Recreate`. This prevents an
old and a new pod from serving simultaneously during replacement. The setting
is still an operator assertion: PM2/Node clustering, multiple pods, and
independent servers sharing one database are unsupported. Horizontal deployment
requires a shared, atomically revocable ephemeral store with verified
persistence disabled before enabling this feature.

The chart default keeps sharing disabled. Enable an environment only after its
single-replica and non-overlapping replacement conditions have been verified.
Enabling sharing can trade availability for privacy during replacement: active
shares do not survive a restart.

Also verify request/response body logging is disabled at the proxy, WAF, application instrumentation and error telemetry; proxy caching is disabled for the subtree; host swap and crash-dump policies do not persist memory; and HTTPS terminates securely. These infrastructure controls have not been established by the application tests. No new TLS, backup-encryption, or network-policy guarantees are implied.

## Endpoints

All endpoints are under `/api/trips/:tripId/location-sharing`. Requests require a real, approved Mungchilog login session and current membership in that trip. A global administrator who is not a participant has no access. The local pseudo-user fallback does not grant location-sharing access; local integration uses isolated synthetic sessions and real local UX testing should use OIDC.

Responses, including denials, use `Cache-Control: private, no-store, max-age=0`. No CORS access is added. Mutations require the exact configured public `Origin` and `Content-Type: application/json`. Bodies are limited to 1 KiB. Query parameters are rejected. Never put a coordinate, consent token, or sender session ID in a URL, log, analytics event or error report.

| Method and path | Purpose |
| --- | --- |
| `GET /consent` | Fetch the current recipients, audience fingerprint, single-use confirmation token, permitted durations and disclosure that viewers need not share. Fetch only when opening a consent dialog. |
| `POST /` | Confirm recipients and duration and start one sender. Returns its opaque `sharingSessionId` once, plus its absolute expiry. |
| `PUT /` | Replace that sender's latest position. |
| `GET /` | Poll current positions, recipient list, own-sharing summary and server time. Never returns a sender capability. |
| `DELETE /` | Stop an owned sender, or notify explicit departure from the trip. |

Paths work without the final slash. All timestamps use Unix milliseconds. Recipient records contain only account ID and display name, not email or OIDC identifiers.

### Start

Submit these fields after showing the complete returned recipient list and obtaining explicit user confirmation:

```json
{
  "consentToken": "<opaque value from GET /consent>",
  "audienceVersion": "<fingerprint from GET /consent>",
  "consent": true,
  "durationSeconds": 3600,
  "takeover": false
}
```

Durations are 900, 3600 (default), or 14400 seconds. Confirmation tokens expire after two minutes and are bound to the account, browser login session, trip and exact recipient fingerprint. A new confirmation request from another tab supersedes the old pending confirmation. A successful start consumes the token, preventing an old start request from resurrecting a stopped share.

Only one sender per account may be active across all trips. Starting while one exists returns `409` unless `takeover: true` was explicitly confirmed. Taking over removes the old coordinate and invalidates the old sender capability. The frontend must not retry a `409` automatically with takeover enabled. The same applies to another tab using the same browser login cookie.

`GET /` returns `ownSharing` with the trip, deadline and `sameLoginSession`. That flag does not mean the current tab has permission to send: only the tab holding the once-returned sender capability can update. Do not persist the capability or positions to localStorage, IndexedDB or service-worker caches. A reload must require a new explicit start/takeover, not silent renewal.

### Update and stop

An update body contains `sharingSessionId`, `lat`, `lng`, `accuracy` (meters) and `measuredAt`. Latitude is between -90 and 90, longitude between -180 and 180, and accuracy between 0 and 100000 meters. Measurement time must be an integer, no older than 30 seconds and no more than five seconds ahead of the server. Repeated or older timestamps are rejected. Do not refresh a stale GPS measurement by inventing a new timestamp.

Updates must be at least two seconds apart. Additional per-account limits are 60 writes and 120 reads per minute; clients should poll every three to five seconds while visible, back off on `429`, and stop on authentication or membership failure. A stop is never rate limited.

A stop body contains only `sharingSessionId`. It deletes the sender, latest position and outstanding confirmation immediately. A stale device cannot stop a replacement sender. The same request can be sent when explicitly leaving the trip; a lost unload request cannot guarantee immediate deletion.

## Retention, revocation and client responsibilities

- Only the latest position is held, with accuracy, measurement time, receipt time and absolute expiry. Every accepted coordinate expires no later than 60 seconds after receipt, or sooner at the sharing deadline.
- Reads and writes enforce expiry even if background cleanup is delayed. A five-second memory sweep also removes expired positions. No history is stored, exported with trips or written to the existing SQLite/PostgreSQL database.
- Membership addition, removal or role changes terminate every share and pending confirmation for that trip. Account status/removal also invalidates affected trips. Recipient identity/status changes detected during a request invalidate old consent.
- Logout, login-session rotation and sender takeover invalidate the corresponding capability. Every read also checks that sender login sessions still exist and are unexpired.
- Sharing operations and application-controlled revocations use a single serialization boundary. Authentication is revalidated after body parsing within that boundary, so delayed request bodies, writes queued behind revocation, replayed confirmation and old-device updates cannot restore sharing.
- A live browser login session is still necessary even if a sharing capability was copied. User IDs supplied in request bodies are rejected; the sender identity always comes from authentication.
- Polling recipients see a stop on the next successful poll. Each client must additionally expire markers locally using `serverTime` and each coordinate's `expiresAt`, even if fetching fails. Never continue showing stale markers indefinitely while offline.
- Document visibility and location permission must govern frontend watchers. Returning to a visible page may resume only an unexpired, still-authorized sender with a newly measured coordinate. Background or screen-locked continuous tracking is not promised.

Location sharing sends voluntarily shared coordinates to the application server and the selected trip's participants. Any participant can view without sharing their own location. Do not imply reciprocal sharing or that already viewed information can be recalled from recipients.

## Client experience

- The trip page owns the sharing session. Closing the participant sheet does not stop an active share, and a persistent map status keeps the state and stop action reachable.
- Starting, actively publishing, temporarily interrupted, and another-tab or device states use distinct text. The UI does not claim that a position is shared until the first update has been accepted by the server.
- Polling continues while the visible trip page is mounted, even when the participant sheet is closed. Markers also expire locally from the server-adjusted deadline when polling cannot refresh them.
- Selecting a participant in the sheet or on the map focuses the same marker. Selecting it again, pressing Escape, or using the first app-level Back action clears that focus without changing itinerary order.
- Itinerary and participant focus are mutually exclusive. Every selected marker has a visible treatment and `aria-pressed`; selection is never conveyed by color alone.
- A trip-page unmount attempts to stop a locally owned sharing session. Reloading or opening another tab never restores the sender capability silently.
- The client sends at most one accepted device fix every two seconds, matching the server update contract.
- If the map provider fails, the itinerary remains usable and the sharing state and stop action remain available over the fallback.

## Verification

`apps/server/src/location-sharing.test.ts` uses Hono requests, synthetic sessions, a temporary SQLite database and controlled time. It covers trip isolation, nonparticipant administrators, approval state, CSRF, payload limits, recipient confirmation, single-device takeover, expiry, stale measurements, rate limits, membership changes, account removal, logout, trip deletion, late streamed bodies, concurrent start requests and persistent-storage exclusion.

Web tests cover consent, takeover, panel-independent lifecycle, update throttling, local marker expiry, persistent map state, map-provider failure, stop access, and participant marker selection. The generated service worker check confirms location-sharing responses cannot enter persistent runtime caches.

The tests exercise the existing authentication/session checks but do not perform a real IdP sign-in or logout. Real OIDC UX, reverse-proxy behavior, two-device movement, background behavior, GPS permission prompts, and deployment topology still require integration verification before the feature is enabled outside a controlled single-process environment.
