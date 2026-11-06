/**
 * The DOM half: it is the ONLY module that touches the sidebar's markup, and
 * every entry point is total — a failure tears this adapter down and leaves the
 * stock sidebar alone rather than throwing into React.
 *
 * Design notes that are not obvious from the code:
 *
 * 1. **No hashed class name is matched**, except as a last-resort fallback.
 *    `wtg9ga_` / `GAkraW_` are per-package, build-time CSS-module prefixes that
 *    change with any DSH upgrade (DOM-CONTRACT.md §A.2). Everything is found
 *    structurally instead: the toggle button, then its ancestor whose class ends
 *    in `_root`, then that element's `<nav>` and its children.
 * 2. **Everything we change is recorded before it changes** (`originals`,
 *    `hidden`), which is what makes `teardown()` a real restore.
 * 3. **We never move or remove a React-owned node.** Original panel rows are
 *    only hidden (inline `display:none`); our own rows are our own nodes and
 *    live in a container we own.
 */
import type { GroupSpec, NavEntry, SidebarGroupsState } from './config.js'

/** Attribute selectors only: no hashed class, so they survive upgrades. */
export const SELECTORS = {
  toggle: '[data-sidebar-toggle]',
  opener: '[data-sidebar-opener]',
  drawer: '[data-sidebar-drawer]',
  animating: '[data-animating]',
  dragging: '[data-dragging]',
  tree: '[role="tree"]',
  root: '[class*="_root"]',
} as const

/** Our own bookkeeping attributes. Every node carrying one is ours to delete. */
export const MARKS = {
  style: 'data-sg-style',
  nav: 'data-sg-nav',
  navGroup: 'data-sg-nav-group',
  navItem: 'data-sg-nav-item',
  hidden: 'data-sg-hidden',
  ws: 'data-sg-ws',
  wsGroup: 'data-sg-ws-group',
  wsSection: 'data-sg-ws-section',
  scroll: 'data-sg-scroll',
} as const

export const ROW_CLASS = 'dsh-sg-row'
export const HEAD_CLASS = 'dsh-sg-head'
export const ACTIVE_CLASS = 'dsh-sg-active'

const STYLE_ID = 'dsh-sidebar-groups-style'

/**
 * Only what inline styles cannot express: the thin scrollbar of the new
 * scrolling container. Everything else is written inline on the element it
 * belongs to, which keeps the stylesheet independent of hashed class names.
 */
const STYLE_TEXT = `
[data-sg-scroll="1"] { scrollbar-width: thin; scrollbar-color: var(--dsw-alias-scrollbar-thumb, rgba(128,128,128,.45)) transparent; }
[data-sg-scroll="1"]::-webkit-scrollbar { width: 8px; height: 8px; }
[data-sg-scroll="1"]::-webkit-scrollbar-track { background: transparent; }
[data-sg-scroll="1"]::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
[data-sg-scroll="1"]:hover::-webkit-scrollbar-thumb { background: var(--dsw-alias-scrollbar-thumb, rgba(128,128,128,.45)); }
.${ROW_CLASS} { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; min-height: 32px; padding: 6px 9px; border: 0; border-radius: var(--dsw-radius-md, 8px); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.${ROW_CLASS}:hover { background: var(--dsw-alias-bg-hover, rgba(128,128,128,.12)); }
.${ROW_CLASS}.${ACTIVE_CLASS} { background: var(--dsw-alias-bg-active, rgba(128,128,128,.18)); }
.${HEAD_CLASS} { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; padding: 6px 9px; margin-top: 4px; border: 0; background: transparent; color: inherit; font: inherit; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; opacity: .72; text-align: left; cursor: pointer; }
.${HEAD_CLASS}:hover { opacity: 1; }
.dsh-sg-caret { display: inline-block; width: 10px; flex: none; }
.dsh-sg-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-sg-glyph { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 18px; height: 18px; }
.dsh-sg-glyph > * { width: 16px; height: 16px; }
`

export interface AdapterHooks {
  /** Current configuration; read fresh on every refresh. */
  state(): SidebarGroupsState
  /** Registry entries from `ctx.slots.entriesOfSlot('sidebar.panellist')`. */
  entries(): NavEntry[]
  setNavCollapsed(groupId: string, collapsed: boolean): void
  setWorkspaceCollapsed(groupId: string, collapsed: boolean): void
  /** Hand the live workspace section labels back so the panel can offer them. */
  onWorkspaces?(keys: string[]): void
  log?(message: string, detail?: unknown): void
}

export interface AdapterEnv {
  doc?: Document | null
  win?: (Window & typeof globalThis) | null
}

interface Targets {
  root: HTMLElement
  nav: HTMLElement
  foot: HTMLElement | null
  top: HTMLElement[]
  tree: HTMLElement | null
}

/** One mounted adapter per document, so two applies can never double-mount. */
let CURRENT: DomAdapter | null = null

function globalDocument(): Document | null {
  const candidate = (globalThis as { document?: Document }).document
  return candidate ?? null
}

function tagOf(element: Element): string {
  return String(element.tagName ?? '').toLowerCase()
}

function classOf(element: Element): string {
  return String((element as { className?: unknown }).className ?? '')
}

function hasClass(element: Element, name: string): boolean {
  const list = (element as { classList?: DOMTokenList }).classList
  if (list !== undefined && typeof list.contains === 'function') return list.contains(name)
  return classOf(element).split(/\s+/).includes(name)
}

function addClass(element: Element, name: string): void {
  const list = (element as { classList?: DOMTokenList }).classList
  if (list !== undefined && typeof list.add === 'function') { list.add(name); return }
  const parts = new Set(classOf(element).split(/\s+/).filter(Boolean))
  parts.add(name)
  element.setAttribute('class', [...parts].join(' '))
}

function removeClass(element: Element, name: string): void {
  const list = (element as { classList?: DOMTokenList }).classList
  if (list !== undefined && typeof list.remove === 'function') { list.remove(name); return }
  const parts = classOf(element).split(/\s+/).filter(Boolean).filter(part => part !== name)
  element.setAttribute('class', parts.join(' '))
}

function children(element: Element | null | undefined): Element[] {
  if (element === null || element === undefined) return []
  return Array.from((element as { children?: ArrayLike<Element> }).children ?? [])
}

/** `<div class="_root ...">`-shaped ancestors, found without a class hash. */
function closestRoot(element: Element | null): HTMLElement | null {
  let cursor: Element | null = element
  let hops = 0
  while (cursor !== null && hops < 12) {
    if (tagOf(cursor) === 'div' && /(^|\s)\S*_root(\s|$)/.test(classOf(cursor))) return cursor as HTMLElement
    cursor = cursor.parentElement
    hops += 1
  }
  return null
}

function isGroupSection(element: Element): boolean {
  return tagOf(element) === 'div' && /(^|\s)\S*_groupSection(\s|$)/.test(classOf(element))
}

function sectionKey(element: Element): string {
  const first = children(element)[0] ?? element
  const text = String((first as { textContent?: string | null }).textContent ?? '').trim().replace(/\s+/g, ' ')
  return text.slice(0, 160)
}

export class DomAdapter {
  private readonly doc: Document | null
  private readonly win: (Window & typeof globalThis) | null
  private mounted = false
  private disabled = false
  private observer: MutationObserver | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private releaseTimer: ReturnType<typeof setTimeout> | null = null
  private suppress = false
  private styleEl: HTMLElement | null = null
  private navBox: HTMLElement | null = null
  private wsBox: HTMLElement | null = null
  private root: HTMLElement | null = null
  private nav: HTMLElement | null = null
  private tree: HTMLElement | null = null
  private readonly originals = new Map<Element, Map<string, string>>()
  private readonly hidden = new Set<Element>()
  private readonly rows = new Map<string, Element>()
  private workspaceKeys: string[] = []

  constructor(private readonly env: AdapterEnv, private readonly hooks: AdapterHooks) {
    this.doc = env.doc ?? globalDocument()
    this.win = env.win ?? ((globalThis as unknown as Window & typeof globalThis) ?? null)
  }

  get isMounted(): boolean {
    return this.mounted
  }

  /** Workspace section labels the DOM currently shows (for the panel). */
  getWorkspaces(): string[] {
    return [...this.workspaceKeys]
  }

  private log(message: string, detail?: unknown): void {
    try { this.hooks.log?.(message, detail) } catch { /* logging must never fail the adapter */ }
  }

  private later(callback: () => void, delay: number): ReturnType<typeof setTimeout> | null {
    const host = this.win as { setTimeout?: typeof setTimeout } | null
    const run = typeof host?.setTimeout === 'function' ? host.setTimeout.bind(host) : setTimeout
    return run(callback, delay) as ReturnType<typeof setTimeout>
  }

  private cancel(handle: ReturnType<typeof setTimeout> | null): void {
    if (handle === null) return
    const host = this.win as { clearTimeout?: typeof clearTimeout } | null
    const run = typeof host?.clearTimeout === 'function' ? host.clearTimeout.bind(host) : clearTimeout
    run(handle)
  }

  /**
   * Idempotent: a second call on a mounted adapter just re-renders, and a
   * second adapter for the same document takes over (the first one is torn
   * down first) so the sidebar can never carry two copies of our nodes.
   */
  mount(): boolean {
    if (this.disabled) return false
    if (this.doc === null) return false
    try {
      if (CURRENT !== null && CURRENT !== this) CURRENT.teardown()
      CURRENT = this
      if (this.mounted) { this.refresh(); return true }
      const targets = this.resolve()
      if (targets === null) return false
      this.mounted = true
      this.apply(targets)
      this.observe()
      return true
    } catch (error) {
      this.fail(error)
      return false
    }
  }

  /** Re-read the DOM and re-render. Cheap enough to run on every debounce. */
  refresh(): void {
    if (!this.mounted || this.disabled) return
    try {
      const targets = this.resolve()
      if (targets === null) {
        // The sidebar is in a state we deliberately do not touch (drawer,
        // width animation, 56px rail). Leave the markup alone and retry when
        // the observer next fires.
        return
      }
      this.apply(targets)
    } catch (error) {
      this.fail(error)
    }
  }

  private apply(targets: Targets): void {
    this.suppress = true
    try {
      this.root = targets.root
      this.nav = targets.nav
      this.tree = targets.tree
      this.ensureStyle()
      const state = this.safeState()
      if (state.scrolling) this.applyScroll(targets)
      else this.restoreScroll()
      this.renderNav(state)
      this.renderWorkspaces(state)
    } finally {
      this.cancel(this.releaseTimer)
      this.releaseTimer = this.later(() => { this.suppress = false }, 60)
    }
  }

  private safeState(): SidebarGroupsState {
    try { return this.hooks.state() } catch { return FALLBACK_STATE }
  }

  /**
   * Locate the sidebar, or answer `null` when this round must be skipped.
   * DOM-CONTRACT.md §E: drawer (either state), a width animation, a drag, and
   * the 56px rail are all "not our scenario"; touching them breaks the
   * framework's own transitions.
   */
  private resolve(): Targets | null {
    const doc = this.doc
    if (doc === null || typeof doc.querySelector !== 'function') return null
    if (doc.querySelector(SELECTORS.drawer) !== null) return null
    if (doc.querySelector(SELECTORS.animating) !== null) return null
    if (doc.querySelector(SELECTORS.dragging) !== null) return null
    const toggle = doc.querySelector(SELECTORS.toggle) ?? doc.querySelector(SELECTORS.opener)
    const root = toggle !== null ? closestRoot(toggle) : (doc.querySelector(SELECTORS.root) as HTMLElement | null)
    if (root === null) return null
    if (/(^|\s)\S*_collapsed(\s|$)/.test(classOf(root))) return null
    const kids = children(root)
    const nav = kids.find(kid => tagOf(kid) === 'nav') ?? null
    if (nav === null) return null
    const navIndex = kids.indexOf(nav)
    const top = kids.slice(0, navIndex).filter(kid => tagOf(kid) !== 'script') as HTMLElement[]
    const after = kids.slice(navIndex + 1)
    const foot = (after[after.length - 1] ?? null) as HTMLElement | null
    const treeCandidate = doc.querySelector(SELECTORS.tree) as HTMLElement | null
    const tree = treeCandidate !== null && root.contains(treeCandidate) ? treeCandidate : null
    return { root, nav: nav as HTMLElement, foot, top, tree }
  }

  // ── layout: one scroll container, sticky edges ──────────────────────────

  private setStyle(element: Element, property: string, value: string): void {
    const style = (element as HTMLElement).style
    if (style === undefined || style === null || typeof style.setProperty !== 'function') return
    let record = this.originals.get(element)
    if (record === undefined) { record = new Map(); this.originals.set(element, record) }
    if (!record.has(property)) record.set(property, style.getPropertyValue(property) ?? '')
    style.setProperty(property, value)
  }

  private fillColor(root: HTMLElement): string {
    try {
      const computed = this.win?.getComputedStyle?.(root)?.backgroundColor
      if (typeof computed === 'string' && computed !== '' && computed !== 'transparent' && computed !== 'rgba(0, 0, 0, 0)') return computed
    } catch { /* no computed styles in a headless environment */ }
    return 'var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, transparent))'
  }

  /**
   * DOM-CONTRACT.md §D.4, applied as inline styles on the elements themselves.
   * The `scrollbar-gutter: stable` reservation MOVES from the inner list to the
   * outer column: leaving it behind makes the column jump 5px sideways the
   * moment the new scrollbar appears.
   */
  private applyScroll(targets: Targets): void {
    const { root, tree, top, foot } = targets
    this.setStyle(root, 'height', '100%')
    this.setStyle(root, 'overflow-y', 'auto')
    this.setStyle(root, 'overflow-x', 'hidden')
    this.setStyle(root, 'scrollbar-gutter', 'stable')
    this.setStyle(root, 'overscroll-behavior', 'contain')
    this.setStyle(root, 'padding-bottom', '16px')
    root.setAttribute(MARKS.scroll, '1')

    let offset = 0
    for (const block of top) {
      this.setStyle(block, 'position', 'sticky')
      this.setStyle(block, 'top', `${offset}px`)
      this.setStyle(block, 'z-index', '3')
      this.setStyle(block, 'background', this.fillColor(root))
      offset += Number((block as HTMLElement).offsetHeight) || 0
    }
    if (foot !== null) {
      this.setStyle(foot, 'position', 'sticky')
      this.setStyle(foot, 'bottom', '0px')
      this.setStyle(foot, 'z-index', '3')
      this.setStyle(foot, 'background', this.fillColor(root))
    }
    if (tree === null) return
    let cursor: Element | null = tree
    let hops = 0
    while (cursor !== null && cursor !== root && hops < 10) {
      this.setStyle(cursor, 'flex', 'none')
      this.setStyle(cursor, 'min-height', 'auto')
      this.setStyle(cursor, 'overflow', 'visible')
      if (cursor === tree) {
        this.setStyle(cursor, 'overflow-y', 'visible')
        this.setStyle(cursor, 'scrollbar-gutter', 'auto')
        this.setStyle(cursor, 'padding-bottom', '0px')
      }
      cursor = cursor.parentElement
      hops += 1
    }
  }

  private restoreScroll(): void {
    for (const [element, record] of [...this.originals]) {
      const style = (element as HTMLElement).style
      if (style === undefined || style === null) continue
      for (const [property, value] of record) {
        try { style.setProperty(property, value) } catch { /* detached node */ }
      }
    }
    this.originals.clear()
    for (const element of this.findMarked(MARKS.scroll)) element.removeAttribute(MARKS.scroll)
  }

  private findMarked(mark: string): Element[] {
    const doc = this.doc
    if (doc === null || typeof doc.querySelectorAll !== 'function') return []
    try { return Array.from(doc.querySelectorAll(`[${mark}]`)) } catch { return [] }
  }

  private ensureStyle(): void {
    const doc = this.doc
    if (doc === null) return
    if (this.styleEl !== null && this.styleEl.isConnected !== false && (this.styleEl as { parentNode?: unknown }).parentNode) return
    const host = (doc.head ?? doc.body ?? doc.documentElement) as HTMLElement | null
    if (host === null || typeof doc.createElement !== 'function') return
    const existing = this.findMarked(MARKS.style)[0] as HTMLElement | undefined
    const element = existing ?? doc.createElement('style')
    element.setAttribute(MARKS.style, '1')
    element.setAttribute('id', STYLE_ID)
    element.textContent = STYLE_TEXT
    if (existing === undefined) host.appendChild(element)
    this.styleEl = element
  }

  // ── navigation groups ───────────────────────────────────────────────────

  private renderNav(state: SidebarGroupsState): void {
    const nav = this.nav
    if (nav === null) return
    const entries = this.readEntries()
    if (entries.length === 0) return
    const rows = this.panelRows(nav)
    const mapped = this.align(rows, entries)
    this.rows.clear()
    for (const [id, row] of mapped) this.rows.set(id, row)

    const box = this.ensureBox(nav, MARKS.nav, this.navBox)
    this.navBox = box
    box.textContent = ''

    const assigned = new Set<string>()
    const groups = state.nav.groups
    for (const group of groups) {
      const items = group.items.filter(id => mapped.has(id))
      if (items.length === 0 && group.showHeader) continue
      if (group.showHeader) box.appendChild(this.groupHeader(group, 'nav'))
      // Rows of a folded group stay HIDDEN in the framework's nav (they are
      // still "assigned"), they are simply not drawn by us.
      for (const id of items) assigned.add(id)
      if (group.collapsed) continue
      for (const id of items) box.appendChild(this.itemRow(id, mapped.get(id)!, entries))
    }
    // Anything the config has never seen stays where the framework put it.
    for (const [id, row] of mapped) {
      if (assigned.has(id)) this.hideRow(row)
      else this.showRow(row)
    }
    // Re-append: React may have inserted one of its own children after us.
    nav.appendChild(box)
    this.syncActive()
  }

  private readEntries(): NavEntry[] {
    try {
      const value = this.hooks.entries()
      if (!Array.isArray(value)) return []
      return value.filter(entry => typeof entry?.id === 'string' && entry.id !== '')
    } catch { return [] }
  }

  /** The framework's own panel buttons: direct `<button>` children of the nav. */
  private panelRows(nav: HTMLElement): HTMLElement[] {
    return children(nav).filter(kid => tagOf(kid) === 'button') as HTMLElement[]
  }

  /**
   * Row ↔ entry alignment. There is no `data-panel-id` in the markup, so the
   * only key shared by the registry and the DOM is the RESOLVED LABEL that the
   * framework copied into `aria-label` (DOM-CONTRACT.md §B.5). We therefore
   * compare against the registry's own labels AT THIS MOMENT and never against
   * a hardcoded string; whatever does not line up falls back to registry order.
   */
  private align(rows: HTMLElement[], entries: NavEntry[]): Map<string, HTMLElement> {
    const mapped = new Map<string, HTMLElement>()
    const used = new Set<HTMLElement>()
    for (const entry of entries) {
      const row = rows.find(candidate => !used.has(candidate) &&
        (candidate.getAttribute('aria-label') === entry.label || candidate.getAttribute('aria-label') === entry.id))
      if (row !== undefined) { used.add(row); mapped.set(entry.id, row) }
    }
    entries.forEach((entry, index) => {
      if (mapped.has(entry.id)) return
      const row = rows[index]
      if (row !== undefined && !used.has(row)) { used.add(row); mapped.set(entry.id, row) }
    })
    return mapped
  }

  private ensureBox(host: Element, mark: string, current: HTMLElement | null): HTMLElement {
    const doc = this.doc!
    if (current !== null && (current as { parentNode?: unknown }).parentNode !== null && current.parentNode !== undefined) return current
    const existing = children(host).find(kid => kid.hasAttribute(mark)) as HTMLElement | undefined
    if (existing !== undefined) return existing
    const box = doc.createElement('div')
    box.setAttribute(mark, '1')
    host.appendChild(box)
    return box
  }

  private groupHeader(group: GroupSpec, kind: 'nav' | 'ws'): HTMLElement {
    const doc = this.doc!
    const button = doc.createElement('button')
    button.setAttribute('type', 'button')
    button.setAttribute(kind === 'nav' ? MARKS.navGroup : MARKS.wsGroup, group.id)
    button.className = HEAD_CLASS
    button.setAttribute('aria-expanded', group.collapsed ? 'false' : 'true')
    button.setAttribute('aria-label', group.label)
    const caret = doc.createElement('span')
    caret.className = 'dsh-sg-caret'
    caret.textContent = group.collapsed ? '▸' : '▾'
    const title = doc.createElement('span')
    title.className = 'dsh-sg-title'
    title.textContent = group.label
    button.appendChild(caret)
    button.appendChild(title)
    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      try {
        if (kind === 'nav') this.hooks.setNavCollapsed(group.id, !group.collapsed)
        else this.hooks.setWorkspaceCollapsed(group.id, !group.collapsed)
      } catch (error) { this.fail(error) }
    })
    return button
  }

  private itemRow(id: string, row: HTMLElement, entries: NavEntry[]): HTMLElement {
    const doc = this.doc!
    const entry = entries.find(candidate => candidate.id === id)
    const label = entry?.label ?? id
    const button = doc.createElement('button')
    button.setAttribute('type', 'button')
    button.setAttribute(MARKS.navItem, id)
    button.className = ROW_CLASS
    button.setAttribute('aria-label', label)
    button.setAttribute('title', label)
    const glyph = doc.createElement('span')
    glyph.className = 'dsh-sg-glyph'
    // The slot API cannot render another registration's cell (DOM-CONTRACT.md
    // §B.5), so the icon is CLONED from the row the framework already drew.
    const source = children(row).find(kid => /(^|\s)\S*panelGlyph(\s|$)/.test(classOf(kid)))
    if (source !== undefined && typeof source.cloneNode === 'function') {
      const clone = source.cloneNode(true) as Element
      glyph.appendChild(clone)
    }
    const title = doc.createElement('span')
    title.className = 'dsh-sg-title'
    title.textContent = label
    button.appendChild(glyph)
    button.appendChild(title)
    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      try {
        row.click()
        this.later(() => this.syncActive(), 0)
      } catch (error) { this.fail(error) }
    })
    return button
  }

  /** Mirror the framework's own active marker onto our row. */
  private syncActive(): void {
    const doc = this.doc
    if (doc === null || this.navBox === null) return
    for (const [id, row] of this.rows) {
      const our = children(this.navBox).find(kid => kid.getAttribute(MARKS.navItem) === id) as HTMLElement | undefined
      if (our === undefined) continue
      const current = row.getAttribute('aria-current')
      const active = current !== null && current !== '' ? current : (/(^|\s)\S*panelActive(\S|\s|$)/.test(classOf(row)) ? 'page' : null)
      if (active === null) { removeClass(our, ACTIVE_CLASS); our.removeAttribute('aria-current') }
      else { addClass(our, ACTIVE_CLASS); our.setAttribute('aria-current', active) }
    }
  }

  private hideRow(row: Element): void {
    if (this.hidden.has(row)) return
    const style = (row as HTMLElement).style
    if (style === undefined || style === null) return
    let record = this.originals.get(row)
    if (record === undefined) { record = new Map(); this.originals.set(row, record) }
    if (!record.has('display')) record.set('display', style.getPropertyValue('display') ?? '')
    style.setProperty('display', 'none')
    row.setAttribute(MARKS.hidden, '1')
    this.hidden.add(row)
  }

  private showRow(row: Element): void {
    if (!this.hidden.has(row)) return
    this.hidden.delete(row)
    row.removeAttribute(MARKS.hidden)
    const style = (row as HTMLElement).style
    const record = this.originals.get(row)
    if (style === undefined || style === null) return
    const restore = record?.get('display') ?? ''
    style.setProperty('display', restore)
    record?.delete('display')
  }

  // ── workspace groups ────────────────────────────────────────────────────

  /**
   * Workspace rows carry no id and are React-owned (cloning them would drop
   * their event handlers), so grouping here means HIDE the original sections
   * and draw our own fold bar. With the shipped single group that bar is not
   * rendered at all, which keeps F3's "no empty group headers" true by
   * construction.
   */
  private renderWorkspaces(state: SidebarGroupsState): void {
    const tree = this.tree
    if (tree === null) return
    const sections = children(tree).filter(kid => !kid.hasAttribute(MARKS.ws) && isGroupSection(kid))
    const keys = sections.map(sectionKey)
    if (keys.length !== this.workspaceKeys.length || keys.some((key, index) => key !== this.workspaceKeys[index])) {
      this.workspaceKeys = keys
      try { this.hooks.onWorkspaces?.(keys) } catch { /* panel is optional */ }
    }
    const groups = state.workspaces.groups
    // Ownership: a section named by a group belongs to it; everything else
    // belongs to the FIRST group (the catch-all), so a new workspace can never
    // disappear just because the config has never heard of it.
    const owner = new Map<number, GroupSpec>()
    sections.forEach((section, index) => {
      const key = keys[index] ?? sectionKey(section)
      const named = groups.find(group => group.items.includes(key))
      const group = named ?? groups[0]
      if (group !== undefined) owner.set(index, group)
    })
    const owners = groups.filter(group => sections.some((_, index) => owner.get(index) === group))
    // F3: with fewer than two populated groups there is nothing to fold, and an
    // empty header would be worse than no grouping at all.
    if (owners.length < 2) {
      for (const section of sections) this.showRow(section)
      const stale = children(tree).find(kid => kid.hasAttribute(MARKS.ws))
      if (stale !== undefined) stale.textContent = ''
      return
    }
    const box = this.ensureBox(tree, MARKS.ws, this.wsBox)
    this.wsBox = box
    box.textContent = ''
    tree.insertBefore(box, children(tree)[0] ?? null)
    for (const group of owners) {
      box.appendChild(this.groupHeader(group, 'ws'))
      sections.forEach((section, index) => {
        if (owner.get(index) !== group) return
        // Collapsing hides a whole section; nothing is ever moved, because the
        // sections are React-owned (a moved node would be reconciled back).
        if (group.collapsed) this.hideRow(section)
        else this.showRow(section)
      })
    }
  }

  // ── lifecycle ───────────────────────────────────────────────────────────

  private observe(): void {
    const doc = this.doc
    const root = this.root
    if (doc === null || root === null) return
    const Ctor = (this.win as { MutationObserver?: typeof MutationObserver } | null)?.MutationObserver
    if (typeof Ctor !== 'function') return
    try {
      this.observer = new Ctor(() => this.markDirty())
      this.observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-current', 'class', 'style'],
      })
    } catch { this.observer = null }
  }

  private markDirty(): void {
    if (!this.mounted || this.disabled || this.suppress) return
    this.cancel(this.timer)
    this.timer = this.later(() => { this.timer = null; this.refresh() }, 200)
  }

  private fail(error: unknown): void {
    this.log('disabled after a DOM error', error instanceof Error ? error.message : String(error))
    try { this.teardown() } catch { /* already broken */ }
    this.disabled = true
  }

  /** Restore everything, exactly. Safe to call on a partially mounted adapter. */
  teardown(): void {
    this.cancel(this.timer)
    this.cancel(this.releaseTimer)
    this.timer = null
    this.releaseTimer = null
    try { this.observer?.disconnect() } catch { /* already gone */ }
    this.observer = null
    this.suppress = false
    this.mounted = false
    for (const row of [...this.hidden]) {
      try { this.showRow(row) } catch { /* detached */ }
    }
    this.hidden.clear()
    this.restoreScroll()
    for (const element of this.findMarked(MARKS.nav)) this.removeNode(element)
    for (const element of this.findMarked(MARKS.ws)) this.removeNode(element)
    for (const element of this.findMarked(MARKS.style)) this.removeNode(element)
    for (const element of this.findMarked(MARKS.hidden)) element.removeAttribute(MARKS.hidden)
    this.navBox = null
    this.wsBox = null
    this.styleEl = null
    this.root = null
    this.nav = null
    this.tree = null
    this.rows.clear()
    if (CURRENT === this) CURRENT = null
  }

  private removeNode(element: Element): void {
    try { element.parentNode?.removeChild(element) } catch { /* detached */ }
  }
}

/** Never-throwing shape used when the state source itself misbehaves. */
const FALLBACK_STATE: SidebarGroupsState = {
  version: 1,
  scrolling: true,
  nav: { groups: [] },
  workspaces: { groups: [] },
}

export function createDomAdapter(env: AdapterEnv, hooks: AdapterHooks): DomAdapter {
  return new DomAdapter(env, hooks)
}
