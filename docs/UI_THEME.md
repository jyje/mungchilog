# Mungchilog UI theme

Mungchilog uses the generated shadcn primitives in `apps/web/src/components/ui/` without product-specific edits. Product contracts that combine primitives live in `apps/web/src/components/system/`.

The component gallery is the executable reference. A product control must use the same primitive, variant, size, state treatment, and theme tokens as its gallery example.

## Theme foundations

- `background` and `foreground`: the default application canvas and text.
- `card` and `card-foreground`: contained information surfaces.
- `primary` and `primary-foreground`: the highest-emphasis action in a region.
- `secondary` and `secondary-foreground`: a selected or quietly emphasised state.
- `muted` and `muted-foreground`: supporting surfaces and copy.
- `border` and `input`: separators and form-control boundaries.
- `ring`: the keyboard focus treatment.
- `destructive`: irreversible actions and their confirmation state.
- `radius`: the single source for the shadcn radius scale.

Light and dark themes override the same semantic tokens. Components must not introduce screen-specific foreground/background pairs when a semantic token already describes the role.

## Primitive and variant rules

| Intent | Primitive | Treatment |
| --- | --- | --- |
| Primary action | `Button` | `default`, one highest-emphasis action per region |
| Regular action | `Button` | `outline` |
| Quiet or icon action | `Button` | `ghost` |
| Current or selected action | `Button` | `secondary` plus `aria-current` or `aria-pressed` |
| Irreversible action | `Button` | `destructive`, confirmed in a `Dialog` |
| Related independent actions | `ButtonGroup` | Each button keeps its action variant |
| One-of-many state | `ToggleGroup` | `type="single"`, `variant="outline"` |
| Content view navigation | `Tabs` | `TabsList`, `TabsTrigger`, and `TabsContent` |
| Compact contextual edit | `Popover` | Triggered by a standard `Button` |
| Supplemental mobile workflow | `Sheet` | Bottom sheet on narrow screens |
| Destructive confirmation | `Dialog` | Clear cancel and destructive actions |
| Text, date, time, number, or file input | `Input` | Labelled and paired with errors or descriptions |
| Long text | `Textarea` | Labelled, resizable where appropriate |
| Native mobile-friendly choice | `NativeSelect` | Prefer for long time-zone and compact system lists |
| Boolean preference | `Checkbox` or `Switch` | Checkbox for a form decision, switch for an immediate setting |

`ButtonGroup` is for grouped actions. `ToggleGroup` is for state. `Tabs` is for switching content panels. These primitives are not interchangeable.

## Product interaction rules

- Planner controls use a 44px minimum target on touch surfaces.
- Connected controls retain shadcn radii and borders. Product CSS must not repaint primitive backgrounds, borders, or shadows.
- Selected state never relies on colour alone. Use a check, order label, visible inset treatment, or another persistent indicator together with the appropriate ARIA state.
- Icon-only controls have an accessible name and use `icon-lg` where they are primary mobile targets.
- Loading preserves the button label context and disables duplicate actions.
- Focus rings come from `ring`; product CSS must not remove them.
- Global selectors must not override elements carrying a shadcn `data-slot` attribute.

## Official references

- [Theming](https://ui.shadcn.com/docs/theming)
- [Button](https://ui.shadcn.com/docs/components/radix/button)
- [Button Group](https://ui.shadcn.com/docs/components/base/button-group)
- [Toggle Group](https://ui.shadcn.com/docs/components/base/toggle-group)
- [Tabs](https://ui.shadcn.com/docs/components/base/tabs)
- [Input](https://ui.shadcn.com/docs/components/radix/input)
- [Textarea](https://ui.shadcn.com/docs/components/base/textarea)
- [Native Select](https://ui.shadcn.com/docs/components/radix/native-select)
- [Checkbox](https://ui.shadcn.com/docs/components/radix/checkbox)
- [Popover](https://ui.shadcn.com/docs/components/base/popover)
- [Sheet](https://ui.shadcn.com/docs/components/base/sheet)

## Gallery organization

The gallery has five anchored entry points: Foundations, Components, Product
patterns, Map and routing, and Flows and states. Use English for documentation
and Korean for product examples. Keep each primitive example in one place;
product patterns may compose it with domain content.

Foundations display existing tokens rather than introducing another palette.
Accommodation uses `--stay`, `--stay-soft`, and `--stay-line` with an icon and
label. The native system font stack remains authoritative. Page gutters are
16px on phones, 32px on tablets, and 40px on desktop within a 1152px container.
Navigation wraps and stops being sticky below 640px.

Location sharing has independent, initially OFF and ON examples. Their labels
and ARIA state update together. These are local demonstrations and never request
geolocation or start a sharing session. Flight is a manual-input example, while
provider delay, unavailable routes, and offline copy are documented state samples.

### Preflight integration

This app intentionally omits Tailwind Preflight. Browser-default button padding
must therefore be reset for fixed-size Radix switches, checkboxes, and radio
items in the integration stylesheet. Otherwise the switch thumb extends outside
its track and the radio indicator's available width collapses. This reset lives
in a CSS layer, preserves primitive utilities, and does not edit generated
`components/ui/` files.

Verify both switch endpoints have a 1px track inset and aligned vertical centers,
including at 320px, 390px, tablet, and desktop widths in light and dark themes.
Check keyboard operation, horizontal overflow, and page gutters in a real browser;
DOM unit tests do not prove geometric alignment.
