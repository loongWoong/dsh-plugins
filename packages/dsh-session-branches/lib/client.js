window.__ModuleLoader__.load({
	id: "dsh-session-branches",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region styles
		const CSS = [
			".sesbr { display:flex; flex-direction:column; gap:12px; color:var(--dsw-alias-label-primary); font-size:13px; }",
			".sesbr-head { display:flex; align-items:center; gap:8px; }",
			".sesbr-meta { color:var(--dsw-alias-label-secondary); font-size:11px; }",
			".sesbr-btn { background:var(--dsw-alias-brand-primary); border:none; color:#fff; border-radius:6px; padding:5px 10px; cursor:pointer; font-size:12px; margin-left:auto; }",
			".sesbr-btn:disabled { opacity:0.6; cursor:default; }",
			".sesbr-error { color:var(--dsw-alias-state-error-primary); font-size:12px; }",
			".sesbr-empty { color:var(--dsw-alias-label-secondary); padding:12px 0; }",
			".sesbr-group { border:1px solid var(--dsw-alias-border-l1); border-radius:8px; overflow:hidden; }",
			".sesbr-summary { display:flex; align-items:center; gap:8px; padding:8px 10px; cursor:pointer; background:var(--dsw-alias-bg-layer-1); user-select:none; list-style:none; }",
			".sesbr-summary::-webkit-details-marker { display:none; }",
			".sesbr-summary:hover { background:var(--dsw-alias-bg-layer-2); }",
			".sesbr-path { font-weight:600; font-size:12px; word-break:break-all; }",
			".sesbr-tree { padding:6px 4px; display:flex; flex-direction:column; }",
			".sesbr-row { display:flex; align-items:center; gap:6px; padding:3px 8px; border-radius:6px; cursor:pointer; min-width:0; }",
			".sesbr-row:hover { background:var(--dsw-alias-bg-layer-2); }",
			".sesbr-guide { align-self:stretch; width:10px; border-left:1px solid var(--dsw-alias-border-l1); margin-left:9px; flex:none; }",
			".sesbr-dot { width:8px; height:8px; border-radius:50%; flex:none; }",
			".sesbr-dot-live { background:#3fb96f; }",
			".sesbr-dot-stored { background:var(--dsw-alias-border-l2); }",
			".sesbr-dot-mem { background:transparent; border:1.5px solid var(--dsw-alias-border-l2); box-sizing:border-box; }",
			".sesbr-title { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:420px; }",
			".sesbr-badge { flex:none; font-size:10px; border-radius:999px; padding:0 6px; border:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-1); }",
			".sesbr-badge-sub { color:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); }",
			".sesbr-time { margin-left:auto; color:var(--dsw-alias-label-secondary); font-size:11px; flex:none; }",
			".sesbr-ov-root { position:fixed; inset:0; pointer-events:none; z-index:60; }",
			".sesbr-fab { position:absolute; left:11px; bottom:76px; width:34px; height:34px; border-radius:50%; border:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); cursor:pointer; pointer-events:auto; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.18); padding:0; }",
			".sesbr-fab:hover { background:var(--dsw-alias-bg-layer-2); }",
			".sesbr-fab.active { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }",
			".sesbr-panel { position:absolute; left:56px; bottom:76px; width:430px; max-height:74vh; overflow:auto; pointer-events:auto; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l2); border-radius:10px; box-shadow:0 10px 36px rgba(0,0,0,0.28); padding:10px; display:flex; flex-direction:column; gap:8px; color:var(--dsw-alias-label-primary); font-size:13px; }",
			".sesbr-panel-head { display:flex; align-items:center; gap:8px; }",
			".sesbr-panel-title { font-weight:600; font-size:13px; }",
			".sesbr-input { flex:1; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:6px; color:var(--dsw-alias-label-primary); padding:5px 8px; font-size:12px; font-family:inherit; min-width:0; }",
			".sesbr-close { background:transparent; border:none; color:var(--dsw-alias-label-secondary); cursor:pointer; font-size:15px; padding:2px 6px; flex:none; }",
			".sesbr-close:hover { color:var(--dsw-alias-label-primary); }"
		].join("\n");
		//#endregion
		//#region plugin
		const inject = [
			"slots",
			"connection",
			"sessions"
		];
		function apply(ctx) {
			const connection = ctx.get("connection");
			if (connection === void 0) throw new Error("dsh-session-branches requires the Client connection service");
			const clientSessions = ctx.get("sessions");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-sesbr", "");
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "session-branches: styles");
			const h = react.createElement;
			const RPC_CHANNEL = "/sesbr";
			async function callHost(endpoint, payload) {
				const result = await connection.rpc.call(RPC_CHANNEL, endpoint, payload === undefined ? {} : payload);
				if (result !== null && typeof result === "object" && result.ok === true) return result.value;
				const message = result !== null && typeof result === "object" && result.error !== void 0 && result.error.message !== void 0 ? result.error.message : String(result);
				throw new Error(message);
			}
			function errMsg(e) {
				if (e !== null && typeof e === "object" && typeof e.message === "string") return e.message;
				return String(e);
			}
			function fmtTime(ms) {
				if (typeof ms !== "number" || ms <= 0) return "";
				const d = new Date(ms);
				const pad = (n) => (n < 10 ? "0" + n : String(n));
				return (d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
			}
			function badge(kind, text) {
				return h("span", { className: "sesbr-badge sesbr-badge-" + kind, key: kind }, text);
			}
			function nodeMatches(node, needle) {
				if (needle === "") return true;
				if (node.title !== "" && node.title.toLowerCase().indexOf(needle) !== -1) return true;
				const children = Array.isArray(node.children) ? node.children : [];
				for (const child of children) {
					if (nodeMatches(child, needle)) return true;
				}
				return false;
			}
			function renderNode(node, depth, key, onOpen, needle) {
				if (!nodeMatches(node, needle)) return [];
				const guides = [];
				for (let i = 0; i < depth; i++) guides.push(h("span", { className: "sesbr-guide", key: "g" + i }));
				const badges = [];
				if (node.subagent === true) badges.push(badge("sub", "子代理"));
				if (node.archived === true) badges.push(badge("arch", "已归档"));
				if (node.persisted !== true) badges.push(badge("mem", node.live === true ? "仅内存" : "无存储"));
				if (Array.isArray(node.children) && node.children.length > 0) {
					badges.push(badge("fork", node.children.length + " 分支"));
				}
				const row = h("div", {
					className: "sesbr-row",
					key,
					title: node.sessionId + (node.seedLength > 0 ? "（继承 " + node.seedLength + " 事件）" : ""),
					onClick: () => onOpen(node.sessionId)
				},
					h("span", { style: { display: "flex", alignItems: "stretch", flex: "none" } }, guides),
					h("span", { className: "sesbr-dot sesbr-dot-" + (node.live === true ? "live" : node.persisted === true ? "stored" : "mem") }),
					h("span", { className: "sesbr-title" }, node.title !== "" ? node.title : "(无标题)"),
					badges,
					h("span", { className: "sesbr-time" }, fmtTime(node.createdAt))
				);
				const rows = [row];
				const children = Array.isArray(node.children) ? node.children : [];
				for (let i = 0; i < children.length; i++) {
					for (const r of renderNode(children[i], depth + 1, key + "-" + i, onOpen, needle)) rows.push(r);
				}
				return rows;
			}
			function renderGroups(data, onOpen, needle) {
				const groups = data !== null && Array.isArray(data.groups) ? data.groups : [];
				if (data !== null && groups.length === 0) return [h("div", { className: "sesbr-empty", key: "empty" }, "没有会话")];
				return groups.map((g, gi) => {
					const rows = [];
					const roots = Array.isArray(g.roots) ? g.roots : [];
					for (let i = 0; i < roots.length; i++) {
						for (const r of renderNode(roots[i], 0, "g" + gi + "-" + i, onOpen, needle)) rows.push(r);
					}
					if (needle !== "" && rows.length === 0) return null;
					return h("details", { className: "sesbr-group", key: g.root, open: gi === 0 || needle !== "" },
						h("summary", { className: "sesbr-summary" },
							h("span", { className: "sesbr-path" }, g.root),
							h("span", { className: "sesbr-meta" }, g.total + " 个会话" + (g.orphans > 0 ? "，" + g.orphans + " 个父会话在其他工作区" : ""))
						),
						h("div", { className: "sesbr-tree" }, rows)
					);
				});
			}
			function useBranchData(enabled) {
				const [data, setData] = react.useState(null);
				const [error, setError] = react.useState("");
				const [busy, setBusy] = react.useState(false);
				const load = react.useCallback(() => {
					setBusy(true);
					callHost("branches/list").then((r) => {
						setData(r);
						setError("");
					}).catch((e) => setError(errMsg(e))).finally(() => setBusy(false));
				}, []);
				react.useEffect(() => {
					if (!enabled) return;
					let alive = true;
					callHost("branches/list").then((r) => {
						if (alive) setData(r);
					}).catch((e) => {
						if (alive) setError(errMsg(e));
					});
					return () => {
						alive = false;
					};
				}, [enabled]);
				return { data, error, busy, load };
			}
			function makeOpenSession(closePanel) {
				return function openSession(id) {
					if (clientSessions === void 0) return;
					try {
						clientSessions.open(id);
						if (typeof closePanel === "function") closePanel();
					} catch (e) {
						console.error("session-branches: open failed", e);
					}
				};
			}
			function BranchSection(props) {
				const { data, error, busy, load } = useBranchData(true);
				const [needle, setNeedle] = react.useState("");
				return h("div", { className: "sesbr" },
					h("div", { className: "sesbr-head" },
						h("span", { className: "sesbr-meta" }, data !== null ? "共 " + data.totalSessions + " 个会话，按工作区分组，点击任一会话打开" : "加载中…"),
						h("button", { type: "button", className: "sesbr-btn", onClick: load, disabled: busy }, busy ? "刷新中…" : "刷新")
					),
					error !== "" ? h("div", { className: "sesbr-error" }, error) : null,
					h("input", { className: "sesbr-input", placeholder: "按标题筛选分支…", value: needle, onChange: (e) => setNeedle(e.target.value) }),
					renderGroups(data, makeOpenSession(typeof props.close === "function" ? props.close : undefined), needle.trim().toLowerCase())
				);
			}
			function ForkIcon() {
				return h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true },
					h("circle", { cx: 4, cy: 3, r: 1.8, fill: "currentColor" }),
					h("circle", { cx: 4, cy: 13, r: 1.8, fill: "currentColor" }),
					h("circle", { cx: 12, cy: 6.5, r: 1.8, fill: "currentColor" }),
					h("path", { d: "M4 5v6M4 5.5c0 2 2 2.5 4 2.5h2.5", stroke: "currentColor", "stroke-width": 1.4, fill: "none", "stroke-linecap": "round" })
				);
			}
			function BranchOverlay() {
				const [open, setOpen] = react.useState(false);
				const { data, error, busy, load } = useBranchData(open);
				const [needle, setNeedle] = react.useState("");
				return h("div", { className: "sesbr-ov-root" },
					h("button", {
						type: "button",
						className: open ? "sesbr-fab active" : "sesbr-fab",
						title: "会话分支树",
						"aria-label": "会话分支树",
						onClick: () => setOpen(!open)
					}, h(ForkIcon)),
					open ? h("div", { className: "sesbr-panel" },
						h("div", { className: "sesbr-panel-head" },
							h("span", { className: "sesbr-panel-title" }, "会话分支树"),
							h("span", { className: "sesbr-meta" }, data !== null ? data.totalSessions + " 个会话" : "加载中…"),
							h("button", { type: "button", className: "sesbr-btn", onClick: load, disabled: busy, style: { marginLeft: "auto" } }, busy ? "…" : "刷新"),
							h("button", { type: "button", className: "sesbr-close", title: "关闭", onClick: () => setOpen(false) }, "✕")
						),
						h("input", { className: "sesbr-input", placeholder: "按标题筛选分支…", value: needle, onChange: (e) => setNeedle(e.target.value) }),
						error !== "" ? h("div", { className: "sesbr-error" }, error) : null,
						renderGroups(data, makeOpenSession(() => setOpen(false)), needle.trim().toLowerCase())
					) : null
				);
			}
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "session-branches-overlay",
				order: 50,
				label: "会话分支树"
			}, BranchOverlay));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "session-branches",
				order: 96,
				label: () => "会话分支"
			}, BranchSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
