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
    log?(message: string, detail?: unknown): void;
}
export interface AdapterEnv {
    doc?: Document | null;
    win?: (Window & typeof globalThis) | null;
}
export declare class DomAdapter {
    private readonly env;
    private readonly hooks;
    private readonly doc;
    private readonly win;
    private mounted;
    private disabled;
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
    constructor(env: AdapterEnv, hooks: AdapterHooks);
    get isMounted(): boolean;
    /** Workspace section labels the DOM currently shows (for the panel). */
    getWorkspaces(): string[];
    private log;
    private later;
    private cancel;
    /**
     * Idempotent: a second call on a mounted adapter just re-renders, and a
     * second adapter for the same document takes over (the first one is torn
     * down first) so the sidebar can never carry two copies of our nodes.
     */
    mount(): boolean;
    /** Re-read the DOM and re-render. Cheap enough to run on every debounce. */
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
    private readEntries;
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
    private markDirty;
    private fail;
    /** Restore everything, exactly. Safe to call on a partially mounted adapter. */
    teardown(): void;
    private removeNode;
}
export declare function createDomAdapter(env: AdapterEnv, hooks: AdapterHooks): DomAdapter;
