window.__ModuleLoader__.load({ id: "dsh-sidebar-groups", factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		const MORE_GROUP_ID = "more";
		const WORKSPACE_GROUP_ID = "ws-all";
		/**
		* The default top-level set, matched against the PANEL REGISTRY's resolved
		* label — never against the DOM's rendered text, and never persisted.
		*
		* This is the one accepted exception to "never match by display text" (see
		* README + the comment on `resolveNavEntries` in dom-adapter.ts): the shipped
		* product has to guess three ids it has never seen, and a resolved slot label
		* is the only identity the registry shares with the DOM (`aria-label`) and with
		* the user. It runs ONCE, on first sight of the registry; every later read and
		* write is keyed by the ids it produced. Several locales are listed per group
		* precisely so this never becomes a Chinese-only assumption; when nothing
		* matches, the registry ORDER decides (`FALLBACK_POSITIONS`).
		*/
		const TOP_LABEL_CANDIDATES = [
			[
				"插件",
				"plugin",
				"plugins",
				"插件管理",
				"plugin manager"
			],
			[
				"插件市场",
				"plugin market",
				"plugin marketplace",
				"marketplace",
				"插件商店"
			],
			[
				"任务看板",
				"任务面板",
				"task board",
				"taskboard",
				"task-board",
				"tasks",
				"看板"
			]
		];
		/** Registry positions used when no label matches: 插件 / 插件市场 / 任务看板. */
		const FALLBACK_POSITIONS = [
			0,
			1,
			4
		];
		/** Labels are compared case-insensitively and without surrounding space. */
		function normalizeLabel(value) {
			return value.trim().toLowerCase();
		}
		function defaultState() {
			return {
				version: 3,
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
			if (typeof record.version === "number" && record.version !== 3) return base;
			const nav = asRecord(record.nav);
			const workspaces = asRecord(record.workspaces);
			return {
				version: typeof record.version === "number" ? record.version : 3,
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
		/** Registry order, which is what `entriesOfSlot` already gives us. */
		function sortEntries(entries) {
			return [...entries].sort((left, right) => left.order - right.order);
		}
		/**
		* First-run preset: three ids on top, everything else inside a folded 更多.
		* Matched by resolved label equality first, registry order second.
		*/
		function resolveDefaultNavGroups(entries) {
			const sorted = sortEntries(entries);
			const top = [];
			for (const candidates of TOP_LABEL_CANDIDATES) {
				const wanted = candidates.map(normalizeLabel);
				const hit = sorted.find((entry) => !top.includes(entry.id) && wanted.includes(normalizeLabel(entry.label)));
				if (hit !== void 0) top.push(hit.id);
			}
			for (const position of FALLBACK_POSITIONS) {
				if (top.length >= TOP_LABEL_CANDIDATES.length) break;
				const entry = sorted[position];
				if (entry !== void 0 && !top.includes(entry.id)) top.push(entry.id);
			}
			for (const entry of sorted) {
				if (top.length >= TOP_LABEL_CANDIDATES.length) break;
				if (!top.includes(entry.id)) top.push(entry.id);
			}
			const more = sorted.filter((entry) => !top.includes(entry.id)).map((entry) => entry.id);
			return {
				configured: true,
				groups: [{
					id: "top",
					label: "常用",
					collapsed: false,
					showHeader: false,
					items: top
				}, {
					id: MORE_GROUP_ID,
					label: "更多",
					collapsed: true,
					showHeader: true,
					items: more
				}]
			};
		}
		/**
		* Reconcile a stored section against what is actually registered right now.
		*
		* - A side that has never been configured gets the preset (`preset` given).
		* - Ids that no longer exist stay in the config: panels can be installed and
		*   removed, and dropping their placement would lose the user's choice.
		* - New ids (a freshly installed panel) join the LAST group, which is the
		*   folded one — a new panel must not push itself into the always-open top set.
		*/
		function itemCount(groups) {
			let total = 0;
			for (const group of groups) total += group.items.length;
			return total;
		}
		/** True when this document holds no placement at all (nothing to persist). */
		function isBlankState(state) {
			return itemCount(state.nav.groups) === 0 && itemCount(state.workspaces.groups) === 0;
		}
		function syncSection(spec, knownIds, preset) {
			let changed = false;
			const live = spec.groups.filter((group) => group.id !== "");
			const wasConfigured = spec.configured === true && itemCount(live) > 0;
			let groups;
			if (preset !== null && !wasConfigured) {
				groups = preset().groups.map((group) => ({
					...group,
					items: [...group.items]
				}));
				changed = true;
			} else groups = live.map((group) => ({
				...group,
				items: [...group.items]
			}));
			if (knownIds.length > 0) {
				const assigned = new Set(groups.flatMap((group) => group.items));
				const orphans = knownIds.filter((id) => !assigned.has(id));
				if (orphans.length > 0) {
					const target = groups.length > 0 ? groups[groups.length - 1] : void 0;
					if (target === void 0) groups = [{
						id: MORE_GROUP_ID,
						label: "更多",
						collapsed: true,
						showHeader: true,
						items: orphans
					}];
					else target.items.push(...orphans);
					changed = true;
				}
			}
			const configured = itemCount(groups) > 0 && (wasConfigured || changed);
			if (spec.configured !== configured) changed = true;
			return {
				spec: {
					groups,
					configured
				},
				changed
			};
		}
		/** Navigation side of {@link syncSection}: preset comes from the registry. */
		function syncNavGroups(state, entries) {
			if (entries.length === 0) return {
				state,
				changed: false
			};
			const ids = sortEntries(entries).map((entry) => entry.id);
			const result = syncSection(state.nav, ids, () => resolveDefaultNavGroups(entries));
			if (!result.changed) return {
				state,
				changed: false
			};
			return {
				state: {
					...state,
					nav: result.spec
				},
				changed: true
			};
		}
		// src/client/dom-adapter.ts
		/** Attribute selectors only: no hashed class, so they survive upgrades. */
		const SELECTORS = {
			toggle: "[data-sidebar-toggle]",
			opener: "[data-sidebar-opener]",
			drawer: "[data-sidebar-drawer]",
			animating: "[data-animating]",
			dragging: "[data-dragging]",
			tree: "[role=\"tree\"]",
			root: "[class*=\"_root\"]"
		};
		/** Our own bookkeeping attributes. Every node carrying one is ours to delete. */
		const MARKS = {
			style: "data-sg-style",
			nav: "data-sg-nav",
			navGroup: "data-sg-nav-group",
			navItem: "data-sg-nav-item",
			hidden: "data-sg-hidden",
			ws: "data-sg-ws",
			wsGroup: "data-sg-ws-group",
			wsSection: "data-sg-ws-section",
			scroll: "data-sg-scroll"
		};
		const ROW_CLASS = "dsh-sg-row";
		const HEAD_CLASS = "dsh-sg-head";
		const ACTIVE_CLASS = "dsh-sg-active";
		const STYLE_ID = "dsh-sidebar-groups-style";
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
`;
		/** One mounted adapter per document, so two applies can never double-mount. */
		let CURRENT = null;
		/**
		* The boot ladder: one frame, then four spaced attempts. Bounded on purpose —
		* after ~9 seconds the plugin stops trying, so a host this DOM never appears in
		* costs nothing for the rest of the session.
		*/
		const RETRY_PLAN = [
			"frame",
			300,
			1e3,
			2500,
			5e3
		];
		/** The adapter currently owning the sidebar, if any (diagnostics + tests). */
		function activeAdapter() {
			return CURRENT;
		}
		function globalDocument() {
			return globalThis.document ?? null;
		}
		function tagOf(element) {
			return String(element.tagName ?? "").toLowerCase();
		}
		function classOf(element) {
			return String(element.className ?? "");
		}
		function addClass(element, name) {
			const list = element.classList;
			if (list !== void 0 && typeof list.add === "function") {
				list.add(name);
				return;
			}
			const parts = new Set(classOf(element).split(/\s+/).filter(Boolean));
			parts.add(name);
			element.setAttribute("class", [...parts].join(" "));
		}
		function removeClass(element, name) {
			const list = element.classList;
			if (list !== void 0 && typeof list.remove === "function") {
				list.remove(name);
				return;
			}
			const parts = classOf(element).split(/\s+/).filter(Boolean).filter((part) => part !== name);
			element.setAttribute("class", parts.join(" "));
		}
		function children(element) {
			if (element === null || element === void 0) return [];
			return Array.from(element.children ?? []);
		}
		/** `<div class="_root ...">`-shaped ancestors, found without a class hash. */
		function closestRoot(element) {
			let cursor = element;
			let hops = 0;
			while (cursor !== null && hops < 12) {
				if (tagOf(cursor) === "div" && /(^|\s)\S*_root(\s|$)/.test(classOf(cursor))) return cursor;
				cursor = cursor.parentElement;
				hops += 1;
			}
			return null;
		}
		function isGroupSection(element) {
			return tagOf(element) === "div" && /(^|\s)\S*_groupSection(\s|$)/.test(classOf(element));
		}
		function sectionKey(element) {
			const first = children(element)[0] ?? element;
			return String(first.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
		}
		var DomAdapter = class {
			env;
			hooks;
			doc;
			win;
			mounted = false;
			disabled = false;
			/** Set by teardown(): a torn-down adapter must not come back on its own. */
			retired = false;
			observer = null;
			timer = null;
			releaseTimer = null;
			suppress = false;
			styleEl = null;
			navBox = null;
			wsBox = null;
			root = null;
			nav = null;
			tree = null;
			originals = /* @__PURE__ */ new Map();
			hidden = /* @__PURE__ */ new Set();
			rows = /* @__PURE__ */ new Map();
			workspaceKeys = [];
			/** Why the last `resolve()` did what it did — the panel shows this verbatim. */
			lastReason = "not-attempted";
			entriesSource = "none";
			retryCancel = null;
			retryLevel = { used: 0 };
			scout = null;
			scoutAttemptedAt = 0;
			lastEntrySignature = "";
			/** Last five log lines. The panel prints the newest one; there is no console. */
			recent = [];
			/** Rows this refresh meant to draw / ids in the config that matched no row. */
			planned = 0;
			unmatched = 0;
			constructor(env, hooks) {
				this.env = env;
				this.hooks = hooks;
				this.doc = env.doc ?? globalDocument();
				this.win = env.win ?? globalThis ?? null;
			}
			get isMounted() {
				return this.mounted;
			}
			get isDisabled() {
				return this.disabled;
			}
			/** Why the last resolve() ran or bailed: ok / no-root / drawer / ... */
			get reason() {
				return this.lastReason;
			}
			/** Where the current entry ids came from: registry, dom (degraded), none. */
			get entrySource() {
				return this.entriesSource;
			}
			/** Retry attempts consumed by the boot ladder (0..5). */
			get retriesUsed() {
				return this.retryLevel.used;
			}
			/**
			* One line, plain text, meant to be READ in the panel — never parsed. Every
			* field here exists because it was the missing fact in a live failure: is the
			* adapter mounted, why did resolve bail, did the ids line up, did anything
			* get drawn, and how tall is the container we drew into.
			*/
			describe() {
				const status = this.disabled ? "disabled" : this.mounted ? "mounted" : "idle";
				const box = this.navBox;
				const boxHeight = box === null ? 0 : Number(box.offsetHeight) || 0;
				const navHeight = this.nav === null ? 0 : Number(this.nav.offsetHeight) || 0;
				return "adapter=" + status + " reason=" + this.lastReason + " entries=" + this.entriesSource + " retries=" + String(this.retryLevel.used) + " workspaces=" + String(this.workspaceKeys.length) + " rows=" + String(this.rows.size) + " navBox=" + String(box === null ? 0 : box.children.length) + " planned=" + String(this.planned) + " unmatched=" + String(this.unmatched) + " hidden=" + String(this.hidden.size) + " navH=" + String(navHeight) + " boxH=" + String(boxHeight) + " lastLog=" + this.lastLog;
			}
			/** Workspace section labels the DOM currently shows (for the panel). */
			getWorkspaces() {
				return [...this.workspaceKeys];
			}
			log(message, detail) {
				const line = detail === void 0 ? message : message + " :: " + (detail instanceof Error ? detail.message : String(detail));
				this.recent.push(line);
				if (this.recent.length > 5) this.recent.shift();
				try {
					this.hooks.log?.(line);
				} catch {}
			}
			get lastLog() {
				return (this.recent[this.recent.length - 1] ?? "").replace(/\s+/g, "_").slice(0, 60);
			}
			later(callback, delay) {
				const host = this.win;
				return (typeof host?.setTimeout === "function" ? host.setTimeout.bind(host) : setTimeout)(callback, delay);
			}
			cancel(handle) {
				if (handle === null) return;
				const host = this.win;
				(typeof host?.clearTimeout === "function" ? host.clearTimeout.bind(host) : clearTimeout)(handle);
			}
			/**
			* Idempotent: a second call on a mounted adapter just re-renders, and a
			* second adapter for the same document takes over (the first one is torn
			* down first) so the sidebar can never carry two copies of our nodes.
			*/
			mount() {
				if (this.disabled) return false;
				if (this.doc === null || typeof this.doc.querySelector !== "function") {
					this.lastReason = "no-document";
					return false;
				}
				this.retired = false;
				try {
					if (CURRENT !== null && CURRENT !== this) CURRENT.teardown();
					CURRENT = this;
					if (this.mounted) {
						this.refresh();
						return true;
					}
					const targets = this.resolve();
					if (targets === null) {
						this.scheduleRetry();
						return false;
					}
					this.mounted = true;
					this.stopScout();
					this.apply(targets);
					this.observe();
					return true;
				} catch (error) {
					this.fail(error);
					return false;
				}
			}
			/**
			* Re-read the DOM and re-render. Cheap enough to run on every debounce — and
			* the single place a LATE mount happens: every signal (retry ladder, boot
			* scout, store change, debounced observer) funnels through here, so an
			* adapter that missed the boot window mounts on the first one after the
			* sidebar exists.
			*/
			refresh() {
				if (this.disabled || this.retired) return;
				if (!this.mounted) {
					this.mount();
					return;
				}
				try {
					const targets = this.resolve();
					if (targets === null) return;
					this.apply(targets);
				} catch (error) {
					this.fail(error);
				}
			}
			apply(targets) {
				this.suppress = true;
				try {
					this.root = targets.root;
					this.nav = targets.nav;
					this.tree = targets.tree;
					this.ensureStyle();
					const state = this.safeState();
					if (state.scrolling) this.applyScroll(targets);
					else this.restoreScroll();
					this.renderNav(state);
					this.renderWorkspaces(state);
				} finally {
					this.cancel(this.releaseTimer);
					this.releaseTimer = this.later(() => {
						this.suppress = false;
					}, 60);
				}
			}
			safeState() {
				try {
					return this.hooks.state();
				} catch {
					return FALLBACK_STATE;
				}
			}
			/**
			* Locate the sidebar, or answer `null` when this round must be skipped.
			* DOM-CONTRACT.md §E: drawer (either state), a width animation, a drag, and
			* the 56px rail are all "not our scenario"; touching them breaks the
			* framework's own transitions.
			*/
			resolve() {
				const doc = this.doc;
				if (doc === null || typeof doc.querySelector !== "function") {
					this.lastReason = "no-document";
					return null;
				}
				if (doc.querySelector(SELECTORS.drawer) !== null) {
					this.lastReason = "drawer";
					return null;
				}
				if (doc.querySelector(SELECTORS.animating) !== null) {
					this.lastReason = "animating";
					return null;
				}
				if (doc.querySelector(SELECTORS.dragging) !== null) {
					this.lastReason = "dragging";
					return null;
				}
				const toggle = doc.querySelector(SELECTORS.toggle) ?? doc.querySelector(SELECTORS.opener);
				let root = toggle !== null ? closestRoot(toggle) : null;
				if (root === null) root = (typeof doc.querySelectorAll === "function" ? Array.from(doc.querySelectorAll(SELECTORS.root)) : []).find((candidate) => tagOf(candidate) === "div" && children(candidate).some((kid) => tagOf(kid) === "nav")) ?? null;
				if (root === null) {
					this.lastReason = "no-root";
					return null;
				}
				if (/(^|\s)\S*_collapsed(\s|$)/.test(classOf(root))) {
					this.lastReason = "rail-collapsed";
					return null;
				}
				const kids = children(root);
				const nav = kids.find((kid) => tagOf(kid) === "nav") ?? null;
				if (nav === null) {
					this.lastReason = "no-nav";
					return null;
				}
				const navIndex = kids.indexOf(nav);
				const top = kids.slice(0, navIndex).filter((kid) => tagOf(kid) !== "script");
				const after = kids.slice(navIndex + 1);
				const foot = after[after.length - 1] ?? null;
				const treeCandidate = doc.querySelector(SELECTORS.tree);
				const tree = treeCandidate !== null && root.contains(treeCandidate) ? treeCandidate : null;
				this.lastReason = "ok";
				return {
					root,
					nav,
					foot,
					top,
					tree
				};
			}
			setStyle(element, property, value) {
				const style = element.style;
				if (style === void 0 || style === null || typeof style.setProperty !== "function") return;
				let record = this.originals.get(element);
				if (record === void 0) {
					record = /* @__PURE__ */ new Map();
					this.originals.set(element, record);
				}
				if (!record.has(property)) record.set(property, style.getPropertyValue(property) ?? "");
				style.setProperty(property, value);
			}
			fillColor(root) {
				try {
					const computed = this.win?.getComputedStyle?.(root)?.backgroundColor;
					if (typeof computed === "string" && computed !== "" && computed !== "transparent" && computed !== "rgba(0, 0, 0, 0)") return computed;
				} catch {}
				return "var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, transparent))";
			}
			/**
			* DOM-CONTRACT.md §D.4, applied as inline styles on the elements themselves.
			* The `scrollbar-gutter: stable` reservation MOVES from the inner list to the
			* outer column: leaving it behind makes the column jump 5px sideways the
			* moment the new scrollbar appears.
			*/
			applyScroll(targets) {
				const { root, tree, top, foot, nav } = targets;
				this.setStyle(nav, "flex", "none");
				this.setStyle(nav, "min-height", "auto");
				this.setStyle(nav, "overflow", "visible");
				this.setStyle(root, "height", "100%");
				this.setStyle(root, "overflow-y", "auto");
				this.setStyle(root, "overflow-x", "hidden");
				this.setStyle(root, "scrollbar-gutter", "stable");
				this.setStyle(root, "overscroll-behavior", "contain");
				this.setStyle(root, "padding-bottom", "16px");
				root.setAttribute(MARKS.scroll, "1");
				let offset = 0;
				for (const block of top) {
					this.setStyle(block, "position", "sticky");
					this.setStyle(block, "top", `${offset}px`);
					this.setStyle(block, "z-index", "3");
					this.setStyle(block, "background", this.fillColor(root));
					offset += Number(block.offsetHeight) || 0;
				}
				if (foot !== null) {
					this.setStyle(foot, "position", "sticky");
					this.setStyle(foot, "bottom", "0px");
					this.setStyle(foot, "z-index", "3");
					this.setStyle(foot, "background", this.fillColor(root));
				}
				if (tree === null) return;
				let cursor = tree;
				let hops = 0;
				while (cursor !== null && cursor !== root && hops < 10) {
					this.setStyle(cursor, "flex", "none");
					this.setStyle(cursor, "min-height", "auto");
					this.setStyle(cursor, "overflow", "visible");
					if (cursor === tree) {
						this.setStyle(cursor, "overflow-y", "visible");
						this.setStyle(cursor, "scrollbar-gutter", "auto");
						this.setStyle(cursor, "padding-bottom", "0px");
					}
					cursor = cursor.parentElement;
					hops += 1;
				}
			}
			restoreScroll() {
				for (const [element, record] of [...this.originals]) {
					const style = element.style;
					if (style === void 0 || style === null) continue;
					for (const [property, value] of record) try {
						style.setProperty(property, value);
					} catch {}
				}
				this.originals.clear();
				for (const element of this.findMarked(MARKS.scroll)) element.removeAttribute(MARKS.scroll);
			}
			findMarked(mark) {
				const doc = this.doc;
				if (doc === null || typeof doc.querySelectorAll !== "function") return [];
				try {
					return Array.from(doc.querySelectorAll(`[${mark}]`));
				} catch {
					return [];
				}
			}
			ensureStyle() {
				const doc = this.doc;
				if (doc === null) return;
				if (this.styleEl !== null && this.styleEl.isConnected !== false && this.styleEl.parentNode) return;
				const host = doc.head ?? doc.body ?? doc.documentElement;
				if (host === null || typeof doc.createElement !== "function") return;
				const existing = this.findMarked(MARKS.style)[0];
				const element = existing ?? doc.createElement("style");
				element.setAttribute(MARKS.style, "1");
				element.setAttribute("id", STYLE_ID);
				element.textContent = STYLE_TEXT;
				if (existing === void 0) host.appendChild(element);
				this.styleEl = element;
			}
			renderNav(state) {
				const nav = this.nav;
				if (nav === null) {
					this.log("render: no <nav>");
					return;
				}
				const rows = this.panelRows(nav);
				const entries = this.readEntries(rows);
				if (entries.length === 0) {
					this.planned = 0;
					this.log("render: no entries");
					return;
				}
				const mapped = this.align(rows, entries);
				const more = this.nativeMore(nav, new Set(mapped.values()));
				const configured = state.nav.groups.reduce((sum, group) => sum + group.items.length, 0);
				const frames = [];
				const assigned = /* @__PURE__ */ new Set();
				let planned = 0;
				let unmatched = 0;
				for (const group of state.nav.groups) {
					const items = group.items.filter((id) => mapped.has(id));
					planned += items.length;
					unmatched += group.items.length - items.length;
					if (group.showHeader && group.items.length > 0) frames.push(this.groupHeader(group, "nav"));
					for (const id of items) assigned.add(id);
					if (group.collapsed) continue;
					for (const id of items) frames.push(this.itemRow(id, mapped.get(id), entries));
				}
				this.planned = planned;
				this.unmatched = unmatched;
				const box = this.ensureBox(nav, MARKS.nav, this.navBox);
				this.navBox = box;
				this.styleBox(box);
				if (planned === 0 && configured > 0 && box.children.length > 0) {
					this.log("render kept: planned=0 unmatched=" + String(unmatched));
					return;
				}
				box.textContent = "";
				for (const node of frames) box.appendChild(node);
				this.rows.clear();
				for (const [id, row] of mapped) this.rows.set(id, row);
				for (const [id, row] of mapped) if (assigned.has(id)) this.hideRow(row);
				else this.showRow(row);
				if (more !== null) {
					if (assigned.size > 0) this.hideRow(more);
					else this.showRow(more);
				}
				if (more !== null && more.parentNode === nav) nav.insertBefore(box, more);
				else nav.appendChild(box);
				this.log("render planned=" + String(planned) + " drawn=" + String(box.children.length) + " assigned=" + String(assigned.size));
				this.syncActive();
			}
			/** The framework's overflow launcher: the non-registry button in the nav. */
			nativeMore(nav, _mappedRows) {
				const direct = children(nav).filter((kid) => tagOf(kid) === "button").find((kid) => kid.hasAttribute("aria-haspopup"));
				const nested = direct !== void 0 ? null : typeof nav.querySelector === "function" ? nav.querySelector("button[aria-haspopup]") : null;
				const button = direct ?? nested;
				if (button === null || button === void 0) return null;
				let cursor = button;
				while (cursor !== null && cursor.parentElement !== null && cursor.parentElement !== nav) cursor = cursor.parentElement;
				return cursor;
			}
			/** Our container is a flex column that never shrinks inside the nav. */
			styleBox(box) {
				const style = box.style;
				if (style === void 0 || style === null) return;
				style.setProperty("display", "flex");
				style.setProperty("flex-direction", "column");
				style.setProperty("flex", "none");
				style.setProperty("min-height", "0");
				style.setProperty("width", "100%");
			}
			/**
			* The entries to align against.
			*
			* Normally the registry's (`ctx.slots.entriesOfSlot('sidebar.panellist')`).
			* When that API is missing or empty — a host that never filled the slot table,
			* or a build where `slots.entriesOfSlot` does not exist — the ids are derived
			* from the RENDERED ROWS, in registration order, and the label is the row's
			* own `aria-label`. Grouping keeps working, it just loses the durable id.
			*/
			readEntries(rows) {
				let entries = [];
				try {
					const value = this.hooks.entries();
					if (Array.isArray(value)) entries = value.filter((entry) => typeof entry?.id === "string" && entry.id !== "");
				} catch {
					entries = [];
				}
				if (entries.length > 0) {
					this.entriesSource = "registry";
					this.publishEntries(entries, "registry");
					return entries;
				}
				if (rows.length === 0) {
					this.entriesSource = "none";
					return [];
				}
				this.entriesSource = "dom";
				const derived = rows.map((row, index) => ({
					id: "dom:" + String(index),
					order: index,
					label: row.getAttribute("aria-label") ?? "panel-" + String(index + 1)
				}));
				this.publishEntries(derived, "dom");
				return derived;
			}
			/** Tell the caller which entries were used, but only when that changed. */
			publishEntries(entries, source) {
				const signature = source + "|" + entries.map((entry) => entry.id + "=" + entry.label).join(",");
				if (signature === this.lastEntrySignature) return;
				this.lastEntrySignature = signature;
				try {
					this.hooks.onEntries?.(entries, source);
				} catch {}
			}
			/** The framework's own panel buttons: direct `<button>` children of the nav. */
			panelRows(nav) {
				return children(nav).filter((kid) => tagOf(kid) === "button" && !kid.hasAttribute("aria-haspopup"));
			}
			/**
			* Row ↔ entry alignment. There is no `data-panel-id` in the markup, so the
			* only key shared by the registry and the DOM is the RESOLVED LABEL that the
			* framework copied into `aria-label` (DOM-CONTRACT.md §B.5). We therefore
			* compare against the registry's own labels AT THIS MOMENT and never against
			* a hardcoded string; whatever does not line up falls back to registry order.
			*/
			align(rows, entries) {
				const mapped = /* @__PURE__ */ new Map();
				const used = /* @__PURE__ */ new Set();
				for (const entry of entries) {
					const row = rows.find((candidate) => !used.has(candidate) && (candidate.getAttribute("aria-label") === entry.label || candidate.getAttribute("aria-label") === entry.id));
					if (row !== void 0) {
						used.add(row);
						mapped.set(entry.id, row);
					}
				}
				entries.forEach((entry, index) => {
					if (mapped.has(entry.id)) return;
					const row = rows[index];
					if (row !== void 0 && !used.has(row)) {
						used.add(row);
						mapped.set(entry.id, row);
					}
				});
				return mapped;
			}
			ensureBox(host, mark, current) {
				const doc = this.doc;
				if (current !== null && current.parentNode !== null && current.parentNode !== void 0) return current;
				const existing = children(host).find((kid) => kid.hasAttribute(mark));
				if (existing !== void 0) return existing;
				const box = doc.createElement("div");
				box.setAttribute(mark, "1");
				host.appendChild(box);
				return box;
			}
			groupHeader(group, kind) {
				const doc = this.doc;
				const button = doc.createElement("button");
				button.setAttribute("type", "button");
				button.setAttribute(kind === "nav" ? MARKS.navGroup : MARKS.wsGroup, group.id);
				button.className = HEAD_CLASS;
				button.setAttribute("aria-expanded", group.collapsed ? "false" : "true");
				button.setAttribute("aria-label", group.label);
				const caret = doc.createElement("span");
				caret.className = "dsh-sg-caret";
				caret.textContent = group.collapsed ? "▸" : "▾";
				const title = doc.createElement("span");
				title.className = "dsh-sg-title";
				title.textContent = group.label;
				button.appendChild(caret);
				button.appendChild(title);
				button.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					try {
						if (kind === "nav") this.hooks.setNavCollapsed(group.id, !group.collapsed);
						else this.hooks.setWorkspaceCollapsed(group.id, !group.collapsed);
					} catch (error) {
						this.fail(error);
					}
				});
				return button;
			}
			itemRow(id, row, entries) {
				const doc = this.doc;
				const label = entries.find((candidate) => candidate.id === id)?.label ?? id;
				const button = doc.createElement("button");
				button.setAttribute("type", "button");
				button.setAttribute(MARKS.navItem, id);
				button.className = ROW_CLASS;
				button.setAttribute("aria-label", label);
				button.setAttribute("title", label);
				const glyph = doc.createElement("span");
				glyph.className = "dsh-sg-glyph";
				const source = children(row).find((kid) => /(^|\s)\S*panelGlyph(\s|$)/.test(classOf(kid)));
				if (source !== void 0 && typeof source.cloneNode === "function") {
					const clone = source.cloneNode(true);
					glyph.appendChild(clone);
				}
				const title = doc.createElement("span");
				title.className = "dsh-sg-title";
				title.textContent = label;
				button.appendChild(glyph);
				button.appendChild(title);
				button.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					try {
						row.click();
						this.later(() => this.syncActive(), 0);
					} catch (error) {
						this.fail(error);
					}
				});
				return button;
			}
			/** Mirror the framework's own active marker onto our row. */
			syncActive() {
				if (this.doc === null || this.navBox === null) return;
				for (const [id, row] of this.rows) {
					const our = children(this.navBox).find((kid) => kid.getAttribute(MARKS.navItem) === id);
					if (our === void 0) continue;
					const current = row.getAttribute("aria-current");
					const active = current !== null && current !== "" ? current : /(^|\s)\S*panelActive(\S|\s|$)/.test(classOf(row)) ? "page" : null;
					if (active === null) {
						removeClass(our, ACTIVE_CLASS);
						our.removeAttribute("aria-current");
					} else {
						addClass(our, ACTIVE_CLASS);
						our.setAttribute("aria-current", active);
					}
				}
			}
			hideRow(row) {
				if (this.hidden.has(row)) return;
				const style = row.style;
				if (style === void 0 || style === null) return;
				let record = this.originals.get(row);
				if (record === void 0) {
					record = /* @__PURE__ */ new Map();
					this.originals.set(row, record);
				}
				if (!record.has("display")) record.set("display", style.getPropertyValue("display") ?? "");
				style.setProperty("display", "none");
				row.setAttribute(MARKS.hidden, "1");
				this.hidden.add(row);
			}
			showRow(row) {
				if (!this.hidden.has(row)) return;
				this.hidden.delete(row);
				row.removeAttribute(MARKS.hidden);
				const style = row.style;
				const record = this.originals.get(row);
				if (style === void 0 || style === null) return;
				const restore = record?.get("display") ?? "";
				style.setProperty("display", restore);
				record?.delete("display");
			}
			/**
			* Workspace rows carry no id and are React-owned (cloning them would drop
			* their event handlers), so grouping here means HIDE the original sections
			* and draw our own fold bar. With the shipped single group that bar is not
			* rendered at all, which keeps F3's "no empty group headers" true by
			* construction.
			*/
			renderWorkspaces(state) {
				const tree = this.tree;
				if (tree === null) return;
				const sections = children(tree).filter((kid) => !kid.hasAttribute(MARKS.ws) && isGroupSection(kid));
				const keys = sections.map(sectionKey);
				if (keys.length !== this.workspaceKeys.length || keys.some((key, index) => key !== this.workspaceKeys[index])) {
					this.workspaceKeys = keys;
					try {
						this.hooks.onWorkspaces?.(keys);
					} catch {}
				}
				const groups = state.workspaces.groups;
				const owner = /* @__PURE__ */ new Map();
				sections.forEach((section, index) => {
					const key = keys[index] ?? sectionKey(section);
					const group = groups.find((group) => group.items.includes(key)) ?? groups[0];
					if (group !== void 0) owner.set(index, group);
				});
				const owners = groups.filter((group) => sections.some((_, index) => owner.get(index) === group));
				if (owners.length < 2) {
					for (const section of sections) this.showRow(section);
					const stale = children(tree).find((kid) => kid.hasAttribute(MARKS.ws));
					if (stale !== void 0) stale.textContent = "";
					return;
				}
				const box = this.ensureBox(tree, MARKS.ws, this.wsBox);
				this.wsBox = box;
				box.textContent = "";
				tree.insertBefore(box, children(tree)[0] ?? null);
				for (const group of owners) {
					box.appendChild(this.groupHeader(group, "ws"));
					sections.forEach((section, index) => {
						if (owner.get(index) !== group) return;
						if (group.collapsed) this.hideRow(section);
						else this.showRow(section);
					});
				}
			}
			observe() {
				const doc = this.doc;
				const root = this.root;
				if (doc === null || root === null) return;
				const Ctor = this.win?.MutationObserver;
				if (typeof Ctor !== "function") return;
				try {
					this.observer = new Ctor(() => this.markDirty());
					this.observer.observe(root, {
						childList: true,
						subtree: true,
						attributes: true,
						attributeFilter: [
							"aria-current",
							"class",
							"style"
						]
					});
				} catch {
					this.observer = null;
				}
			}
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
			scheduleRetry() {
				if (this.disabled || this.mounted || this.retryCancel !== null) return;
				const step = RETRY_PLAN[this.retryLevel.used];
				if (step === void 0) return;
				this.retryLevel.used += 1;
				this.startScout();
				const settle = () => {
					this.retryCancel = null;
					this.attemptMount();
				};
				if (step === "frame") {
					const host = this.win;
					if (typeof host?.requestAnimationFrame === "function") {
						const handle = host.requestAnimationFrame(settle);
						this.retryCancel = () => {
							try {
								host.cancelAnimationFrame?.(handle);
							} catch {}
							this.retryCancel = null;
						};
						return;
					}
					const fallback = this.later(settle, 16);
					this.retryCancel = () => {
						this.cancel(fallback);
						this.retryCancel = null;
					};
					return;
				}
				const handle = this.later(settle, step);
				this.retryCancel = () => {
					this.cancel(handle);
					this.retryCancel = null;
				};
			}
			attemptMount() {
				if (this.disabled || this.retired || this.mounted) {
					this.stopScout();
					return;
				}
				if (this.mount()) return;
				if (this.retryLevel.used >= RETRY_PLAN.length) this.stopScout();
			}
			startScout() {
				if (this.scout !== null) return;
				const body = this.doc?.body;
				const Ctor = this.win?.MutationObserver;
				if (typeof Ctor !== "function" || body === null || body === void 0) return;
				try {
					this.scout = new Ctor(() => {
						if (this.suppress) return;
						const now = Date.now();
						if (now - this.scoutAttemptedAt < 100) return;
						this.scoutAttemptedAt = now;
						this.attemptMount();
					});
					this.scout.observe(body, {
						childList: true,
						subtree: true
					});
				} catch {
					this.scout = null;
				}
			}
			stopScout() {
				try {
					this.scout?.disconnect();
				} catch {}
				this.scout = null;
			}
			markDirty() {
				if (!this.mounted || this.disabled || this.suppress) return;
				this.cancel(this.timer);
				this.timer = this.later(() => {
					this.timer = null;
					this.refresh();
				}, 200);
			}
			fail(error) {
				this.log("disabled after a DOM error", error instanceof Error ? error.message : String(error));
				try {
					this.teardown();
				} catch {}
				this.disabled = true;
			}
			/** Restore everything, exactly. Safe to call on a partially mounted adapter. */
			teardown() {
				this.cancel(this.timer);
				this.cancel(this.releaseTimer);
				this.timer = null;
				this.releaseTimer = null;
				this.retryCancel?.();
				this.retryCancel = null;
				this.stopScout();
				try {
					this.observer?.disconnect();
				} catch {}
				this.observer = null;
				this.suppress = false;
				this.mounted = false;
				this.retired = true;
				for (const row of [...this.hidden]) try {
					this.showRow(row);
				} catch {}
				this.hidden.clear();
				this.restoreScroll();
				for (const element of this.findMarked(MARKS.nav)) this.removeNode(element);
				for (const element of this.findMarked(MARKS.ws)) this.removeNode(element);
				for (const element of this.findMarked(MARKS.style)) this.removeNode(element);
				for (const element of this.findMarked(MARKS.hidden)) element.removeAttribute(MARKS.hidden);
				this.navBox = null;
				this.wsBox = null;
				this.styleEl = null;
				this.root = null;
				this.nav = null;
				this.tree = null;
				this.rows.clear();
				if (CURRENT === this) CURRENT = null;
			}
			removeNode(element) {
				try {
					element.parentNode?.removeChild(element);
				} catch {}
			}
		};
		/** Never-throwing shape used when the state source itself misbehaves. */
		const FALLBACK_STATE = {
			version: 1,
			scrolling: true,
			nav: {
				groups: [],
				configured: true
			},
			workspaces: {
				groups: [],
				configured: true
			}
		};
		// src/client/panel.tsx
		/**
		* The configuration panel: the only React in the package, and the only place
		* the user can move a row between groups.
		*
		* It renders through a PORTAL into `document.body`, because a slot cell lives
		* inside the sidebar's flex column — an inline dialog there would be clipped by
		* the very overflow this plugin introduces.
		*/
		const OVERLAY = {
			position: "fixed",
			inset: "0",
			zIndex: "2147483000",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			background: "rgba(0, 0, 0, .38)"
		};
		const CARD = {
			display: "flex",
			flexDirection: "column",
			width: "min(520px, calc(100vw - 32px))",
			maxHeight: "min(78vh, 720px)",
			overflow: "hidden",
			borderRadius: "14px",
			background: "var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, #fff))",
			color: "var(--dsw-alias-text-primary, inherit)",
			boxShadow: "0 24px 64px rgba(0, 0, 0, .32)",
			border: "1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,.24))",
			font: "inherit",
			fontSize: "13px"
		};
		const ROW = {
			display: "flex",
			alignItems: "center",
			gap: "6px",
			padding: "4px 6px",
			borderRadius: "8px"
		};
		const CLICK = {
			cursor: "pointer",
			border: "1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,.28))",
			background: "transparent",
			color: "inherit",
			borderRadius: "6px",
			padding: "1px 6px",
			font: "inherit",
			lineHeight: "18px"
		};
		/** Store subscription without pulling in an external state library. */
		function useStore(store) {
			const [state, setState] = (0, react.useState)(() => store.get());
			(0, react.useEffect)(() => store.subscribe(setState), [store]);
			return state;
		}
		function GroupRow(props) {
			const { name, group, index, total, store } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					...ROW,
					marginTop: "6px",
					fontWeight: 600
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: CLICK,
						title: group.collapsed ? "展开" : "折叠",
						"aria-expanded": group.collapsed ? "false" : "true",
						onClick: () => store.setGroupCollapsed(name, group.id, !group.collapsed),
						children: group.collapsed ? "▸" : "▾"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							flex: "1 1 auto",
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis"
						},
						children: group.label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: CLICK,
						title: "上移",
						disabled: index === 0,
						onClick: () => store.moveGroup(name, group.id, -1),
						children: "↑"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: CLICK,
						title: "下移",
						disabled: index === total - 1,
						onClick: () => store.moveGroup(name, group.id, 1),
						children: "↓"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: CLICK,
						title: total <= 1 ? "至少保留一个分组" : "删除分组",
						disabled: total <= 1,
						onClick: () => store.removeGroup(name, group.id),
						children: "✕"
					})
				]
			});
		}
		function ItemRow(props) {
			const { name, spec, groupId, itemId, index, total, label, store } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					...ROW,
					paddingLeft: "26px"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							flex: "1 1 auto",
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: CLICK,
						title: "上移",
						disabled: index === 0,
						onClick: () => store.moveItem(name, itemId, -1),
						children: "↑"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: CLICK,
						title: "下移",
						disabled: index === total - 1,
						onClick: () => store.moveItem(name, itemId, 1),
						children: "↓"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						style: {
							...CLICK,
							maxWidth: "128px"
						},
						value: groupId,
						title: "移到分组",
						onChange: (event) => store.assign(name, itemId, event.currentTarget.value),
						children: spec.groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: group.id,
							children: group.label
						}, group.id))
					})
				]
			});
		}
		function Section(props) {
			const { name, title, hint, ids, labels, spec, store } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: {
					padding: "10px 14px",
					borderTop: "1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,.18))"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "baseline",
							gap: "8px"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								style: { fontSize: "13px" },
								children: title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									opacity: .6,
									fontSize: "11px"
								},
								children: hint
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: "1 1 auto" } }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: CLICK,
								onClick: () => store.addGroup(name, name === "nav" ? "新分组" : "新工作区分组"),
								children: "+ 分组"
							})
						]
					}),
					ids.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							opacity: .6,
							margin: "8px 0 0"
						},
						children: "还没有可分组的内容。"
					}) : null,
					spec.groups.map((group, groupIndex) => {
						const items = group.items.filter((id) => ids.includes(id));
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupRow, {
							name,
							group,
							index: groupIndex,
							total: spec.groups.length,
							store
						}), group.collapsed ? null : items.map((itemId, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ItemRow, {
							name,
							spec,
							groupId: group.id,
							itemId,
							index,
							total: items.length,
							label: labels.get(itemId) ?? itemId,
							store
						}, itemId))] }, group.id);
					})
				]
			});
		}
		function GroupPanel(props) {
			const { store, entries, workspaces, diagnostics, onClose } = props;
			const state = useStore(store);
			const navEntries = entries();
			const navIds = navEntries.map((entry) => entry.id);
			const navLabels = new Map(navEntries.map((entry) => [entry.id, entry.label]));
			const workspaceIds = workspaces();
			const workspaceLabels = new Map(workspaceIds.map((id) => [id, id]));
			(0, react.useEffect)(() => {
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				const doc = globalThis.document;
				doc?.addEventListener("keydown", onKey);
				return () => doc?.removeEventListener("keydown", onKey);
			}, [onClose]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: OVERLAY,
				onPointerDown: (event) => {
					if (event.target === event.currentTarget) onClose();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: CARD,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": "侧栏分组",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "8px",
								padding: "12px 14px"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: { fontSize: "14px" },
									children: "侧栏分组"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										opacity: .6,
										fontSize: "11px"
									},
									children: "改动立即生效，无需刷新"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: "1 1 auto" } }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: CLICK,
									onClick: onClose,
									title: "关闭",
									children: "✕"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: { overflowY: "auto" },
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: {
										padding: "0 14px 10px",
										display: "flex",
										alignItems: "center",
										gap: "8px"
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: "6px",
											cursor: "pointer"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: state.scrolling,
											onChange: (event) => store.setScrolling(event.currentTarget.checked)
										}), "整列滚动（顶部/底部固定）"]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, {
									name: "nav",
									title: "导航项",
									hint: "顶层分组不显示标题",
									ids: navIds,
									labels: navLabels,
									spec: state.nav,
									store
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, {
									name: "workspaces",
									title: "工作区",
									hint: "不足两项时自动不显示分组头",
									ids: workspaceIds,
									labels: workspaceLabels,
									spec: state.workspaces,
									store
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								padding: "6px 14px 0",
								fontSize: "10.5px",
								lineHeight: "15px",
								opacity: .62,
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								wordBreak: "break-all"
							},
							title: diagnostics(),
							children: diagnostics()
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
							style: {
								display: "flex",
								gap: "8px",
								padding: "10px 14px",
								borderTop: "1px solid var(--dsw-alias-border-subtle, rgba(128,128,128,.18))"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: CLICK,
									onClick: () => store.reset(navEntries),
									children: "恢复默认"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: "1 1 auto" } }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: CLICK,
									onClick: onClose,
									children: "完成"
								})
							]
						})
					]
				})
			});
		}
		/** Portal wrapper: nothing renders until the user asks for the panel. */
		function GroupPanelPortal(props) {
			const doc = globalThis.document;
			if (doc === void 0 || doc.body === null || doc.body === void 0) return null;
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupPanel, { ...props }), doc.body);
		}
		// src/client/store.ts
		/**
		* Client-side state: one value, a set of pure-ish operations, and the two
		* transports that persist it.
		*
		* The store is deliberately unaware of React and of the DOM. The panel renders
		* from it, the adapter reads it, and `scripts/smoke.mjs` drives it directly —
		* which is why every mutation takes and returns plain data.
		*/
		/** localStorage mirror, so a host without the settings route still remembers. */
		const STORAGE_KEY = "dsh-sidebar-groups:state";
		/**
		* Prefix-safe route base. Resolved against the PAGE base rather than written
		* with a leading slash, so a GUI served under a reverse-proxy directory keeps
		* its prefix (the same reasoning as dsh-better-sidebar's host-route-url.ts).
		*/
		const ROUTE_BASE = "sidebar-groups/api/";
		var SidebarGroupsStore = class {
			state = defaultState();
			listeners = /* @__PURE__ */ new Set();
			options;
			persistTimer = null;
			loaded = false;
			host = "none";
			adoptSkipped = 0;
			/** Live workspace section labels, kept out of the persisted document. */
			workspaces = [];
			constructor(options = {}) {
				this.options = options;
			}
			get() {
				return this.state;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			emit() {
				for (const listener of [...this.listeners]) try {
					listener(this.state);
				} catch {}
			}
			/**
			* Replace the whole state (already normalized) and notify.
			*
			* A document with no placement at all is NEVER written: that is exactly the
			* shape a boot-time race can produce (no registry yet), and persisting it
			* would poison every later session with a "configured but empty" document.
			* The in-memory state still updates, so the UI shows the truth.
			*/
			replace(next, persist = true) {
				this.state = normalizeState(next);
				this.emit();
				if (persist && !isBlankState(this.state)) this.schedulePersist();
			}
			/** 'none' until a route answers; 'ok' / 'err:<message>' after that. */
			hostStatus() {
				return this.host;
			}
			/** How many adoptions were skipped because the id set was empty. */
			adoptSkips() {
				return this.adoptSkipped;
			}
			/** What the last route answer was, for the diagnostics line. */
			markHost(ok, message) {
				this.host = ok ? "ok" : "err:" + (message === void 0 || message === "" ? "unknown" : message);
			}
			section(name) {
				return this.state[name];
			}
			mutate(change, persist = true) {
				const draft = normalizeState(this.state);
				if (!change(draft)) return;
				for (const name of ["nav", "workspaces"]) if (draft[name].groups.some((group) => group.items.length > 0)) draft[name].configured = true;
				this.replace(draft, persist);
			}
			findGroup(name, groupId) {
				return this.section(name).groups.find((group) => group.id === groupId);
			}
			setScrolling(enabled) {
				this.mutate((draft) => {
					if (draft.scrolling === enabled) return false;
					draft.scrolling = enabled;
					return true;
				});
			}
			setGroupCollapsed(name, groupId, collapsed) {
				this.mutate((draft) => {
					const group = draft[name].groups.find((candidate) => candidate.id === groupId);
					if (group === void 0 || group.collapsed === collapsed) return false;
					group.collapsed = collapsed;
					return true;
				});
			}
			setGroupLabel(name, groupId, label) {
				this.mutate((draft) => {
					const group = draft[name].groups.find((candidate) => candidate.id === groupId);
					if (group === void 0 || group.label === label) return false;
					group.label = label;
					return true;
				});
			}
			/** Put one id in one group, removing it from wherever it was. */
			assign(name, itemId, groupId) {
				this.mutate((draft) => {
					const groups = draft[name].groups;
					const target = groups.find((group) => group.id === groupId);
					if (target === void 0) return false;
					let moved = false;
					for (const group of groups) {
						if (group === target) continue;
						const index = group.items.indexOf(itemId);
						if (index >= 0) {
							group.items.splice(index, 1);
							moved = true;
						}
					}
					if (!target.items.includes(itemId)) {
						target.items.push(itemId);
						moved = true;
					}
					return moved;
				});
			}
			/** Reorder one id inside its own group: -1 up, +1 down. */
			moveItem(name, itemId, delta) {
				this.mutate((draft) => {
					const group = draft[name].groups.find((candidate) => candidate.items.includes(itemId));
					if (group === void 0) return false;
					const from = group.items.indexOf(itemId);
					const to = from + delta;
					if (to < 0 || to >= group.items.length) return false;
					group.items.splice(from, 1);
					group.items.splice(to, 0, itemId);
					return true;
				});
			}
			/** Reorder a whole group: -1 up, +1 down. */
			moveGroup(name, groupId, delta) {
				this.mutate((draft) => {
					const groups = draft[name].groups;
					const from = groups.findIndex((group) => group.id === groupId);
					const to = from + delta;
					if (from < 0 || to < 0 || to >= groups.length) return false;
					const [moved] = groups.splice(from, 1);
					if (moved === void 0) return false;
					groups.splice(to, 0, moved);
					return true;
				});
			}
			addGroup(name, label) {
				const base = name === "nav" ? "group" : "ws-group";
				let index = this.section(name).groups.length + 1;
				let id = `${base}-${index}`;
				while (this.findGroup(name, id) !== void 0) {
					index += 1;
					id = `${base}-${index}`;
				}
				this.mutate((draft) => {
					draft[name].groups.push({
						id,
						label,
						collapsed: true,
						showHeader: true,
						items: []
					});
					return true;
				});
				return id;
			}
			removeGroup(name, groupId) {
				this.mutate((draft) => {
					const groups = draft[name].groups;
					if (groups.length <= 1) return false;
					const index = groups.findIndex((group) => group.id === groupId);
					if (index < 0) return false;
					const [removed] = groups.splice(index, 1);
					const fallback = groups[0];
					if (removed !== void 0 && fallback !== void 0) fallback.items.push(...removed.items);
					return true;
				});
			}
			/**
			* Reconcile with the live registry / live workspace list. Runs on every
			* adapter refresh, so it must be cheap and must return "nothing changed"
			* for the common case — a state write here would loop the MutationObserver.
			*/
			adoptEntries(entries) {
				if (!Array.isArray(entries) || entries.length === 0) {
					this.adoptSkipped += 1;
					return false;
				}
				if (!entries.some((entry) => typeof entry.label === "string" && entry.label.trim() !== "")) {
					this.adoptSkipped += 1;
					return false;
				}
				const result = syncNavGroups(this.state, entries);
				if (!result.changed) return false;
				this.replace(result.state);
				return true;
			}
			/**
			* Remember which workspace sections the DOM currently shows, purely so the
			* panel can offer them. This deliberately does NOT write into the document:
			* seeding every live workspace name into the saved config would freeze a
			* snapshot of the user's workspaces at first load, and every rename would
			* leave a dead entry behind. A group's `items` only ever holds what the user
			* actually assigned.
			*/
			noteWorkspaceKeys(keys) {
				const next = keys.slice();
				if (next.length === this.workspaces.length && next.every((key, index) => key === this.workspaces[index])) return;
				this.workspaces = next;
				this.emit();
			}
			/** The workspace section labels discovered by the adapter. */
			workspaceKeys() {
				return [...this.workspaces];
			}
			/** Back to the shipped preset; the registry decides the top-level set. */
			reset(entries) {
				const next = normalizeState(defaultState());
				for (const group of next.nav.groups) group.items = [];
				this.replace(next, false);
				this.adoptEntries(entries);
				this.schedulePersist(0);
			}
			/**
			* The page's own base, so the request stays under a reverse-proxy prefix.
			* Resolved lazily: the store is constructed before anything guarantees a DOM,
			* and the smoke test runs with no document at all.
			*/
			routeUrl(method) {
				const document = globalThis.document;
				const base = this.options.baseUri ?? document?.baseURI;
				if (typeof base !== "string" || base === "") return null;
				try {
					return new URL(ROUTE_BASE + method, base).href;
				} catch {
					return null;
				}
			}
			get fetchImpl() {
				if (this.options.fetchImpl !== void 0) return this.options.fetchImpl;
				const candidate = globalThis.fetch;
				return typeof candidate === "function" ? candidate : null;
			}
			get storage() {
				if (this.options.storage !== void 0) return this.options.storage;
				try {
					return globalThis.localStorage ?? null;
				} catch {
					return null;
				}
			}
			readLocal() {
				try {
					const raw = this.storage?.getItem(STORAGE_KEY);
					if (typeof raw !== "string" || raw === "") return null;
					return normalizeState(JSON.parse(raw));
				} catch {
					return null;
				}
			}
			writeLocal() {
				try {
					this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
				} catch {}
			}
			/**
			* Load once: the host settings namespace is authoritative, the localStorage
			* mirror is the fallback for a host that predates the route. Never throws —
			* an unreachable route leaves the shipped defaults in place.
			*/
			async load() {
				if (this.loaded) return;
				this.loaded = true;
				const local = this.readLocal();
				if (local !== null) this.replace(local, false);
				const url = this.routeUrl("state");
				const fetchImpl = this.fetchImpl;
				if (url === null || fetchImpl === null) return;
				try {
					const response = await fetchImpl(url, {
						method: "GET",
						headers: { accept: "application/json" }
					});
					if (!response.ok) {
						this.markHost(false, "http " + String(response.status));
						return;
					}
					let payload = null;
					try {
						payload = await response.json();
					} catch {
						payload = null;
					}
					if (payload === null) {
						this.markHost(false, "bad json");
						return;
					}
					if (payload.ok === false) {
						this.markHost(false, typeof payload.error === "string" ? payload.error : "route refused");
						return;
					}
					this.markHost(true);
					const remote = payload.state;
					if (remote === null || remote === void 0) return;
					this.replace(normalizeState(remote), false);
				} catch (error) {
					this.markHost(false, error instanceof Error ? error.message : String(error));
				}
			}
			schedulePersist(delay = this.options.persistDelay ?? 350) {
				if (isBlankState(this.state)) return;
				this.writeLocal();
				if (this.persistTimer !== null) clearTimeout(this.persistTimer);
				this.persistTimer = setTimeout(() => {
					this.persistTimer = null;
					this.flush();
				}, delay);
			}
			/** Write the current state through to the settings namespace. */
			async flush() {
				const url = this.routeUrl("update");
				const fetchImpl = this.fetchImpl;
				if (url === null || fetchImpl === null) {
					this.markHost(false, "no route");
					return false;
				}
				if (isBlankState(this.state)) return false;
				try {
					const response = await fetchImpl(url, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ state: this.state })
					});
					if (!response.ok) {
						this.markHost(false, "http " + String(response.status));
						return false;
					}
					let payload = null;
					try {
						payload = await response.json();
					} catch {
						payload = null;
					}
					if (payload !== null && payload.ok === false) {
						this.markHost(false, typeof payload.error === "string" ? payload.error : "route refused");
						return false;
					}
					this.markHost(true);
					return true;
				} catch (error) {
					this.markHost(false, error instanceof Error ? error.message : String(error));
					return false;
				}
			}
		};
		// src/client/index.ts
		/**
		* dsh-sidebar-groups — browser half.
		*
		* Seating: `sidebar.footer.action` (a list slot: one ADDED cell beside
		* Settings, never a replacement) holds the 分组 button and its panel. The
		* scrolling and the grouping itself have no slot to attach to — the panel list
		* and the workspace list are not slots — so they go through ./dom-adapter.ts.
		*
		* **NO STATIC `inject`, deliberately.** A static dependency the host cannot
		* satisfy leaves this plugin's fiber PENDING forever, and the web boot treats
		* any entry that is not `active` as fatal ("web boot: N entry did not
		* activate"), which costs the user the whole GUI. Dynamic `ctx.inject` waits in
		* a CHILD fiber, so this entry activates immediately and a host without the
		* services simply gets an idle plugin.
		*/
		/**
		* Resolve a slot label the way `resolveSlotLabel` does — the registry stores
		* `string | (() => string)`, and the function form is locale aware, so it must
		* be CALLED at read time (DOM-CONTRACT.md §B.3). Inlined rather than imported so
		* the bundle has one fewer seed dependency to survive.
		*/
		function resolveLabel(value) {
			try {
				if (typeof value === "string") return value;
				if (typeof value === "function") {
					const resolved = value();
					return typeof resolved === "string" ? resolved : void 0;
				}
			} catch {}
		}
		/** Registry snapshot → the entries the adapter aligns its rows against. */
		function readEntries(slots) {
			if (slots === void 0 || typeof slots.entriesOfSlot !== "function") return [];
			const raw = slots.entriesOfSlot("sidebar.panellist");
			if (!Array.isArray(raw)) return [];
			const entries = [];
			for (const entry of raw) {
				const options = entry?.options;
				if (options === void 0 || typeof options.id !== "string" || options.id === "") continue;
				entries.push({
					id: options.id,
					order: typeof options.order === "number" ? options.order : 0,
					label: resolveLabel(options.label) ?? options.id
				});
			}
			return sortEntries(entries);
		}
		const ACTION_STYLE = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			gap: "6px",
			minWidth: "28px",
			height: "28px",
			padding: "0 8px",
			border: "0",
			borderRadius: "var(--dsw-radius-sm, 6px)",
			background: "transparent",
			color: "inherit",
			font: "inherit",
			fontSize: "12px",
			cursor: "pointer"
		};
		/** The 分组 cell: a toggle plus, when open, the portal-rendered panel. */
		function FooterAction(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const label = "分组";
			const icon = (0, react.createElement)("span", {
				key: "i",
				"aria-hidden": "true",
				style: {
					display: "inline-flex",
					width: "16px",
					height: "16px"
				}
			}, (0, react.createElement)("svg", {
				viewBox: "0 0 16 16",
				width: "16",
				height: "16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.4"
			}, (0, react.createElement)("path", {
				d: "M2 4h12M2 8h12M2 12h12",
				strokeLinecap: "round"
			}), (0, react.createElement)("circle", {
				cx: "5",
				cy: "4",
				r: "1.6",
				fill: "currentColor",
				stroke: "none"
			}), (0, react.createElement)("circle", {
				cx: "10",
				cy: "8",
				r: "1.6",
				fill: "currentColor",
				stroke: "none"
			}), (0, react.createElement)("circle", {
				cx: "6",
				cy: "12",
				r: "1.6",
				fill: "currentColor",
				stroke: "none"
			})));
			const button = (0, react.createElement)("button", {
				key: "b",
				type: "button",
				className: "dsh-sg-action",
				style: ACTION_STYLE,
				"aria-label": label,
				title: label,
				"aria-haspopup": "dialog",
				"aria-expanded": open ? "true" : "false",
				onClick: (event) => {
					event.preventDefault();
					event.stopPropagation();
					setOpen((current) => !current);
				}
			}, icon, props.wide === false ? null : (0, react.createElement)("span", { key: "l" }, label));
			const panel = open ? (0, react.createElement)(GroupPanelPortal, {
				key: "p",
				store: props.store,
				entries: props.entries,
				workspaces: props.workspaces,
				diagnostics: props.diagnostics,
				onClose: () => setOpen(false)
			}) : null;
			return (0, react.createElement)(react.Fragment, null, button, panel);
		}
		/**
		* Mount everything. Total function: a host missing `slots`, a document without
		* the sidebar, or a throwing DOM all end in "the plugin does nothing".
		*/
		function apply(ctx) {
			if (ctx === void 0 || ctx === null || typeof ctx !== "object") return;
			const store = new SidebarGroupsStore();
			let adapter = null;
			let entries = [];
			let slots;
			let pendingRefresh = false;
			const refreshSoon = () => {
				if (pendingRefresh) return;
				pendingRefresh = true;
				setTimeout(() => {
					pendingRefresh = false;
					try {
						adapter?.refresh();
					} catch {}
				}, 0);
			};
			const read = () => {
				entries = readEntries(slots);
				return entries;
			};
			/** One line the panel shows verbatim, so a live install needs no console. */
			const diagnostics = () => {
				const current = adapter;
				const state = store.get();
				return [
					"host=" + store.hostStatus(),
					current === null ? "adapter=absent reason=never-mounted entries=none retries=0 workspaces=0 rows=0 navBox=0 planned=0 unmatched=0 hidden=0 navH=0 boxH=0 lastLog=" : current.describe(),
					"registry=" + String(entries.length),
					"entriesOfSlot=" + typeof slots?.entriesOfSlot,
					"adoptSkips=" + String(store.adoptSkips()),
					"groups=" + String(state.nav.groups.length) + "/" + String(state.workspaces.groups.length),
					"scrolling=" + (state.scrolling ? "on" : "off")
				].join(" ");
			};
			const mountAdapter = () => {
				if (adapter !== null) {
					adapter.refresh();
					return;
				}
				try {
					adapter = new DomAdapter({}, {
						state: () => store.get(),
						entries: () => entries,
						setNavCollapsed: (groupId, collapsed) => store.setGroupCollapsed("nav", groupId, collapsed),
						setWorkspaceCollapsed: (groupId, collapsed) => store.setGroupCollapsed("workspaces", groupId, collapsed),
						onWorkspaces: (keys) => {
							setTimeout(() => {
								try {
									store.noteWorkspaceKeys(keys);
								} catch {}
							}, 0);
						},
						onEntries: (list, source) => {
							if (source !== "dom") return;
							if (typeof slots?.entriesOfSlot === "function") return;
							setTimeout(() => {
								try {
									store.adoptEntries(list);
								} catch {}
							}, 0);
						}
					});
					adapter.mount();
					store.subscribe(refreshSoon);
				} catch {
					adapter = null;
				}
			};
			const wire = (ready) => {
				slots = ready.slots;
				if (slots === void 0) return;
				read();
				try {
					slots.inject?.("sidebar.footer.action", () => slots.register?.({
						name: "sidebar.footer.action",
						id: "dsh-sidebar-groups-open",
						order: 41,
						label: () => "分组"
					}, (props) => (0, react.createElement)(FooterAction, {
						store,
						entries: read,
						workspaces: () => adapter?.getWorkspaces().length ? adapter.getWorkspaces() : store.workspaceKeys(),
						diagnostics,
						wide: props?.wide !== false
					})));
				} catch {}
				const off = slots.subscribe?.("sidebar.panellist", () => {
					store.adoptEntries(read());
					refreshSoon();
				});
				if (typeof off === "function" && typeof ready.effect === "function") try {
					ready.effect(() => off, "dsh-sidebar-groups: panellist");
				} catch {}
				store.adoptEntries(entries);
				mountAdapter();
			};
			const wireLocale = (ready) => {
				const subscribe = ready.locale?.subscribe;
				if (typeof subscribe !== "function") return;
				try {
					const off = subscribe.call(ready.locale, () => {
						store.adoptEntries(read());
						refreshSoon();
					});
					if (typeof off === "function" && typeof ready.effect === "function") try {
						ready.effect(() => off, "dsh-sidebar-groups: locale");
					} catch {}
				} catch {}
			};
			(async () => {
				try {
					await store.load();
				} catch {}
				try {
					refreshSoon();
				} catch {}
			})();
			if (typeof ctx.inject === "function") {
				try {
					ctx.inject(["slots"], wire);
				} catch {}
				try {
					ctx.inject(["locale"], wireLocale);
				} catch {}
				return;
			}
			if (ctx.slots !== void 0) wire(ctx);
		}
		exports.DomAdapter = DomAdapter;
		exports.GroupPanel = GroupPanel;
		exports.GroupPanelPortal = GroupPanelPortal;
		exports.MARKS = MARKS;
		exports.SELECTORS = SELECTORS;
		exports.SidebarGroupsStore = SidebarGroupsStore;
		exports.activeAdapter = activeAdapter;
		exports.apply = apply;
		exports.defaultState = defaultState;
		exports.normalizeState = normalizeState;
		exports.readEntries = readEntries;
		exports.resolveDefaultNavGroups = resolveDefaultNavGroups;
		exports.resolveLabel = resolveLabel;
		exports.sortEntries = sortEntries;
		return module.exports;
	}
});
