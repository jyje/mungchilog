# Map experience: phase-one delivery

## Scope

This slice implements the adaptive shell (#18), personal current location (#19), and the disabled-by-default location-sharing server boundary (#21) from epic #17. It does not implement itinerary following (#20), the sharing toggle, or participant markers (#22).

The three areas were developed in separate worktrees and cross-reviewed. Integration retains the existing trip model, itinerary ordering, account approval policy, and selection toggle behavior. No production rollout or remote issue closure is part of this delivery.

## Automated verification

Run from each application directory:

```sh
# apps/web
npm test
npm run build
npm run lint
node scripts/check-location-cache.mjs

# apps/server
npm test
npm run build
```

- Web: 54 passing tests for adaptive states, saved layout preference, unsaved editor preservation, keyboard and pointer input, viewport geometry, location permission/error/stale states, watch cleanup, long-press preview, camera ownership, and no application requests or persistent writes from personal geolocation.
- Server: 46 passing tests, including 23 location-sharing integration scenarios using temporary SQLite data and synthetic authenticated sessions. These cover audience confirmation, authorization, takeover, concurrency, revocation, delayed requests, TTL, shortened login expiry, rate and payload limits, and absence of persistent coordinate writes.
- The generated service worker is inspected, not only its source configuration: location-sharing GET routes use NetworkOnly before the broader trip cache rule, and API paths cannot fall through to cached navigation HTML.
- Both TypeScript builds and `git diff --check` pass. Web lint retains the pre-existing `PlaceAutocompleteInput.tsx` set-state-in-effect warning; no new lint warnings were introduced.

## Rendered browser checks

The integrated web build was served against an isolated local database with the repository's sample trip. Browser checks used responsive viewport overrides, not physical devices.

| Viewport | Result |
| --- | --- |
| 390 x 844 | Bottom sheet; expanded map remains clear of the measured header; participant menu stays in bounds. |
| 768 x 1024 | Bottom sheet preserved on tablet portrait width. |
| 1024 x 768 | Automatic side panel after rotation to a wider viewport. |
| 1440 x 900 | Side and floating panels; readable place/local names; no document-level horizontal overflow. |
| 390 x 420 | Compact map allowance leaves scrollable itinerary content in a keyboard-height viewport. |

An itinerary place became selected, the same-place click cleared it, and Escape cleared it on the rendered page. DOM tests additionally cover menu Escape precedence and mounted unsaved edits through collapse/rotation. The original app-level Back and unsaved-edit guards are unchanged, but a complete Back/edit workflow was not exercised on a physical device.

Review corrections include the collapsed-phone/wide-panel menu mismatch, expanded-sheet control clearance, non-activating touch long-press help, local-name wrapping, camera insets, and client-visible expiry after login-session shortening.

## Limits and release gates

- The rendered browser checks did not use a live Maps key or device GPS. Maps pan/zoom, overlays, geolocation fixes, permission failures, and location lifecycle were tested with mocks. Real map-control/attribution overlap, actual device movement, and GPS permission prompts still require testing.
- Android Chrome, iOS/iPadOS Safari, actual mobile keyboards, browser zoom, and multiple physical sending devices were not exercised. The viewport and synthetic-session tests are not substitutes for those checks.
- The local browser used isolated development authentication. Full real-IdP login/logout was not repeated for these changes. Existing OIDC tests and real session validation in the location-sharing API passed.
- Personal location is not shared with trip participants or sent to application APIs. Using a third-party map can still generate provider requests as the map is moved; this is not a promise of no provider network traffic.
- Sharing stays OFF. It requires verified single-process, nonoverlapping replacement or a suitable shared ephemeral store before operational enablement. One replica with RollingUpdate does not meet this requirement. See [the server contract](location-sharing.md) for configuration, client obligations, and unverified infrastructure controls.

## Suggested commit boundaries

1. Web test runtime: package dependencies, test scripts, Vitest configuration and setup.
2. Adaptive map shell (#18): layout/context/geometry, readable header and cards, camera padding, and shell/geometry tests.
3. Personal geolocation (#19): ephemeral watch lifecycle, marker/control/status, explicit camera ownership, long-press help, and location tests.
4. Sharing security boundary (#21): memory store/API, revocation hooks, tests, service-worker exclusions and artifact check, server contract and delivery notes.

`TripMap.tsx` spans the second and third boundaries; stage it by behavior so the adaptive commit does not import the location component before that component exists. The cache-check package script belongs with the fourth boundary. Commits and pushes require their respective approval.
