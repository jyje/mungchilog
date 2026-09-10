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
| Overflow / "더보기" actions | `DropdownMenu` | See "더보기 메뉴 템플릿" below — do not improvise a shape per screen |
| Supplemental mobile workflow | `Sheet` | Bottom sheet on narrow screens |
| Destructive confirmation | `Dialog` | Clear cancel and destructive actions |
| Text, date, time, number, or file input | `Input` | Labelled and paired with errors or descriptions |
| Long text | `Textarea` | Labelled, resizable where appropriate |
| Native mobile-friendly choice | `NativeSelect` | Prefer for long time-zone and compact system lists |
| Boolean preference | `Checkbox` or `Switch` | Checkbox for a form decision, switch for an immediate setting |

`ButtonGroup` is for grouped actions. `ToggleGroup` is for state. `Tabs` is for switching content panels. These primitives are not interchangeable.

## 더보기 메뉴 템플릿

Every overflow menu in the app — trip-level (`TripActionsMenu`), per-spot (`SpotCard`'s `spot-context-menu`), or any new one — is the same `DropdownMenu` shape. Reference implementations: `apps/web/src/components/TripActionsMenu.tsx`, `apps/web/src/components/SpotCard.tsx`, and the gallery example in `apps/web/src/pages/gallery/ProductThemeGallery.tsx` (keep that example in sync — see AGENTS.md).

**Trigger**
- `Button` `variant="ghost"` (a menu embedded in a card/row) or `variant="secondary"` (a menu that is the primary affordance of its own toolbar), always `size="icon-lg"`.
- Icon is `MoreVertical` from `lucide-react`, `aria-hidden="true"`.
- `aria-label` and `title` are both `"{대상 이름} 더보기"` (e.g. `"여행 더보기"`, `` `${spot.name} 더보기` ``) — never a bare "더보기" once the menu is scoped to a named item.

**Content**
- `DropdownMenuContent align="end"`. Add a menu-specific class only for width/layout, never to restyle items.
- Group related items under a `DropdownMenuLabel` when the menu has more than one logical group (e.g. "여행" / "화면"). A single-purpose menu (like `SpotCard`'s edit/delete) skips the label.
- Put a `DropdownMenuSeparator` **between** groups only, never inside one, and always before a trailing destructive group.
- Every `DropdownMenuItem` / `DropdownMenuCheckboxItem` pairs a leading `lucide-react` icon (`aria-hidden="true"`) with a short Korean noun/verb label — no icon-only items, no trailing punctuation. The two-word "수정" / "삭제" style (no icon) is acceptable only in the smallest single-purpose menus that already match `SpotCard`'s existing pattern; any menu with more than two items or more than one group uses icon+label.
- A toggleable state (edit mode, visibility, a checked setting) is a `DropdownMenuCheckboxItem`, never a plain `DropdownMenuItem` that manually renders "on/off" text.
- A destructive action (`variant="destructive"` on the item) sits in its own trailing group after a separator and opens a confirmation `Dialog` — it never fires immediately from the menu.
- A menu that needs deeper navigation (a submenu of settings) uses `DropdownMenuSub` / `DropdownMenuSubTrigger` / `DropdownMenuSubContent`, not a second top-level trigger.

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
