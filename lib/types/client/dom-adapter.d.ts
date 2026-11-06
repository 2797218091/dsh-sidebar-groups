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
import type { NavEntry, SidebarGroupsState } from './config.js';
/** Attribute selectors only: no hashed class, so they survive upgrades. */
export declare const SELECTORS: {
    readonly toggle: "[data-sidebar-toggle]";
    readonly opener: "[data-sidebar-opener]";
    readonly drawer: "[data-sidebar-drawer]";
    readonly animating: "[data-animating]";
    readonly dragging: "[data-dragging]";
    readonly tree: "[role=\"tree\"]";
    readonly root: "[class*=\"_root\"]";
};
/** Our own bookkeeping attributes. Every node carrying one is ours to delete. */
export declare const MARKS: {
    readonly style: "data-sg-style";
    readonly nav: "data-sg-nav";
    readonly navGroup: "data-sg-nav-group";
    readonly navItem: "data-sg-nav-item";
    readonly hidden: "data-sg-hidden";
    readonly ws: "data-sg-ws";
    readonly wsGroup: "data-sg-ws-group";
    readonly wsSection: "data-sg-ws-section";
    readonly scroll: "data-sg-scroll";
};
export declare const ROW_CLASS = "dsh-sg-row";
export declare const HEAD_CLASS = "dsh-sg-head";
export declare const ACTIVE_CLASS = "dsh-sg-active";
export interface AdapterHooks {
    /** Current configuration; read fresh on every refresh. */
    state(): SidebarGroupsState;
    /** Registry entries from `ctx.slots.entriesOfSlot('sidebar.panellist')`. */
    entries(): NavEntry[];
    setNavCollapsed(groupId: string, collapsed: boolean): void;
    setWorkspaceCollapsed(groupId: string, collapsed: boolean): void;
    /** Hand the live workspace section labels back so the panel can offer them. */
    onWorkspaces?(keys: string[]): void;
    /**
     * Hand back the entries this refresh actually aligned against. `source` is
     * `dom` when the registry was unusable and the ids were derived from the
     * rendered rows, in registration order.
     */
    onEntries?(entries: NavEntry[], source: 'registry' | 'dom'): void;
    log?(message: string, detail?: unknown): void;
}
export interface AdapterEnv {
    doc?: Document | null;
    win?: (Window & typeof globalThis) | null;
}
/** The adapter currently owning the sidebar, if any (diagnostics + tests). */
export declare function activeAdapter(): DomAdapter | null;
export declare class DomAdapter {
    private readonly env;
    private readonly hooks;
    private readonly doc;
    private readonly win;
    private mounted;
    private disabled;
    /** Set by teardown(): a torn-down adapter must not come back on its own. */
    private retired;
    private observer;
    private timer;
    private releaseTimer;
    private suppress;
    private styleEl;
    private navBox;
    private wsBox;
    private root;
    private nav;
    private tree;
    private readonly originals;
    private readonly hidden;
    private readonly rows;
    private workspaceKeys;
    /** Why the last `resolve()` did what it did — the panel shows this verbatim. */
    private lastReason;
    private entriesSource;
    private retryCancel;
    private readonly retryLevel;
    private scout;
    private scoutAttemptedAt;
    private lastEntrySignature;
    /** Last five log lines. The panel prints the newest one; there is no console. */
    private readonly recent;
    /** Rows this refresh meant to draw / ids in the config that matched no row. */
    private planned;
    private unmatched;
    constructor(env: AdapterEnv, hooks: AdapterHooks);
    get isMounted(): boolean;
    get isDisabled(): boolean;
    /** Why the last resolve() ran or bailed: ok / no-root / drawer / ... */
    get reason(): string;
    /** Where the current entry ids came from: registry, dom (degraded), none. */
    get entrySource(): 'registry' | 'dom' | 'none';
    /** Retry attempts consumed by the boot ladder (0..5). */
    get retriesUsed(): number;
    /**
     * One line, plain text, meant to be READ in the panel — never parsed. Every
     * field here exists because it was the missing fact in a live failure: is the
     * adapter mounted, why did resolve bail, did the ids line up, did anything
     * get drawn, and how tall is the container we drew into.
     */
    describe(): string;
    /** Workspace section labels the DOM currently shows (for the panel). */
    getWorkspaces(): string[];
    private log;
    private get lastLog();
    private later;
    private cancel;
    /**
     * Idempotent: a second call on a mounted adapter just re-renders, and a
     * second adapter for the same document takes over (the first one is torn
     * down first) so the sidebar can never carry two copies of our nodes.
     */
    mount(): boolean;
    /**
     * Re-read the DOM and re-render. Cheap enough to run on every debounce — and
     * the single place a LATE mount happens: every signal (retry ladder, boot
     * scout, store change, debounced observer) funnels through here, so an
     * adapter that missed the boot window mounts on the first one after the
     * sidebar exists.
     */
    refresh(): void;
    private apply;
    private safeState;
    /**
     * Locate the sidebar, or answer `null` when this round must be skipped.
     * DOM-CONTRACT.md §E: drawer (either state), a width animation, a drag, and
     * the 56px rail are all "not our scenario"; touching them breaks the
     * framework's own transitions.
     */
    private resolve;
    private setStyle;
    private fillColor;
    /**
     * DOM-CONTRACT.md §D.4, applied as inline styles on the elements themselves.
     * The `scrollbar-gutter: stable` reservation MOVES from the inner list to the
     * outer column: leaving it behind makes the column jump 5px sideways the
     * moment the new scrollbar appears.
     */
    private applyScroll;
    private restoreScroll;
    private findMarked;
    private ensureStyle;
    private renderNav;
    /** The framework's overflow launcher: the non-registry button in the nav. */
    private nativeMore;
    /** Our container is a flex column that never shrinks inside the nav. */
    private styleBox;
    /**
     * The entries to align against.
     *
     * Normally the registry's (`ctx.slots.entriesOfSlot('sidebar.panellist')`).
     * When that API is missing or empty — a host that never filled the slot table,
     * or a build where `slots.entriesOfSlot` does not exist — the ids are derived
     * from the RENDERED ROWS, in registration order, and the label is the row's
     * own `aria-label`. Grouping keeps working, it just loses the durable id.
     */
    private readEntries;
    /** Tell the caller which entries were used, but only when that changed. */
    private publishEntries;
    /** The framework's own panel buttons: direct `<button>` children of the nav. */
    private panelRows;
    /**
     * Row ↔ entry alignment. There is no `data-panel-id` in the markup, so the
     * only key shared by the registry and the DOM is the RESOLVED LABEL that the
     * framework copied into `aria-label` (DOM-CONTRACT.md §B.5). We therefore
     * compare against the registry's own labels AT THIS MOMENT and never against
     * a hardcoded string; whatever does not line up falls back to registry order.
     */
    private align;
    private ensureBox;
    private groupHeader;
    private itemRow;
    /** Mirror the framework's own active marker onto our row. */
    private syncActive;
    private hideRow;
    private showRow;
    /**
     * Workspace rows carry no id and are React-owned (cloning them would drop
     * their event handlers), so grouping here means HIDE the original sections
     * and draw our own fold bar. With the shipped single group that bar is not
     * rendered at all, which keeps F3's "no empty group headers" true by
     * construction.
     */
    private renderWorkspaces;
    private observe;
    /**
     * Bounded ladder for the boot race: the host mounts plugins BEFORE React has
     * painted the sidebar, so the first mount is expected to miss. Five attempts
     * (one frame, then 300 / 1000 / 2500 / 5000 ms), then it stops for good.
     *
     * Nothing polls: a MutationObserver on `document.body` watches for the frame
     * to appear and disconnects itself on the first successful mount, and every
     * other signal (store change, debounced observer) reaches the same
     * `refresh()`, which mounts if needed.
     */
    private scheduleRetry;
    private attemptMount;
    private startScout;
    private stopScout;
    private markDirty;
    private fail;
    /** Restore everything, exactly. Safe to call on a partially mounted adapter. */
    teardown(): void;
    private removeNode;
}
export declare function createDomAdapter(env: AdapterEnv, hooks: AdapterHooks): DomAdapter;
