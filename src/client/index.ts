/**
 * dsh-sidebar-groups — browser half.
 *
 * Seating: `sidebar.footer.action` (a list slot: one ADDED cell beside
 * Settings, never a replacement) holds the 分组 button and its panel. The
 * scrolling and the grouping itself have no slot to attach to — the panel list
 * and the workspace list are not slots — so they go through ./dom-adapter.ts.
 *
 * **NO STATIC `inject`, deliberately.** A static dependency the host cannot
 * satisfy leaves this plugin's fiber PENDING forever, and the web boot treats
 * any entry that is not `active` as fatal ("web boot: N entry did not
 * activate"), which costs the user the whole GUI. Dynamic `ctx.inject` waits in
 * a CHILD fiber, so this entry activates immediately and a host without the
 * services simply gets an idle plugin.
 */
import { Fragment, createElement as h, useState } from 'react'
import { defaultState, normalizeState, resolveDefaultNavGroups, sortEntries, type NavEntry } from './config.js'
import { DomAdapter, MARKS, SELECTORS } from './dom-adapter.js'
import { GroupPanelPortal } from './panel'
import { SidebarGroupsStore } from './store.js'

export { defaultState, normalizeState, resolveDefaultNavGroups, sortEntries }
export type { GroupSpec, NavEntry, SectionSpec, SidebarGroupsState } from './config.js'
export { DomAdapter, MARKS, SELECTORS }
export { SidebarGroupsStore }
export type { SectionName, StoreOptions } from './store.js'
export { GroupPanel, GroupPanelPortal } from './panel'

/** The slice of `ctx` this plugin uses. Every member is optional on purpose. */
export interface ClientContext {
  slots?: SlotsLike
  locale?: LocaleLike
  effect?: (callback: () => unknown, label?: string) => unknown
  inject?: (deps: string[], callback: (ready: ClientContext) => unknown) => unknown
}

export interface SlotEntryOptions {
  id?: unknown
  order?: unknown
  label?: unknown
  [key: string]: unknown
}

export interface SlotEntry {
  options?: SlotEntryOptions
}

export interface SlotsLike {
  inject?: (name: string, register: () => unknown) => unknown
  register?: (options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown) => unknown
  entriesOfSlot?: (name: string) => SlotEntry[]
  subscribe?: (name: string, callback: () => void) => (() => void) | undefined
}

export interface LocaleLike {
  subscribe?: (callback: () => void) => (() => void) | undefined
}

/**
 * Resolve a slot label the way `resolveSlotLabel` does — the registry stores
 * `string | (() => string)`, and the function form is locale aware, so it must
 * be CALLED at read time (DOM-CONTRACT.md §B.3). Inlined rather than imported so
 * the bundle has one fewer seed dependency to survive.
 */
export function resolveLabel(value: unknown): string | undefined {
  try {
    if (typeof value === 'string') return value
    if (typeof value === 'function') {
      const resolved = (value as () => unknown)()
      return typeof resolved === 'string' ? resolved : undefined
    }
  } catch { /* a throwing label is the registrant's bug, not ours */ }
  return undefined
}

/** Registry snapshot → the entries the adapter aligns its rows against. */
export function readEntries(slots: SlotsLike | undefined): NavEntry[] {
  if (slots === undefined || typeof slots.entriesOfSlot !== 'function') return []
  const raw = slots.entriesOfSlot('sidebar.panellist')
  if (!Array.isArray(raw)) return []
  const entries: NavEntry[] = []
  for (const entry of raw) {
    const options = entry?.options
    if (options === undefined || typeof options.id !== 'string' || options.id === '') continue
    entries.push({
      id: options.id,
      order: typeof options.order === 'number' ? options.order : 0,
      label: resolveLabel(options.label) ?? options.id,
    })
  }
  return sortEntries(entries)
}

const ACTION_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  minWidth: '28px',
  height: '28px',
  padding: '0 8px',
  border: '0',
  borderRadius: 'var(--dsw-radius-sm, 6px)',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  fontSize: '12px',
  cursor: 'pointer',
} as const

/** The 分组 cell: a toggle plus, when open, the portal-rendered panel. */
function FooterAction(props: {
  store: SidebarGroupsStore
  entries(): NavEntry[]
  workspaces(): string[]
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const label = '分组'
  const icon = h('span', { key: 'i', 'aria-hidden': 'true', style: { display: 'inline-flex', width: '16px', height: '16px' } },
    h('svg', { viewBox: '0 0 16 16', width: '16', height: '16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.4' },
      h('path', { d: 'M2 4h12M2 8h12M2 12h12', strokeLinecap: 'round' }),
      h('circle', { cx: '5', cy: '4', r: '1.6', fill: 'currentColor', stroke: 'none' }),
      h('circle', { cx: '10', cy: '8', r: '1.6', fill: 'currentColor', stroke: 'none' }),
      h('circle', { cx: '6', cy: '12', r: '1.6', fill: 'currentColor', stroke: 'none' })))
  const button = h('button', {
    key: 'b',
    type: 'button',
    className: 'dsh-sg-action',
    style: ACTION_STYLE,
    'aria-label': label,
    title: label,
    'aria-haspopup': 'dialog',
    'aria-expanded': open ? 'true' : 'false',
    onClick: (event: { preventDefault(): void; stopPropagation(): void }) => {
      event.preventDefault()
      event.stopPropagation()
      setOpen(current => !current)
    },
  }, icon, props.wide === false ? null : h('span', { key: 'l' }, label))
  const panel = open
    ? h(GroupPanelPortal as unknown as (props: Record<string, unknown>) => unknown, {
        key: 'p',
        store: props.store,
        entries: props.entries,
        workspaces: props.workspaces,
        onClose: () => setOpen(false),
      })
    : null
  return h(Fragment, null, button, panel) as unknown as ReturnType<typeof h> as never
}

/**
 * Mount everything. Total function: a host missing `slots`, a document without
 * the sidebar, or a throwing DOM all end in "the plugin does nothing".
 */
export function apply(ctx: ClientContext): void {
  if (ctx === undefined || ctx === null || typeof ctx !== 'object') return
  const store = new SidebarGroupsStore()
  let adapter: DomAdapter | null = null
  let entries: NavEntry[] = []
  let slots: SlotsLike | undefined
  let pendingRefresh = false

  const refreshSoon = (): void => {
    if (pendingRefresh) return
    pendingRefresh = true
    setTimeout(() => {
      pendingRefresh = false
      try { adapter?.refresh() } catch { /* adapter already in safe mode */ }
    }, 0)
  }

  const read = (): NavEntry[] => {
    entries = readEntries(slots)
    return entries
  }

  const mountAdapter = (): void => {
    if (adapter !== null) return
    try {
      adapter = new DomAdapter({}, {
        state: () => store.get(),
        entries: () => entries,
        setNavCollapsed: (groupId, collapsed) => store.setGroupCollapsed('nav', groupId, collapsed),
        setWorkspaceCollapsed: (groupId, collapsed) => store.setGroupCollapsed('workspaces', groupId, collapsed),
        // Deferred: the adapter calls this from inside a render, and writing the
        // state there would re-enter the subscription that triggers renders.
        onWorkspaces: keys => { setTimeout(() => { store.noteWorkspaceKeys(keys) }, 0) },
      })
      adapter.mount()
      store.subscribe(refreshSoon)
    } catch { adapter = null }
  }

  const wire = (ready: ClientContext): void => {
    slots = ready.slots
    if (slots === undefined) return
    read()
    try {
      // Slot names are STRING LITERALS on purpose: the injector's pre-flight
      // check scans register() calls statically and cannot follow a constant.
      slots.inject?.('sidebar.footer.action', () => slots!.register?.({
        name: 'sidebar.footer.action',
        id: 'dsh-sidebar-groups-open',
        order: 41,
        label: () => '分组',
      }, (props: Record<string, unknown>) => h(FooterAction as never, {
        store,
        entries: read,
        workspaces: () => (adapter?.getWorkspaces().length ? adapter.getWorkspaces() : store.workspaceKeys()),
        wide: props?.wide !== false,
      } as never)))
    } catch { /* a slot registration failure must not take the entry down */ }
    // Labels are re-resolved whenever the registry changes: a locale switch
    // does NOT fire the slot subscription (DOM-CONTRACT.md §B.4), so the locale
    // side below subscribes again to the same reader.
    const off = slots.subscribe?.('sidebar.panellist', () => { read(); refreshSoon() })
    if (typeof off === 'function' && typeof ready.effect === 'function') {
      try { ready.effect(() => off, 'dsh-sidebar-groups: panellist') } catch { /* host without effect */ }
    }
    store.adoptEntries(entries)
    mountAdapter()
  }

  const wireLocale = (ready: ClientContext): void => {
    const subscribe = ready.locale?.subscribe
    if (typeof subscribe !== 'function') return
    try {
      const off = subscribe.call(ready.locale, () => { read(); refreshSoon() })
      if (typeof off === 'function' && typeof ready.effect === 'function') {
        try { ready.effect(() => off, 'dsh-sidebar-groups: locale') } catch { /* host without effect */ }
      }
    } catch { /* locale is a nicety, not a requirement */ }
  }

  // Load first so the first render already has the stored configuration, then
  // mount; both steps are independent and neither can throw.
  void (async () => {
    try { await store.load() } catch { /* defaults */ }
    try { refreshSoon() } catch { /* nothing mounted yet */ }
  })()

  if (typeof ctx.inject === 'function') {
    try { ctx.inject(['slots'], wire) } catch { /* host without dynamic injection */ }
    try { ctx.inject(['locale'], wireLocale) } catch { /* optional service */ }
    return
  }
  // A host without dynamic injection: mount only when the service is already
  // there, never risk the pending-forever state that takes the GUI down.
  if (ctx.slots !== undefined) wire(ctx)
}
