import type { NavEntry } from './config.js';
import type { SidebarGroupsStore } from './store.js';
export interface GroupPanelProps {
    store: SidebarGroupsStore;
    /** Live navigation entries (registry order, labels resolved). */
    entries(): NavEntry[];
    /** Live workspace section labels read off the DOM. */
    workspaces(): string[];
    onClose(): void;
}
export declare function GroupPanel(props: GroupPanelProps): unknown;
/** Portal wrapper: nothing renders until the user asks for the panel. */
export declare function GroupPanelPortal(props: GroupPanelProps): null;
