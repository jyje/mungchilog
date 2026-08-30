# Component ownership

`ui/` contains shadcn CLI-generated primitives. Treat those files as read-only
vendor source so they can be updated or regenerated predictably.

`system/` is the Mungchilog product layer. Place reusable wrappers, product
classes, interaction contracts, and map-specific compositions there. Screens
may use a primitive directly with its documented props and ordinary layout
values. Do not create a pass-through wrapper just to change those values.

The shared product tokens in `../index.css` remain the visual authority. New
component work must preserve existing light mode, dark mode, keyboard focus,
and 44 by 44 CSS pixel touch targets.
