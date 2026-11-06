/**
 * The whole state model, and the only module BOTH halves import.
 *
 * Nothing here touches the DOM or React: the host half builds the same state
 * from the settings namespace, and `scripts/smoke.mjs` exercises it in plain
 * Node. Keeping the model shared is what makes "the panel wrote it, the host
 * stored it, the adapter rendered it" one value rather than three.
 */

/** One entry of `ctx.slots.entriesOfSlot('sidebar.panellist')`, label resolved. */
export interface NavEntry {
  id: string
  label: string
  order: number
}

/** One foldable group. `items` holds stable ids — never display text. */
export interface GroupSpec {
  id: string
  label: string
  collapsed: boolean
  /** `false` for the always-open top group: no header row, no fold control. */
  showHeader: boolean
  items: string[]
}

/** One adjustable column section (navigation or workspaces). */
export interface SectionSpec {
  groups: GroupSpec[]
  /**
   * Whether the shipped preset has already been applied to this section.
   *
   * The default groups are never empty (the panel starts with 常用 + 更多), so
   * "no groups" cannot stand for "never configured" — and without this flag a
   * fresh install would push every id into the folded group and never apply the
   * preset it ships with.
   */
  configured?: boolean
}

export interface SidebarGroupsState {
  version: number
  /** Whole-column scrolling. Turning it off restores the stock layout. */
  scrolling: boolean
  nav: SectionSpec
  workspaces: SectionSpec
}

export const STATE_VERSION = 1

export const TOP_GROUP_ID = 'top'
export const MORE_GROUP_ID = 'more'
export const WORKSPACE_GROUP_ID = 'ws-all'

/**
 * The default top-level set, matched against the PANEL REGISTRY's resolved
 * label — never against the DOM's rendered text, and never persisted.
 *
 * This is the one accepted exception to "never match by display text" (see
 * README + the comment on `resolveNavEntries` in dom-adapter.ts): the shipped
 * product has to guess three ids it has never seen, and a resolved slot label
 * is the only identity the registry shares with the DOM (`aria-label`) and with
 * the user. It runs ONCE, on first sight of the registry; every later read and
 * write is keyed by the ids it produced. Several locales are listed per group
 * precisely so this never becomes a Chinese-only assumption; when nothing
 * matches, the registry ORDER decides (`FALLBACK_POSITIONS`).
 */
const TOP_LABEL_CANDIDATES: readonly (readonly string[])[] = [
  ['插件', 'plugin', 'plugins', '插件管理', 'plugin manager'],
  ['插件市场', 'plugin market', 'plugin marketplace', 'marketplace', '插件商店'],
  ['任务看板', '任务面板', 'task board', 'taskboard', 'task-board', 'tasks', '看板'],
]

/** Registry positions used when no label matches: 插件 / 插件市场 / 任务看板. */
const FALLBACK_POSITIONS = [0, 1, 4] as const

/** Labels are compared case-insensitively and without surrounding space. */
function normalizeLabel(value: string): string {
  return value.trim().toLowerCase()
}

export function defaultState(): SidebarGroupsState {
  return {
    version: STATE_VERSION,
    scrolling: true,
    nav: {
      configured: false,
      groups: [
        { id: TOP_GROUP_ID, label: '常用', collapsed: false, showHeader: false, items: [] },
        { id: MORE_GROUP_ID, label: '更多', collapsed: true, showHeader: true, items: [] },
      ],
    },
    workspaces: {
      // The workspace side has no preset to apply: one catch-all group means
      // "no grouping", which is the visual no-op the plugin ships with.
      configured: true,
      groups: [{ id: WORKSPACE_GROUP_ID, label: '工作区', collapsed: false, showHeader: false, items: [] }],
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizeGroups(value: unknown, fallback: GroupSpec[]): GroupSpec[] {
  const list = Array.isArray(value) ? value : []
  const groups: GroupSpec[] = []
  for (const raw of list) {
    const record = asRecord(raw)
    if (record === null) continue
    const id = typeof record.id === 'string' && record.id !== '' ? record.id : undefined
    if (id === undefined || groups.some(group => group.id === id)) continue
    groups.push({
      id,
      label: typeof record.label === 'string' && record.label !== '' ? record.label : id,
      collapsed: record.collapsed === true,
      showHeader: record.showHeader !== false,
      items: strings(record.items),
    })
  }
  return groups.length > 0 ? groups : fallback
}

/**
 * Coerce anything (`undefined`, a half-written patch, a value from an older
 * release) into a complete state. Never throws: a settings document is user
 * data, and one bad field must not cost the sidebar.
 */
export function normalizeState(raw: unknown): SidebarGroupsState {
  const base = defaultState()
  const record = asRecord(raw)
  if (record === null) return base
  const nav = asRecord(record.nav)
  const workspaces = asRecord(record.workspaces)
  return {
    version: typeof record.version === 'number' ? record.version : STATE_VERSION,
    scrolling: record.scrolling !== false,
    nav: {
      groups: normalizeGroups(nav?.groups, base.nav.groups),
      configured: nav?.configured === true,
    },
    workspaces: {
      groups: normalizeGroups(workspaces?.groups, base.workspaces.groups),
      configured: workspaces?.configured !== false,
    },
  }
}

/** Registry order, which is what `entriesOfSlot` already gives us. */
export function sortEntries(entries: readonly NavEntry[]): NavEntry[] {
  return [...entries].sort((left, right) => left.order - right.order)
}

/**
 * First-run preset: three ids on top, everything else inside a folded 更多.
 * Matched by resolved label equality first, registry order second.
 */
export function resolveDefaultNavGroups(entries: readonly NavEntry[]): SectionSpec {
  const sorted = sortEntries(entries)
  const top: string[] = []
  for (const candidates of TOP_LABEL_CANDIDATES) {
    const wanted = candidates.map(normalizeLabel)
    const hit = sorted.find(entry => !top.includes(entry.id) && wanted.includes(normalizeLabel(entry.label)))
    if (hit !== undefined) top.push(hit.id)
  }
  for (const position of FALLBACK_POSITIONS) {
    if (top.length >= TOP_LABEL_CANDIDATES.length) break
    const entry = sorted[position]
    if (entry !== undefined && !top.includes(entry.id)) top.push(entry.id)
  }
  for (const entry of sorted) {
    if (top.length >= TOP_LABEL_CANDIDATES.length) break
    if (!top.includes(entry.id)) top.push(entry.id)
  }
  const more = sorted.filter(entry => !top.includes(entry.id)).map(entry => entry.id)
  return {
    configured: true,
    groups: [
      { id: TOP_GROUP_ID, label: '常用', collapsed: false, showHeader: false, items: top },
      { id: MORE_GROUP_ID, label: '更多', collapsed: true, showHeader: true, items: more },
    ],
  }
}

export interface SyncResult {
  state: SidebarGroupsState
  changed: boolean
}

/** One section's reconcile result (see `syncSection`). */
interface SectionSync {
  spec: SectionSpec
  changed: boolean
}

/**
 * Reconcile a stored section against what is actually registered right now.
 *
 * - A side that has never been configured gets the preset (`preset` given).
 * - Ids that no longer exist stay in the config: panels can be installed and
 *   removed, and dropping their placement would lose the user's choice.
 * - New ids (a freshly installed panel) join the LAST group, which is the
 *   folded one — a new panel must not push itself into the always-open top set.
 */
function itemCount(groups: readonly GroupSpec[]): number {
  let total = 0
  for (const group of groups) total += group.items.length
  return total
}

/** True when this document holds no placement at all (nothing to persist). */
export function isBlankState(state: SidebarGroupsState): boolean {
  return itemCount(state.nav.groups) === 0 && itemCount(state.workspaces.groups) === 0
}

function syncSection(spec: SectionSpec, knownIds: readonly string[], preset: (() => SectionSpec) | null): SectionSync {
  let changed = false
  const live = spec.groups.filter(group => group.id !== '')
  // "configured" describes a POPULATED document, never a promise. A document
  // that claims to be configured but holds not one item is the poisoned shape
  // earlier releases could persist (an empty preset written at boot, before the
  // registry had anything in it) — it is re-seeded instead of trusted.
  const wasConfigured = spec.configured === true && itemCount(live) > 0
  let groups: GroupSpec[]
  if (preset !== null && !wasConfigured) {
    groups = preset().groups.map(group => ({ ...group, items: [...group.items] }))
    changed = true
  } else {
    groups = live.map(group => ({ ...group, items: [...group.items] }))
  }
  if (knownIds.length > 0) {
    const assigned = new Set(groups.flatMap(group => group.items))
    const orphans = knownIds.filter(id => !assigned.has(id))
    if (orphans.length > 0) {
      const target = groups.length > 0 ? groups[groups.length - 1] : undefined
      if (target === undefined) {
        groups = [{ id: MORE_GROUP_ID, label: '更多', collapsed: true, showHeader: true, items: orphans }]
      } else {
        target.items.push(...orphans)
      }
      changed = true
    }
  }
  const populated = itemCount(groups) > 0
  const configured = populated && (wasConfigured || changed)
  if (spec.configured !== configured) changed = true
  return { spec: { groups, configured }, changed }
}

/** Navigation side of {@link syncSection}: preset comes from the registry. */
export function syncNavGroups(state: SidebarGroupsState, entries: readonly NavEntry[]): SyncResult {
  if (entries.length === 0) return { state, changed: false }
  const ids = sortEntries(entries).map(entry => entry.id)
  const result = syncSection(state.nav, ids, () => resolveDefaultNavGroups(entries))
  if (!result.changed) return { state, changed: false }
  return { state: { ...state, nav: result.spec }, changed: true }
}

/** Group order as an array so the panel can move whole groups up and down. */
export function orderedGroups(spec: SectionSpec): GroupSpec[] {
  return spec.groups
}

/** Which group currently owns `itemId`, or `undefined` when it is unassigned. */
export function groupOfItem(spec: SectionSpec, itemId: string): GroupSpec | undefined {
  return spec.groups.find(group => group.items.includes(itemId))
}
