import type { NavEntry } from './config.js';
import type { SidebarGroupsStore } from './store.js';
export interface GroupPanelProps {
    store: SidebarGroupsStore;
    /** Live navigation entries (registry order, labels resolved). */
    entries(): NavEntry[];
    /** Live workspace section labels read off the DOM. */
    workspaces(): string[];
    /**
     * One plain-text line describing the adapter's state. It exists because the
     * interesting failures (React not painted yet, drawer mode, the 56px rail)
     * are invisible in the UI: the plugin looks installed and does nothing.
     */
    diagnostics(): string;
    onClose(): void;
}
export declare function GroupPanel(props: GroupPanelProps): unknown;
/** Portal wrapper: nothing renders until the user asks for the panel. */
export declare function GroupPanelPortal(props: GroupPanelProps): null;
