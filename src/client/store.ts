/**
 * Client-side state: one value, a set of pure-ish operations, and the two
 * transports that persist it.
 *
 * The store is deliberately unaware of React and of the DOM. The panel renders
 * from it, the adapter reads it, and `scripts/smoke.mjs` drives it directly —
 * which is why every mutation takes and returns plain data.
 */
import {
  defaultState,
  isBlankState,
  normalizeState,
  syncNavGroups,
  type NavEntry,
  type SectionSpec,
  type SidebarGroupsState,
} from './config.js'

/** localStorage mirror, so a host without the settings route still remembers. */
const STORAGE_KEY = 'dsh-sidebar-groups:state'

/**
 * Prefix-safe route base. Resolved against the PAGE base rather than written
 * with a leading slash, so a GUI served under a reverse-proxy directory keeps
 * its prefix (the same reasoning as dsh-better-sidebar's host-route-url.ts).
 */
const ROUTE_BASE = 'sidebar-groups/api/'

export interface StoreOptions {
  fetchImpl?: typeof fetch | null
  baseUri?: string | null
  storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void } | null
  /** Debounce for the write back to the host, in milliseconds. */
  persistDelay?: number
}

/** The shape our own host routes answer with (never a 5xx, always a body). */
interface RoutePayload {
  ok?: unknown
  state?: unknown
  error?: unknown
  revision?: unknown
}

export type SectionName = 'nav' | 'workspaces'

type Listener = (state: SidebarGroupsState) => void

export class SidebarGroupsStore {
  private state: SidebarGroupsState = defaultState()
  private listeners = new Set<Listener>()
  private readonly options: StoreOptions
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private loaded = false
  private host = 'none'
  private adoptSkipped = 0
  /** Live workspace section labels, kept out of the persisted document. */
  private workspaces: string[] = []

  constructor(options: StoreOptions = {}) {
    this.options = options
  }

  get(): SidebarGroupsState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      try { listener(this.state) } catch { /* a broken subscriber must not break the store */ }
    }
  }

  /**
   * Replace the whole state (already normalized) and notify.
   *
   * A document with no placement at all is NEVER written: that is exactly the
   * shape a boot-time race can produce (no registry yet), and persisting it
   * would poison every later session with a "configured but empty" document.
   * The in-memory state still updates, so the UI shows the truth.
   */
  replace(next: SidebarGroupsState, persist = true): void {
    this.state = normalizeState(next)
    this.emit()
    if (persist && !isBlankState(this.state)) this.schedulePersist()
  }

  /** 'none' until a route answers; 'ok' / 'err:<message>' after that. */
  hostStatus(): string {
    return this.host
  }

  /** How many adoptions were skipped because the id set was empty. */
  adoptSkips(): number {
    return this.adoptSkipped
  }

  /** What the last route answer was, for the diagnostics line. */
  private markHost(ok: boolean, message?: string): void {
    this.host = ok ? 'ok' : 'err:' + (message === undefined || message === '' ? 'unknown' : message)
  }

  private section(name: SectionName): SectionSpec {
    return this.state[name]
  }

  private mutate(change: (draft: SidebarGroupsState) => boolean, persist = true): void {
    const draft = normalizeState(this.state)
    if (!change(draft)) return
    // A user edit is the other way a section becomes "configured" — and only
    // when it actually left something behind, which is what `syncSection`
    // checks too (a configured-but-empty document is re-seeded).
    for (const name of ['nav', 'workspaces'] as const) {
      if (draft[name].groups.some(group => group.items.length > 0)) draft[name].configured = true
    }
    this.replace(draft, persist)
  }

  private findGroup(name: SectionName, groupId: string) {
    return this.section(name).groups.find(group => group.id === groupId)
  }

  setScrolling(enabled: boolean): void {
    this.mutate(draft => {
      if (draft.scrolling === enabled) return false
      draft.scrolling = enabled
      return true
    })
  }

  setGroupCollapsed(name: SectionName, groupId: string, collapsed: boolean): void {
    this.mutate(draft => {
      const group = draft[name].groups.find(candidate => candidate.id === groupId)
      if (group === undefined || group.collapsed === collapsed) return false
      group.collapsed = collapsed
      return true
    })
  }

  setGroupLabel(name: SectionName, groupId: string, label: string): void {
    this.mutate(draft => {
      const group = draft[name].groups.find(candidate => candidate.id === groupId)
      if (group === undefined || group.label === label) return false
      group.label = label
      return true
    })
  }

  /** Put one id in one group, removing it from wherever it was. */
  assign(name: SectionName, itemId: string, groupId: string): void {
    this.mutate(draft => {
      const groups = draft[name].groups
      const target = groups.find(group => group.id === groupId)
      if (target === undefined) return false
      let moved = false
      for (const group of groups) {
        if (group === target) continue
        const index = group.items.indexOf(itemId)
        if (index >= 0) { group.items.splice(index, 1); moved = true }
      }
      if (!target.items.includes(itemId)) { target.items.push(itemId); moved = true }
      return moved
    })
  }

  /** Reorder one id inside its own group: -1 up, +1 down. */
  moveItem(name: SectionName, itemId: string, delta: number): void {
    this.mutate(draft => {
      const group = draft[name].groups.find(candidate => candidate.items.includes(itemId))
      if (group === undefined) return false
      const from = group.items.indexOf(itemId)
      const to = from + delta
      if (to < 0 || to >= group.items.length) return false
      group.items.splice(from, 1)
      group.items.splice(to, 0, itemId)
      return true
    })
  }

  /** Reorder a whole group: -1 up, +1 down. */
  moveGroup(name: SectionName, groupId: string, delta: number): void {
    this.mutate(draft => {
      const groups = draft[name].groups
      const from = groups.findIndex(group => group.id === groupId)
      const to = from + delta
      if (from < 0 || to < 0 || to >= groups.length) return false
      const [moved] = groups.splice(from, 1)
      if (moved === undefined) return false
      groups.splice(to, 0, moved)
      return true
    })
  }

  addGroup(name: SectionName, label: string): string {
    const base = name === 'nav' ? 'group' : 'ws-group'
    let index = this.section(name).groups.length + 1
    let id = `${base}-${index}`
    while (this.findGroup(name, id) !== undefined) { index += 1; id = `${base}-${index}` }
    this.mutate(draft => {
      draft[name].groups.push({ id, label, collapsed: true, showHeader: true, items: [] })
      return true
    })
    return id
  }

  removeGroup(name: SectionName, groupId: string): void {
    this.mutate(draft => {
      const groups = draft[name].groups
      if (groups.length <= 1) return false
      const index = groups.findIndex(group => group.id === groupId)
      if (index < 0) return false
      const [removed] = groups.splice(index, 1)
      const fallback = groups[0]
      if (removed !== undefined && fallback !== undefined) fallback.items.push(...removed.items)
      return true
    })
  }

  /**
   * Reconcile with the live registry / live workspace list. Runs on every
   * adapter refresh, so it must be cheap and must return "nothing changed"
   * for the common case — a state write here would loop the MutationObserver.
   */
  adoptEntries(entries: readonly NavEntry[]): boolean {
    // An EMPTY id set is "no information", never "nothing is configured".
    // Adopting it would re-seed an empty preset and wipe a good document — the
    // failure mode that made a rendered grouping vanish on a window resize.
    // Only a non-empty id set may recompute, mark, persist or re-render.
    if (!Array.isArray(entries) || entries.length === 0) {
      this.adoptSkipped += 1
      return false
    }
    // Entries whose labels have not resolved yet are the same kind of "no
    // information": seeding the preset against them picks the wrong panel ids
    // (observed live: 插件 / 上下文洞察 / HyperFrames instead of 插件 / 插件市场 /
    // 任务看板) and that choice then persists. Wait for at least one real label.
    if (!entries.some(entry => typeof entry.label === 'string' && entry.label.trim() !== '')) {
      this.adoptSkipped += 1
      return false
    }
    const result = syncNavGroups(this.state, entries)
    if (!result.changed) return false
    // `replace` refuses to persist a blank document, so an adoption that has
    // nothing to place (an empty registry, a preset that matched nothing) can
    // never reach the host.
    this.replace(result.state)
    return true
  }

  /**
   * Remember which workspace sections the DOM currently shows, purely so the
   * panel can offer them. This deliberately does NOT write into the document:
   * seeding every live workspace name into the saved config would freeze a
   * snapshot of the user's workspaces at first load, and every rename would
   * leave a dead entry behind. A group's `items` only ever holds what the user
   * actually assigned.
   */
  noteWorkspaceKeys(keys: readonly string[]): void {
    const next = keys.slice()
    if (next.length === this.workspaces.length && next.every((key, index) => key === this.workspaces[index])) return
    this.workspaces = next
    this.emit()
  }

  /** The workspace section labels discovered by the adapter. */
  workspaceKeys(): string[] {
    return [...this.workspaces]
  }

  /** Back to the shipped preset; the registry decides the top-level set. */
  reset(entries: readonly NavEntry[]): void {
    const preset = defaultState()
    const next = normalizeState(preset)
    for (const group of next.nav.groups) group.items = []
    this.replace(next, false)
    this.adoptEntries(entries)
    this.schedulePersist(0)
  }

  // ── transport ───────────────────────────────────────────────────────────

  /**
   * The page's own base, so the request stays under a reverse-proxy prefix.
   * Resolved lazily: the store is constructed before anything guarantees a DOM,
   * and the smoke test runs with no document at all.
   */
  private routeUrl(method: string): string | null {
    const document = (globalThis as { document?: { baseURI?: string } }).document
    const base = this.options.baseUri ?? document?.baseURI
    if (typeof base !== 'string' || base === '') return null
    try { return new URL(ROUTE_BASE + method, base).href } catch { return null }
  }

  private get fetchImpl(): typeof fetch | null {
    if (this.options.fetchImpl !== undefined) return this.options.fetchImpl
    const candidate = (globalThis as { fetch?: typeof fetch }).fetch
    return typeof candidate === 'function' ? candidate : null
  }

  private get storage() {
    if (this.options.storage !== undefined) return this.options.storage
    try {
      const candidate = (globalThis as { localStorage?: StoreOptions['storage'] }).localStorage
      return candidate ?? null
    } catch { return null }
  }

  private readLocal(): SidebarGroupsState | null {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY)
      if (typeof raw !== 'string' || raw === '') return null
      return normalizeState(JSON.parse(raw))
    } catch { return null }
  }

  private writeLocal(): void {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state)) } catch { /* quota / disabled storage */ }
  }

  /**
   * Load once: the host settings namespace is authoritative, the localStorage
   * mirror is the fallback for a host that predates the route. Never throws —
   * an unreachable route leaves the shipped defaults in place.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    const local = this.readLocal()
    if (local !== null) this.replace(local, false)
    const url = this.routeUrl('state')
    const fetchImpl = this.fetchImpl
    if (url === null || fetchImpl === null) return
    try {
      const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } })
      if (!response.ok) { this.markHost(false, 'http ' + String(response.status)); return }
      let payload: RoutePayload | null = null
      try { payload = (await response.json()) as RoutePayload } catch { payload = null }
      if (payload === null) { this.markHost(false, 'bad json'); return }
      if (payload.ok === false) {
        this.markHost(false, typeof payload.error === 'string' ? payload.error : 'route refused')
        return
      }
      this.markHost(true)
      const remote = payload.state
      if (remote === null || remote === undefined) return
      this.replace(normalizeState(remote), false)
    } catch (error) {
      this.markHost(false, error instanceof Error ? error.message : String(error))
    }
  }

  schedulePersist(delay = this.options.persistDelay ?? 350): void {
    if (isBlankState(this.state)) return
    this.writeLocal()
    if (this.persistTimer !== null) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.flush()
    }, delay)
  }

  /** Write the current state through to the settings namespace. */
  async flush(): Promise<boolean> {
    const url = this.routeUrl('update')
    const fetchImpl = this.fetchImpl
    if (url === null || fetchImpl === null) { this.markHost(false, 'no route'); return false }
    if (isBlankState(this.state)) return false
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: this.state }),
      })
      if (!response.ok) { this.markHost(false, 'http ' + String(response.status)); return false }
      let payload: RoutePayload | null = null
      try { payload = (await response.json()) as RoutePayload } catch { payload = null }
      if (payload !== null && payload.ok === false) {
        this.markHost(false, typeof payload.error === 'string' ? payload.error : 'route refused')
        return false
      }
      this.markHost(true)
      return true
    } catch (error) {
      this.markHost(false, error instanceof Error ? error.message : String(error))
      return false
    }
  }
}
