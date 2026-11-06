import Schema from '@deepseek-ai/schemastery';
/** Entry id == settings namespace (see cordis.patch.yml). */
export declare const NAMESPACE = "sidebar-groups";
export declare const PACKAGE_NAME = "dsh-sidebar-groups";
export declare const name = "dsh-sidebar-groups";
/**
 * The loader reads THIS export as the entry's config schema, and dsh-settings
 * reads it again to build the plugin's form. Both only care about volatile
 * fields (DOM-CONTRACT.md G.4), and .extra('volatile', true) is used rather
 * than the volatile() shorthand because only the host's copy of schemastery
 * defines that convenience method.
 *
 * `state` holds the whole document as one opaque value: the shape belongs to
 * ./client/config.ts, and a schema mirroring it field by field would have to be
 * kept in step with it by hand.
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    state: Schema<any, any, "defined">;
    legacyImported: Schema<boolean, boolean, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    state: Schema<any, any, "defined">;
    legacyImported: Schema<boolean, boolean, "defined">;
}>>, "plain">;
export interface SettingsDescriptor {
    ns: string;
    value?: unknown;
    revision?: number;
    user?: unknown;
}
export interface SettingsService {
    configure?: (options: {
        auto: boolean;
    }, fiber: unknown) => unknown;
    describe: (options?: {
        redactSecrets?: boolean;
    }) => SettingsDescriptor[];
    update: (ns: string, patch: Record<string, unknown>, expectedRevision?: number) => Promise<unknown>;
}
export interface LoaderEntry {
    options?: {
        id?: unknown;
        name?: unknown;
    };
    fiber?: unknown;
    disabled?: boolean;
}
export interface HostContext {
    inject?: (deps: string[], callback: (ready: HostContext) => unknown) => unknown;
    effect?: (callback: () => unknown, label?: string) => unknown;
    loader?: {
        entries?: () => LoaderEntry[];
    };
    fiber?: unknown;
    logger?: {
        warn?: (message: string) => void;
        info?: (message: string) => void;
    };
    profileContext?: {
        home?: string;
    };
    connection?: {
        requestRejection?: (request: unknown) => unknown;
    };
    webServer?: {
        register: (route: unknown) => () => void;
    };
    settings?: SettingsService;
}
/**
 * This package's own loader entry id, which is also the settings namespace.
 * `entry.fiber === ctx.fiber` is the only reliable self-identification when a
 * bundle mounts the same package under a different id (DOM-CONTRACT.md G.3).
 */
export declare function ownEntryId(ctx: HostContext): string | undefined;
/**
 * Import the old standalone file exactly once, and never over a value the user
 * has since written through the panel.
 */
export declare function importLegacy(ctx: HostContext, settings: SettingsService, ns: string): 'no-file' | 'already-configured' | 'imported' | 'failed';
/**
 * Mount both halves. Total function: a deployment without settings or
 * webServer keeps its stock sidebar and logs nothing scary.
 */
export declare function apply(ctx: HostContext, config?: {
    state?: unknown;
}): void;
