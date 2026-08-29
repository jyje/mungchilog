# Interaction

## Shared map and itinerary selection

- Map selection and itinerary selection are one shared interaction state. Selecting an item in either surface must update the other surface immediately.
- Selecting a place in the itinerary must pan and zoom the map to that place, highlight its marker, and make its itinerary order unambiguous.
- Selecting a place marker on the map must highlight and reveal the matching itinerary item without changing its order.
- Selecting an itinerary leg must select and highlight its matching route on the map. The map should fit or pan to the route when needed, while preserving enough surrounding context to understand the direction of travel.
- Selecting a route on the map must highlight the matching itinerary leg and its two endpoint places.
- A selected state must never rely on color alone. Use a visible focus treatment, an order label where relevant, and appropriate accessible state such as `aria-current` or `aria-selected`.
- Do not change the selected item, map viewport, or itinerary order as a side effect of hover. Hover may provide a subtle preview only.

## Dismissal and navigation

- Pressing Escape clears the current map and itinerary selection.
- The first app-level Back action while a selection is active clears that selection and keeps the user on the current itinerary. A subsequent Back action may navigate away normally.
- Clearing a selection removes the focused marker, route, and itinerary highlight, then restores the neutral map presentation without discarding edits or changing the current day.
- Selection must be reversible, predictable, and safe on mouse, keyboard, touch, and screen-reader workflows.

## Interaction quality

- Preserve context during focus changes. Avoid disorienting zoom jumps, hidden selected items, or overlapping controls.
- Support keyboard access to every selectable place and route. Keep focus visible and return focus to a sensible control after dismissal.
- On touch devices, ensure selected controls have adequate target size and that selection does not conflict with scroll, drag, or long-press interactions.
- Treat cross-highlighting, focused map movement, selection dismissal, and accessible feedback as baseline UX rather than optional polish whenever map and itinerary surfaces are present.

## Agent responsibility

- Apply these interaction principles proactively without waiting for an explicit reminder.
- When an interaction requirement is incomplete, conflicts with another behavior, risks data loss, or would create an accessibility or platform problem, explain the issue promptly and propose a concrete improvement before implementing the risky behavior.
- When implementing related UI, include reasonable supporting UX such as loading, empty, error, focus, and mobile states. Report any material limitation separately from completed work.

# Delivery and security work

- Split multi-concern work into independently verifiable functional slices. Create a local commit after each completed slice so behavior changes can be traced and reviewed separately.
- Validate authentication changes locally before requesting a remote deployment. When real OIDC credentials and a localhost callback registration are available, exercise the full login and logout flow rather than relying only on mocked configuration tests.
- Keep local OIDC credentials in ignored environment files only. Never commit, print, or include secret values, session tokens, authorization codes, or callback state in logs, commit messages, issues, or pull requests.
- Treat identity and session changes as database migrations. Preserve compatible existing records where safe, make any forced sign-out explicit, and cover the migration behavior with focused tests.
- Report security limitations and unverified infrastructure controls separately from application-level protections. Do not imply that storage encryption, backup encryption, network policy, or ingress headers are configured unless they have been verified.

# Component system ownership

- Treat `apps/web/src/components/ui/` as read-only shadcn CLI output. Do not make product-specific changes in generated files.
- Put application wrappers, composition helpers, and all product-specific classes in `apps/web/src/components/system/`, a sibling of `ui/`.
- Use a `components/system/` wrapper only when it carries a reusable product contract. Screens may import a generated primitive directly for its documented props and ordinary layout values. Do not create pass-through wrappers around shadcn primitives.
- Keep the existing product tokens in `apps/web/src/index.css` authoritative. shadcn tokens must map to them without silently changing existing light, dark, map, or accessibility behavior.
