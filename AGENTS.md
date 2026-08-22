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
