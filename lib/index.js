import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Schema from "@deepseek-ai/schemastery";
const MORE_GROUP_ID = "more";
const WORKSPACE_GROUP_ID = "ws-all";
function defaultState() {
	return {
		version: 1,
		scrolling: true,
		nav: {
			configured: false,
			groups: [{
				id: "top",
				label: "常用",
				collapsed: false,
				showHeader: false,
				items: []
			}, {
				id: MORE_GROUP_ID,
				label: "更多",
				collapsed: true,
				showHeader: true,
				items: []
			}]
		},
		workspaces: {
			configured: true,
			groups: [{
				id: WORKSPACE_GROUP_ID,
				label: "工作区",
				collapsed: false,
				showHeader: false,
				items: []
			}]
		}
	};
}
function asRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function strings(value) {
	return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function normalizeGroups(value, fallback) {
	const list = Array.isArray(value) ? value : [];
	const groups = [];
	for (const raw of list) {
		const record = asRecord(raw);
		if (record === null) continue;
		const id = typeof record.id === "string" && record.id !== "" ? record.id : void 0;
		if (id === void 0 || groups.some((group) => group.id === id)) continue;
		groups.push({
			id,
			label: typeof record.label === "string" && record.label !== "" ? record.label : id,
			collapsed: record.collapsed === true,
			showHeader: record.showHeader !== false,
			items: strings(record.items)
		});
	}
	return groups.length > 0 ? groups : fallback;
}
/**
* Coerce anything (`undefined`, a half-written patch, a value from an older
* release) into a complete state. Never throws: a settings document is user
* data, and one bad field must not cost the sidebar.
*/
function normalizeState(raw) {
	const base = defaultState();
	const record = asRecord(raw);
	if (record === null) return base;
	const nav = asRecord(record.nav);
	const workspaces = asRecord(record.workspaces);
	return {
		version: typeof record.version === "number" ? record.version : 1,
		scrolling: record.scrolling !== false,
		nav: {
			groups: normalizeGroups(nav?.groups, base.nav.groups),
			configured: nav?.configured === true
		},
		workspaces: {
			groups: normalizeGroups(workspaces?.groups, base.workspaces.groups),
			configured: workspaces?.configured !== false
		}
	};
}
// src/index.ts
/**
* dsh-sidebar-groups - host half.
*
* Two jobs, both of them plumbing the client half cannot do for itself:
*
*  1. **Storage.** A browser plugin cannot write the loader entry config
*     (DOM-CONTRACT.md G.1). The state therefore lives in the `settings`
*     namespace whose name IS this package's loader entry id, and the client
*     reads and writes it through this plugin's own fenced routes.
*  2. **One-time migration.** An earlier standalone config file, if it exists,
*     is imported once - never over a value the user has already produced
*     through the panel.
*
* No static inject: a service this deployment lacks must leave the plugin
* idle, not pending (the web boot treats a non-active entry as fatal). Every
* service is taken through dynamic ctx.inject.
*/
/** Entry id == settings namespace (see cordis.patch.yml). */
const NAMESPACE = "sidebar-groups";
const PACKAGE_NAME = "dsh-sidebar-groups";
const name = PACKAGE_NAME;
const ROUTE_PREFIX = "/sidebar-groups/api";
const LEGACY_FILE = "sidebar-groups.json";
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
const Config = Schema.object({
	state: Schema.any().default(null).description("侧栏分组与滚动的完整状态（由插件自己的面板写入；null 表示尚未配置）").extra("volatile", true),
	legacyImported: Schema.boolean().default(false).description("旧的独立配置文件是否已经一次性回迁").extra("volatile", true)
});
function writeJson(response, status, payload) {
	try {
		const body = JSON.stringify(payload);
		response.writeHead?.(status, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		});
		response.end?.(body);
	} catch {}
}
function readBody(request) {
	return new Promise((resolve) => {
		if (typeof request.on !== "function") {
			resolve("");
			return;
		}
		let data = "";
		request.on("data", (chunk) => {
			data += String(chunk ?? "");
		});
		request.on("end", () => resolve(data));
		request.on("error", () => resolve(data));
	});
}
function safeParse(text) {
	try {
		const parsed = JSON.parse(text);
		return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}
/**
* This package's own loader entry id, which is also the settings namespace.
* `entry.fiber === ctx.fiber` is the only reliable self-identification when a
* bundle mounts the same package under a different id (DOM-CONTRACT.md G.3).
*/
function ownEntryId(ctx) {
	const entries = serviceOf(ctx, "loader")?.entries?.();
	if (!Array.isArray(entries)) return void 0;
	let fallback;
	for (const entry of entries) {
		const id = entry.options?.id;
		if (entry.options?.name !== "dsh-sidebar-groups") continue;
		if (typeof id !== "string" || id === "") continue;
		if (entry.fiber === ctx.fiber) return id;
		if (entry.disabled !== true && fallback === void 0) fallback = id;
	}
	return fallback;
}
function describeValue(settings, ns) {
	let descriptors = [];
	try {
		descriptors = settings.describe({ redactSecrets: true });
	} catch (error) {
		return {
			state: null,
			error: messageOf(error)
		};
	}
	try {
		const descriptor = Array.isArray(descriptors) ? descriptors.find((candidate) => candidate?.ns === ns) : void 0;
		const value = descriptor?.value;
		const raw = value === null || value === void 0 ? void 0 : value.state;
		if (raw === void 0 || raw === null) return {
			descriptor,
			state: null
		};
		return {
			descriptor,
			state: normalizeState(raw)
		};
	} catch (error) {
		return {
			state: null,
			error: messageOf(error)
		};
	}
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/**
* Cordis service access that cannot throw. A bare `ctx.connection` on a context
* that never injected it throws "cannot get property ... without inject", which
* is exactly how the state route failed on the first live run, so every optional
* service is taken through `ctx.get()` first and a guarded read second.
*/
function serviceOf(ctx, name) {
	const getter = ctx.get;
	if (typeof getter === "function") try {
		const value = getter.call(ctx, name);
		if (value !== void 0) return value;
	} catch {}
	try {
		return ctx[name];
	} catch {
		return;
	}
}
/** Where a pre-0.1.0 release kept its own JSON, before the settings namespace. */
function legacyPath(ctx) {
	const home = serviceOf(ctx, "profileContext")?.home;
	return typeof home === "string" && home !== "" ? path.join(home, LEGACY_FILE) : path.join(os.homedir(), ".dsh", LEGACY_FILE);
}
/**
* Import the old standalone file exactly once, and never over a value the user
* has since written through the panel.
*/
function importLegacy(ctx, settings, ns) {
	const file = legacyPath(ctx);
	let exists = false;
	try {
		exists = fs.existsSync(file);
	} catch {
		return "no-file";
	}
	if (!exists) return "no-file";
	const current = describeValue(settings, ns);
	if (current.error !== void 0) return "failed";
	if (current.state !== null) return "already-configured";
	try {
		const parsed = safeParse(fs.readFileSync(file, "utf8"));
		if (parsed === null) return "failed";
		const state = normalizeState(parsed.state ?? parsed);
		settings.update(ns, {
			state,
			legacyImported: true
		}, current.descriptor?.revision);
		try {
			fs.renameSync(file, file + ".imported");
		} catch {}
		return "imported";
	} catch {
		return "failed";
	}
}
/**
* Mount both halves. Total function: a deployment without settings or
* webServer keeps its stock sidebar and logs nothing scary.
*/
function apply(ctx, config) {
	if (ctx === void 0 || ctx === null || typeof ctx !== "object") return;
	let settings;
	const nsOf = () => {
		try {
			return ownEntryId(ctx) ?? "sidebar-groups";
		} catch {
			return NAMESPACE;
		}
	};
	if (typeof ctx.inject !== "function") return;
	try {
		ctx.inject(["settings"], (ready) => {
			const service = ready.settings;
			if (service === void 0 || typeof service.describe !== "function") return;
			settings = service;
			const ns = nsOf();
			try {
				service.configure?.({ auto: true }, ctx.fiber);
			} catch {}
			const timer = setTimeout(() => {
				try {
					const outcome = importLegacy(ctx, service, ns);
					const logger = serviceOf(ctx, "logger");
					if (outcome === "imported") logger?.info?.(PACKAGE_NAME + ": imported the legacy " + LEGACY_FILE);
				} catch {}
			}, 2e3);
			try {
				ctx.effect?.(() => () => {
					clearTimeout(timer);
				}, PACKAGE_NAME + ": legacy import timer");
			} catch {}
		});
	} catch {}
	try {
		ctx.inject(["webServer"], (ready) => {
			const server = ready.webServer;
			if (server === void 0 || typeof server.register !== "function") return;
			/**
			* NEVER a 5xx.
			*
			* The desktop shell renders a failed fetch as a bare console line with no
			* body, so a 500 here hides the only thing that matters — WHY it failed.
			* Every branch below answers 200 with a body the client can print in its
			* diagnostics line; `ok` is what tells the client whether to trust it.
			* (A private route that only this plugin reads does not need the status
			* code to carry the meaning.)
			*/
			const fail = (response, stage, error) => {
				writeJson(response, 200, {
					ok: false,
					state: null,
					error: stage + ": " + messageOf(error)
				});
			};
			const handler = async (request, response) => {
				let stage = "start";
				try {
					stage = "fence";
					const connection = serviceOf(ctx, "connection");
					const fence = connection?.requestRejection;
					if (typeof fence === "function") {
						let rejected;
						try {
							rejected = fence.call(connection, request);
						} catch (error) {
							fail(response, "fence", error);
							return;
						}
						if (rejected !== void 0) {
							writeJson(response, 200, {
								ok: false,
								state: null,
								error: "fence: rejected"
							});
							return;
						}
					}
					stage = "url";
					const pathname = new URL(String(request.url ?? "/"), "http://dsh.internal").pathname;
					const prefix = ROUTE_PREFIX + "/";
					const method = pathname.startsWith(prefix) ? pathname.slice(20) : "";
					stage = "settings";
					const service = settings;
					if (service === void 0) {
						writeJson(response, 200, {
							ok: false,
							state: null,
							error: "settings: the settings service is not mounted"
						});
						return;
					}
					stage = "namespace";
					const ns = nsOf();
					if (method === "state") {
						stage = "describe";
						const view = describeValue(service, ns);
						if (view.error !== void 0) {
							writeJson(response, 200, {
								ok: false,
								state: null,
								error: "describe: " + view.error
							});
							return;
						}
						writeJson(response, 200, {
							ok: true,
							state: view.state,
							revision: view.descriptor?.revision
						});
						return;
					}
					if (method === "update") {
						stage = "method";
						if (String(request.method ?? "GET").toUpperCase() !== "POST") {
							writeJson(response, 200, {
								ok: false,
								state: null,
								error: "method: expected POST"
							});
							return;
						}
						stage = "body";
						const body = safeParse(await readBody(request));
						if (body === null || !("state" in body)) {
							writeJson(response, 200, {
								ok: false,
								state: null,
								error: "body: expected { state }"
							});
							return;
						}
						const state = normalizeState(body.state);
						stage = "describe";
						const view = describeValue(service, ns);
						stage = "update";
						try {
							await service.update(ns, {
								state,
								legacyImported: true
							}, view.descriptor?.revision);
						} catch (error) {
							fail(response, "update", error);
							return;
						}
						writeJson(response, 200, {
							ok: true,
							state
						});
						return;
					}
					writeJson(response, 200, {
						ok: false,
						state: null,
						error: "route: unknown method \"" + method + "\""
					});
				} catch (error) {
					fail(response, stage, error);
				}
			};
			try {
				ctx.effect?.(() => server.register({
					kind: "prefix",
					path: ROUTE_PREFIX,
					handler
				}), PACKAGE_NAME + ": routes");
			} catch {}
		});
	} catch {}
}
export { Config, NAMESPACE, PACKAGE_NAME, apply, importLegacy, name, ownEntryId };
