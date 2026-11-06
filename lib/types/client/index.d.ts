import { defaultState, normalizeState, resolveDefaultNavGroups, sortEntries, type NavEntry } from './config.js';
import { DomAdapter, MARKS, SELECTORS } from './dom-adapter.js';
import { SidebarGroupsStore } from './store.js';
export { defaultState, normalizeState, resolveDefaultNavGroups, sortEntries };
export type { GroupSpec, NavEntry, SectionSpec, SidebarGroupsState } from './config.js';
export { DomAdapter, MARKS, SELECTORS };
export { SidebarGroupsStore };
export type { SectionName, StoreOptions } from './store.js';
export { GroupPanel, GroupPanelPortal } from './panel';
/** The slice of `ctx` this plugin uses. Every member is optional on purpose. */
export interface ClientContext {
    slots?: SlotsLike;
    locale?: LocaleLike;
    effect?: (callback: () => unknown, label?: string) => unknown;
    inject?: (deps: string[], callback: (ready: ClientContext) => unknown) => unknown;
}
export interface SlotEntryOptions {
    id?: unknown;
    order?: unknown;
    label?: unknown;
    [key: string]: unknown;
}
export interface SlotEntry {
    options?: SlotEntryOptions;
}
export interface SlotsLike {
    inject?: (name: string, register: () => unknown) => unknown;
    register?: (options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown) => unknown;
    entriesOfSlot?: (name: string) => SlotEntry[];
    subscribe?: (name: string, callback: () => void) => (() => void) | undefined;
}
export interface LocaleLike {
    subscribe?: (callback: () => void) => (() => void) | undefined;
}
/**
 * Resolve a slot label the way `resolveSlotLabel` does — the registry stores
 * `string | (() => string)`, and the function form is locale aware, so it must
 * be CALLED at read time (DOM-CONTRACT.md §B.3). Inlined rather than imported so
 * the bundle has one fewer seed dependency to survive.
 */
export declare function resolveLabel(value: unknown): string | undefined;
/** Registry snapshot → the entries the adapter aligns its rows against. */
export declare function readEntries(slots: SlotsLike | undefined): NavEntry[];
/**
 * Mount everything. Total function: a host missing `slots`, a document without
 * the sidebar, or a throwing DOM all end in "the plugin does nothing".
 */
export declare function apply(ctx: ClientContext): void;
