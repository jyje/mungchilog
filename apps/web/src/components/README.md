# Component ownership

`ui/` contains shadcn CLI-generated primitives. Treat those files as read-only
vendor source so they can be updated or regenerated predictably.

`system/` is the Mungchilog product layer. Place wrappers, product classes,
interaction contracts, and map-specific compositions there. Screens should use
the product layer rather than styling generated primitives directly.

The shared product tokens in `../index.css` remain the visual authority. New
component work must preserve existing light mode, dark mode, keyboard focus,
and 44 by 44 CSS pixel touch targets.
