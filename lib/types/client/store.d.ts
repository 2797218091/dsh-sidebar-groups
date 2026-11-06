/**
 * Client-side state: one value, a set of pure-ish operations, and the two
 * transports that persist it.
 *
 * The store is deliberately unaware of React and of the DOM. The panel renders
 * from it, the adapter reads it, and `scripts/smoke.mjs` drives it directly —
 * which is why every mutation takes and returns plain data.
 */
import { type NavEntry, type SidebarGroupsState } from './config.js';
export interface StoreOptions {
    fetchImpl?: typeof fetch | null;
    baseUri?: string | null;
    storage?: {
        getItem(key: string): string | null;
        setItem(key: string, value: string): void;
    } | null;
    /** Debounce for the write back to the host, in milliseconds. */
    persistDelay?: number;
}
export type SectionName = 'nav' | 'workspaces';
type Listener = (state: SidebarGroupsState) => void;
export declare class SidebarGroupsStore {
    private state;
    private listeners;
    private readonly options;
    private persistTimer;
    private loaded;
    private host;
    private adoptSkipped;
    /** Live workspace section labels, kept out of the persisted document. */
    private workspaces;
    constructor(options?: StoreOptions);
    get(): SidebarGroupsState;
    subscribe(listener: Listener): () => void;
    private emit;
    /**
     * Replace the whole state (already normalized) and notify.
     *
     * A document with no placement at all is NEVER written: that is exactly the
     * shape a boot-time race can produce (no registry yet), and persisting it
     * would poison every later session with a "configured but empty" document.
     * The in-memory state still updates, so the UI shows the truth.
     */
    replace(next: SidebarGroupsState, persist?: boolean): void;
    /** 'none' until a route answers; 'ok' / 'err:<message>' after that. */
    hostStatus(): string;
    /** How many adoptions were skipped because the id set was empty. */
    adoptSkips(): number;
    /** What the last route answer was, for the diagnostics line. */
    private markHost;
    private section;
    private mutate;
    private findGroup;
    setScrolling(enabled: boolean): void;
    setGroupCollapsed(name: SectionName, groupId: string, collapsed: boolean): void;
    setGroupLabel(name: SectionName, groupId: string, label: string): void;
    /** Put one id in one group, removing it from wherever it was. */
    assign(name: SectionName, itemId: string, groupId: string): void;
    /** Reorder one id inside its own group: -1 up, +1 down. */
    moveItem(name: SectionName, itemId: string, delta: number): void;
    /** Reorder a whole group: -1 up, +1 down. */
    moveGroup(name: SectionName, groupId: string, delta: number): void;
    addGroup(name: SectionName, label: string): string;
    removeGroup(name: SectionName, groupId: string): void;
    /**
     * Reconcile with the live registry / live workspace list. Runs on every
     * adapter refresh, so it must be cheap and must return "nothing changed"
     * for the common case — a state write here would loop the MutationObserver.
     */
    adoptEntries(entries: readonly NavEntry[]): boolean;
    /**
     * Remember which workspace sections the DOM currently shows, purely so the
     * panel can offer them. This deliberately does NOT write into the document:
     * seeding every live workspace name into the saved config would freeze a
     * snapshot of the user's workspaces at first load, and every rename would
     * leave a dead entry behind. A group's `items` only ever holds what the user
     * actually assigned.
     */
    noteWorkspaceKeys(keys: readonly string[]): void;
    /** The workspace section labels discovered by the adapter. */
    workspaceKeys(): string[];
    /** Back to the shipped preset; the registry decides the top-level set. */
    reset(entries: readonly NavEntry[]): void;
    /**
     * The page's own base, so the request stays under a reverse-proxy prefix.
     * Resolved lazily: the store is constructed before anything guarantees a DOM,
     * and the smoke test runs with no document at all.
     */
    private routeUrl;
    private get fetchImpl();
    private get storage();
    private readLocal;
    private writeLocal;
    /**
     * Load once: the host settings namespace is authoritative, the localStorage
     * mirror is the fallback for a host that predates the route. Never throws —
     * an unreachable route leaves the shipped defaults in place.
     */
    load(): Promise<void>;
    schedulePersist(delay?: number): void;
    /** Write the current state through to the settings namespace. */
    flush(): Promise<boolean>;
}
export {};
