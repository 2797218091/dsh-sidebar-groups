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
    id: string;
    label: string;
    order: number;
}
/** One foldable group. `items` holds stable ids — never display text. */
export interface GroupSpec {
    id: string;
    label: string;
    collapsed: boolean;
    /** `false` for the always-open top group: no header row, no fold control. */
    showHeader: boolean;
    items: string[];
}
/** One adjustable column section (navigation or workspaces). */
export interface SectionSpec {
    groups: GroupSpec[];
}
export interface SidebarGroupsState {
    version: number;
    /** Whole-column scrolling. Turning it off restores the stock layout. */
    scrolling: boolean;
    nav: SectionSpec;
    workspaces: SectionSpec;
}
export declare const STATE_VERSION = 1;
export declare const TOP_GROUP_ID = "top";
export declare const MORE_GROUP_ID = "more";
export declare const WORKSPACE_GROUP_ID = "ws-all";
export declare function defaultState(): SidebarGroupsState;
/**
 * Coerce anything (`undefined`, a half-written patch, a value from an older
 * release) into a complete state. Never throws: a settings document is user
 * data, and one bad field must not cost the sidebar.
 */
export declare function normalizeState(raw: unknown): SidebarGroupsState;
/** Registry order, which is what `entriesOfSlot` already gives us. */
export declare function sortEntries(entries: readonly NavEntry[]): NavEntry[];
/**
 * First-run preset: three ids on top, everything else inside a folded 更多.
 * Matched by resolved label equality first, registry order second.
 */
export declare function resolveDefaultNavGroups(entries: readonly NavEntry[]): SectionSpec;
export interface SyncResult {
    state: SidebarGroupsState;
    changed: boolean;
}
/** Navigation side of {@link syncSection}: preset comes from the registry. */
export declare function syncNavGroups(state: SidebarGroupsState, entries: readonly NavEntry[]): SyncResult;
/** Group order as an array so the panel can move whole groups up and down. */
export declare function orderedGroups(spec: SectionSpec): GroupSpec[];
/** Which group currently owns `itemId`, or `undefined` when it is unassigned. */
export declare function groupOfItem(spec: SectionSpec, itemId: string): GroupSpec | undefined;
