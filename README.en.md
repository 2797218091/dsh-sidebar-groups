# dsh-sidebar-groups

Once the DSH sidebar holds more than the window is tall, the lower rows get clipped: some panel rows become unclickable
and the workspace list is cut in half. This plugin makes the whole column — panel navigation plus workspaces — **one scrolling
area** with the logo strip and the footer pinned, and lets you **group** either list into foldable groups that survive a restart.

![The sidebar scrolling as one area, with grouped navigation](docs/screenshots/after.png)

```sh
dsh plugin add github:2797218091/dsh-sidebar-groups
```

Chinese: [README.md](README.md)

## Install

### From source (recommended)

```sh
dsh plugin add github:2797218091/dsh-sidebar-groups
```

The build output `lib/` is committed, and `package.json` declares no `prepare` / `postinstall` lifecycle script,
so this command **compiles nothing** and does not trip pnpm's `allowBuilds` build approval.

### Optional: from npm

To ship the same build through npm, publish it once:

```sh
npm publish
```

then install by package name:

```sh
dsh plugin add dsh-sidebar-groups
```

<!-- TODO: the by-package-name form follows the README of the published dsh-boot-animation plugin; it was not executed for this repository. -->

### After installing

1. **Restart DSH once**: the bundle layer is assembled at startup, so nothing mounts until you do.
2. In the browser press **Ctrl+Shift+R**: client bundles are served with an `immutable` cache header, and a plain F5 keeps the old copy.

## What it does

- **F1 One scrolling column** — panel rows and workspaces share a single scroll container, so the wheel works anywhere over the
  column, including over workspace rows. The top strip and the footer buttons stay put; `overscroll-behavior: contain` keeps
  the scroll from leaking into the page. The scrollbar is thin and only becomes visible on hover, and its appearance does not
  shift the column sideways. Content shorter than the viewport shows no scrollbar at all.
- **F2 Navigation groups** — every panel row is addressed by a stable id taken from the slot registry, never by its displayed
  text. Each row can stay on top or move into any group, groups fold, and the order of both groups and rows is adjustable with
  the up / down buttons in the panel. Placement, folded state and order survive a restart.
- **F3 Workspace groups** — workspace sections group and fold the same way, with a configuration independent from the navigation
  side. With fewer than two populated groups no group header is drawn, so an empty header never appears.
- **F4 Configuration entry point** — the **Groups** button at the bottom of the sidebar opens the panel, and changes take effect
  immediately with no reload. Configuration is written into the profile's mount row, so it survives a restart; a legacy
  standalone config file is imported once and never overwrites a value you have already written through the panel.
- **F5 No regressions** — clicking, navigation, the active state, icons and tooltips of the original rows behave exactly as
  before. The collapsed icon rail and the narrow drawer mode do not break or drift (the plugin stays out of both, see
  Known limitations). No horizontal scrollbar, and never a second sidebar.
- **F6 Safety** — no network requests, no remote scripts, no `eval`. The only file it reads is the one-time legacy import
  on the host side (`sidebar-groups.json` in the profile directory, read only if it exists).

Before and after, same window size and same light theme: `docs/screenshots/before.png` and `docs/screenshots/after.png`.

## How to use

1. Click the **Groups** button at the bottom of the sidebar (it sits in the settings row; in the collapsed icon rail only the
   icon is shown, with the label as a native tooltip).
2. In the panel, top to bottom:
   - the `Scroll the whole column (header and footer stay fixed)` checkbox — turning it off restores the stock DSH layout;
   - a `Navigation rows` section with a `+ Group` button; each group has a fold caret, move up, move down and delete
     (at least one group always remains); each row inside a group has its label, move up, move down and a **move to group**
     dropdown;
   - a `Workspaces` section with the same controls;
   - `Restore defaults` and `Done` at the bottom.
   Click the overlay or press `Esc` to close.
3. Default preset: the top level keeps **Plugins, Plugin market and Task board** (the top group renders no header row), and
   everything else goes into a **More** group that starts folded. Workspaces ship as a single **Workspaces** group, which is
   why no group header is drawn there.
4. Changes apply and are written back immediately, no reload needed, and the same layout is there after a DSH restart.

The panel while open: `docs/screenshots/grouped.png`. The icon rail and the narrow drawer: `docs/screenshots/collapsed.png` and `docs/screenshots/narrow.png`.

### How those three defaults are recognised

Panel rows carry no `data-panel-id` in the DOM, so the only identity the plugin shares with the registry is the label
resolved from `ctx.slots.entriesOfSlot('sidebar.panellist')`. The shipped preset is therefore computed like this:

- compare the **registry's labels at that moment** against a candidate list (Chinese and English entries, matched
  case-insensitively and ignoring surrounding whitespace);
- if nothing matches, fall back to **registry order**, taking positions 1, 2 and 5;
- **compute once, then persist**: every later read and write is keyed by the ids that produced, never by displayed text and
  never by a hardcoded language.

## Configuration

State lives in a `settings` namespace whose name **is** the `id` of the insert row in `cordis.patch.yml`:

```yaml
- insert:
    - id: sidebar-groups
      name: dsh-sidebar-groups
```

### The host-side `Config` (`src/index.ts`)

| Field | Type | Meaning |
|---|---|---|
| `state` | `Schema.any()`, default `null` | the whole state document, shaped by `src/client/config.ts`; `null` and `undefined` both mean never configured |
| `legacyImported` | `Schema.boolean()`, default `false` | whether the legacy standalone config file has been imported once |

Both fields carry `.extra('volatile', true)`, which is what puts them on the settings form.

### Shape of `state` (`src/client/config.ts`)

```ts
interface SidebarGroupsState {
  version: number      // currently STATE_VERSION = 1
  scrolling: boolean   // whole-column scrolling; off restores the stock DSH layout
  nav: { groups: GroupSpec[] }
  workspaces: { groups: GroupSpec[] }
}

interface GroupSpec {
  id: string           // stable id; the shipped preset uses top / more / ws-all
  label: string        // group title; new groups default to a generic name in the panel
  collapsed: boolean   // folded or not
  showHeader: boolean  // false = no header row and no fold control (that is the top group)
  items: string[]      // member ids
}
```

- `version`: `STATE_VERSION = 1`.
- `scrolling`: the `Scroll the whole column` checkbox in the panel; `true` out of the box.
- `nav` / `workspaces`: the two sections are **fully independent**; changing one leaves the other alone.
- The three group ids that exist in the shipped default are `top`, `more` and `ws-all`. `top` and `ws-all` have
  `showHeader: false`, and `more` has `collapsed: true`.
- What `items` holds: on the navigation side, ids from `entriesOfSlot('sidebar.panellist')`; on the workspace side, the
  title text of each workspace section (whitespace collapsed, truncated to 160 characters). That workspace exception is
  Known limitations item 2.
- When a panel is installed or removed, **ids that no longer exist stay in the config** (so your placement is not lost) and
  **newly seen ids join the last group** (the folded one), so a new panel never pushes itself into the top level.

### Where it lives, and when it is written

- It is written into the **current profile's entry config** (`dsh-settings` delegates the write to config-editor, which lands
  it in the profile's Cordis patch), which is why a restart keeps it.
- The client half **cannot** write the entry config directly. It only calls the plugin's own two routes:
  `/sidebar-groups/api/state` (read) and `/sidebar-groups/api/update` (POST write).
- Writes carry `expectedRevision` as an optimistic lock: a concurrent writer gets a 409 instead of silently losing its document.
- The browser also keeps a `localStorage` mirror (key `dsh-sidebar-groups:state`) as a fallback for when the host route is
  unavailable.

## Known limitations

Ordered by impact. These are not a wish list — they are the real edges of the current implementation.

1. **Workspaces can be folded as a block, but not reordered.** Workspace rows are React-owned nodes, and a `cloneNode` copy
   does not receive React 18's root-level event delegation (the event target carries no internal fiber key), so the copy is
   dead to clicks. The workspace side therefore only hides a whole section and draws its own fold header; rows are neither
   copied nor moved. You can choose which section belongs to which group and whether a group is folded, but **you cannot
   reorder workspace rows themselves**.
2. **A workspace group key is the section's title text.** Workspace sections expose no id, so the plugin keys them by their
   title (whitespace collapsed, truncated to 160 characters). The consequence is blunt: **renaming a workspace loses its group
   assignment** and it falls back to the first group. The navigation side does not have this problem — it keys by slot
   registry id.
3. **A fold header only appears when there is more than one group and at least two sections.** The shipped default has a
   single group, so the first install is a **visual no-op** — that is exactly what keeps an empty header off the screen, and
   the price is that a single group has nothing to click.
4. **The navigation group container is appended to the end of `<nav>`**, and that is the plugin's only write into a
   React-managed container. It only appends, re-appends to the end on every refresh, and never moves or deletes a framework
   node; but when React adds a row, our container sits ahead of it for a moment until the next 200 ms debounced refresh
   corrects it. This conflicts with item 3 of the original brief's prohibitions and follows the frozen decision instead; the
   risk is annotated in `dom-adapter.ts`.
5. **`resolveSlotLabel` from the platform seed is not `require`d**; a local equivalent is used instead (it accepts
   `string` or `() => string`), which drops one seed dependency. If a label ever becomes an object, alignment degrades
   to registry order.
6. **The only alignment key between a navigation row and an id is `aria-label`** (the DOM has no `data-panel-id`). The
   plugin **hardcodes no language**: at runtime it compares `aria-label` against **the labels the registry resolves at that
   same moment** and falls back to registry order when nothing lines up. This is the sanctioned exception to never matching
   displayed text, and the reasoning is in `align()` in `dom-adapter.ts` and in the comments in `config.ts`. The default
   preset (Plugins / Plugin market / Task board) is computed from the same candidate list plus that order fallback, and is
   **persisted once, after which only ids are used**.
7. **The sticky footer's background is read from live styles first**: `getComputedStyle(root).backgroundColor`, and only
   when that is empty does it fall back to
   `var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, transparent))`. With a custom theme where both resolve to
   nothing, the footer can end up the same colour as the content.
8. **The bottom padding changes from 6 px to 16 px.** The `padding-bottom: 16px` that `.GAkraW_list` used to carry is
   moved onto `.wtg9ga_root`, so the container's bottom padding is slightly larger than stock.
9. **The panel is rendered into `document.body` through `createPortal`**, not inside the slot cell — otherwise the
   `overflow` this plugin introduces would clip it.
10. **`scrollbar-gutter: stable` is a permanent reservation**: content shorter than the viewport shows no scrollbar, yet
    those 5 px on the right stay reserved. That is the trade that keeps the column from jittering sideways when the scrollbar
    appears or disappears.
11. **The default of `state` is not guaranteed to read back as `null`.** `Schema.any().default(null)` resolves to
    `{}` when there is no configuration at all. This does not affect behaviour (the host treats `null` and `undefined`
    alike as never configured, and the client normalises to the shipped default), but do not rely on reading `null` out of
    the config.
12. **The icon rail and the narrow drawer mode are left entirely alone.** With the sidebar collapsed to its 56 px rail, in the
    narrow drawer mode (including the closed drawer), or while a width animation or a drag is running, the adapter skips the
    whole pass: no scrolling rework and no grouping there, so those states behave exactly like stock.

## Uninstall

1. If the profile's `cordis.patch.yml` still contains the insert row (added by hand for a local `link:` install), remove it.
2. Remove the plugin:

```sh
dsh plugin remove dsh-sidebar-groups
```

3. Restart DSH and press **Ctrl+Shift+R** in the browser.

The adapter's `teardown()` restores the nodes it hid and removes its own containers and stylesheet, so the sidebar returns
to its stock appearance with no leftover nodes or styles.

<!-- TODO: the argument form of dsh plugin remove is written as the package name by symmetry with add; it was not executed here. Whether that command also clears the sidebar-groups value already written into the profile patch is unverified. -->

## Compatibility

- **DSH `>= 0.2.1-rc.1`** (`dsh.engines.dsh` in `package.json`), desktop Web UI.
- **The DSH installation is not modified**: `app.asar` is untouched, and so is anything under the profile's `node_modules`.
  The plugin only uses the public `sidebar.footer.action` slot, the `ctx.slots` registry, the `settings` service and a
  `webServer` route; all DOM work lives in its own module.
- **It depends on DSH's DOM structure**: the sidebar root, the navigation `<nav>`, the workspace scroll container and a few
  `data-sidebar-*` state attributes. DSH's CSS-module class prefixes are per-package strings baked in at build time and change
  between versions; the plugin's main chain uses `data-*` and structural anchors, with class prefixes only as a last resort.
  **If the sidebar misbehaves after a major DSH upgrade, suspect that layer first.**
- **There is no static `inject`**: a service the host cannot provide leaves the plugin idle instead of taking the whole GUI
  down with it.

## License

MIT, see [LICENSE](LICENSE).
