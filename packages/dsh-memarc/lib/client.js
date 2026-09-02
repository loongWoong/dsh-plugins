window.__ModuleLoader__.load({
	id: "dsh-memarc",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region rpc + styles
		const RPC_CHANNEL = "/memarc";
		const CSS = [
			".memarc { display:flex; flex-direction:column; gap:14px; color:var(--dsw-alias-label-primary); font-size:13px; }",
			".memarc-tabs { display:flex; gap:8px; border-bottom:1px solid var(--dsw-alias-border-l1); padding-bottom:8px; }",
			".memarc-tab { padding:6px 12px; border-radius:6px; border:1px solid transparent; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; font-size:13px; }",
			".memarc-tab.active { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l2); }",
			".memarc-panel { display:flex; flex-direction:column; gap:10px; }",
			".memarc-row { display:flex; gap:8px; align-items:center; }",
			".memarc-input, .memarc-textarea { flex:1; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:6px; color:var(--dsw-alias-label-primary); padding:6px 8px; font-size:13px; font-family:inherit; }",
			".memarc-textarea { min-height:56px; resize:vertical; }",
			".memarc-btn { background:var(--dsw-alias-brand-primary); border:none; color:#fff; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px; white-space:nowrap; }",
			".memarc-btn:disabled { opacity:0.6; cursor:default; }",
			".memarc-btn.ghost { background:transparent; border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-secondary); }",
			".memarc-list { display:flex; flex-direction:column; gap:8px; }",
			".memarc-card { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:6px; }",
			".memarc-card.clickable { cursor:pointer; }",
			".memarc-card.clickable:hover { border-color:var(--dsw-alias-border-l2); }",
			".memarc-text { white-space:pre-wrap; line-height:1.5; word-break:break-word; }",
			".memarc-meta { color:var(--dsw-alias-label-secondary); font-size:11px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }",
			".memarc-tag { background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:1px 8px; font-size:11px; color:var(--dsw-alias-label-secondary); }",
			".memarc-del { background:transparent; border:none; color:var(--dsw-alias-state-error-primary); cursor:pointer; font-size:12px; margin-left:auto; }",
			".memarc-empty { color:var(--dsw-alias-label-secondary); padding:12px 0; }",
			".memarc-error { color:var(--dsw-alias-state-error-primary); }",
			".memarc-path { color:var(--dsw-alias-label-secondary); font-size:11px; word-break:break-all; }",
			".memarc-snippet { color:var(--dsw-alias-label-secondary); font-size:12px; line-height:1.5; word-break:break-word; }",
			".memarc-toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }",
			".memarc-check { width:15px; height:15px; accent-color:var(--dsw-alias-brand-primary); cursor:pointer; flex:none; margin:0; }",
			".memarc-count { color:var(--dsw-alias-label-secondary); font-size:12px; white-space:nowrap; }",
			".memarc-btn.danger { background:transparent; border:1px solid var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); }",
			".memarc-btn.danger.armed { background:var(--dsw-alias-state-error-primary); color:#fff; }",
			".memarc-card.selected { border-color:var(--dsw-alias-brand-primary); }",
			".memarc-checkrow { display:flex; gap:8px; align-items:flex-start; }",
			".memarc-cardtitle { flex:1; min-width:0; }",
			".memarc-badge { flex:none; font-size:10px; border:1px solid var(--dsw-alias-border-l2); border-radius:999px; padding:0 6px; color:var(--dsw-alias-label-secondary); white-space:nowrap; }",
			".memarc-badge.live { color:#b58a2c; border-color:#b58a2c; }",
			".memarc-warn { color:#b58a2c; font-size:12px; line-height:1.5; }",
			".memarc-notice { color:var(--dsw-alias-label-secondary); font-size:12px; }"
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
			if (connection === void 0) throw new Error("dsh-memarc requires the Client connection service");
			const clientSessions = ctx.get("sessions");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-memarc", "");
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "memarc: styles");
			const h = react.createElement;
			async function callHost(endpoint, payload) {
				const result = await connection.rpc.call(RPC_CHANNEL, endpoint, payload === void 0 ? {} : payload);
				if (result && result.ok === true) return result.value;
				const message = result && result.error && typeof result.error.message === "string" ? result.error.message : "memarc RPC failed";
				throw new Error(message);
			}
			function fmtTime(ms) {
				if (typeof ms !== "number" || ms <= 0) return "";
				try {
					return new Date(ms).toLocaleString();
				} catch (_e) {
					return String(ms);
				}
			}
			function errMsg(e) {
				if (e !== null && typeof e === "object" && typeof e.message === "string") return e.message;
				return String(e);
			}
			function displayTitle(item) {
				return typeof item.title === "string" && item.title.length > 0 ? item.title : String(item.sessionId);
			}
			function MemArcSection(props) {
				const [tab, setTab] = react.useState("memory");
				const [mem, setMem] = react.useState(null);
				const [filter, setFilter] = react.useState("");
				const [text, setText] = react.useState("");
				const [tags, setTags] = react.useState("");
				const [arc, setArc] = react.useState(null);
				const [arcQuery, setArcQuery] = react.useState("");
				const [hits, setHits] = react.useState(null);
				const [busy, setBusy] = react.useState(false);
				const [error, setError] = react.useState("");
				const [selected, setSelected] = react.useState(() => new Set());
				const [armed, setArmed] = react.useState(false);
				const [notice, setNotice] = react.useState("");
				function loadMem() {
					return callHost("mem/list").then((r) => setMem(r)).catch((e) => setError(errMsg(e)));
				}
				function pruneSelection(items) {
					const ids = new Set(items.map((it) => String(it.sessionId)));
					setSelected((prev) => {
						let changed = false;
						const next = new Set();
						for (const id of prev) {
							if (ids.has(id)) next.add(id);
							else changed = true;
						}
						return changed ? next : prev;
					});
				}
				function loadArc() {
					return callHost("arc/list").then((r) => {
						setArc(r);
						pruneSelection(Array.isArray(r.items) ? r.items : []);
					}).catch((e) => setError(errMsg(e)));
				}
				react.useEffect(() => {
					let alive = true;
					callHost("mem/list").then((r) => {
						if (alive) setMem(r);
					}).catch((e) => {
						if (alive) setError(errMsg(e));
					});
					callHost("arc/list").then((r) => {
						if (alive) {
							setArc(r);
							pruneSelection(Array.isArray(r.items) ? r.items : []);
						}
					}).catch((e) => {
						if (alive) setError(errMsg(e));
					});
					return () => {
						alive = false;
					};
				}, []);
				function addMemory() {
					const body = text.trim();
					if (body.length === 0 || busy) return;
					setBusy(true);
					setError("");
					const tagList = tags.split(/[,，]/).map((s) => s.trim()).filter((s) => s.length > 0);
					callHost("mem/add", { text: body, tags: tagList }).then(() => callHost("mem/list")).then((r) => {
						setMem(r);
						setText("");
						setTags("");
					}).catch((e) => setError(errMsg(e))).finally(() => setBusy(false));
				}
				function deleteMemory(id) {
					setError("");
					callHost("mem/delete", { id }).then(() => callHost("mem/list")).then((r) => setMem(r)).catch((e) => setError(errMsg(e)));
				}
				function searchArchive() {
					const q = arcQuery.trim();
					if (q.length === 0 || busy) return;
					setBusy(true);
					setError("");
					callHost("arc/search", { query: q, limit: 20 }).then((r) => setHits(r)).catch((e) => setError(errMsg(e))).finally(() => setBusy(false));
				}
				function openSession(id) {
					if (clientSessions === void 0) return;
					try {
						clientSessions.open(id);
						if (typeof props.close === "function") props.close();
					} catch (e) {
						setError(errMsg(e));
					}
				}
				function toggleSelect(id) {
					setArmed(false);
					setSelected((prev) => {
						const next = new Set(prev);
						if (next.has(id)) next.delete(id);
						else next.add(id);
						return next;
					});
				}
				function allSelected() {
					return arcItems.length > 0 && arcItems.every((it) => selected.has(String(it.sessionId)));
				}
				function toggleAll() {
					setArmed(false);
					setSelected(allSelected() ? new Set() : new Set(arcItems.map((it) => String(it.sessionId))));
				}
				function liveSelectedCount() {
					return arcItems.filter((it) => it.live && selected.has(String(it.sessionId))).length;
				}
				function unarchiveSelected() {
					const ids = [...selected];
					if (ids.length === 0 || busy) return;
					setBusy(true);
					setError("");
					setNotice("");
					callHost("arc/unarchive", { sessionIds: ids }).then((r) => {
						setNotice("已取消归档 " + ((r && r.unarchived) || 0) + " 个会话，已恢复到侧边栏分组视图。");
						return loadArc();
					}).catch((e) => setError(errMsg(e))).finally(() => setBusy(false));
				}
				function deleteSelected() {
					const ids = [...selected];
					if (ids.length === 0 || busy) return;
					if (!armed) {
						setArmed(true);
						setTimeout(() => setArmed(false), 6000);
						return;
					}
					setArmed(false);
					setBusy(true);
					setError("");
					setNotice("");
					callHost("arc/delete", { sessionIds: ids }).then((r) => {
						const results = r && Array.isArray(r.results) ? r.results : [];
						const okCount = results.filter((x) => x && x.ok).length;
						const failed = results.filter((x) => x && !x.ok);
						let line = "已删除 " + okCount + " 个会话";
						if (failed.length > 0) line += "；" + failed.length + " 个失败（" + failed.map((f) => f.reason).join(", ") + "）";
						setNotice(line + "。侧边栏如有残留行，刷新页面后消失。");
						return loadArc();
					}).catch((e) => setError(errMsg(e))).finally(() => setBusy(false));
				}
				if (!connection.isLoopback) {
					return h("div", { className: "memarc" }, h("div", { className: "memarc-empty" }, "此页面不是本机回环连接，无法访问记忆库与归档（loopback-only）。"));
				}
				const entries = mem !== null && Array.isArray(mem.entries) ? mem.entries : [];
				const needle = filter.trim().toLowerCase();
				const visible = needle.length === 0 ? entries : entries.filter((e) => (typeof e.text === "string" && e.text.toLowerCase().indexOf(needle) !== -1) || (Array.isArray(e.tags) && e.tags.join(" ").toLowerCase().indexOf(needle) !== -1));
				const arcItems = arc !== null && Array.isArray(arc.items) ? arc.items : [];
				const hitItems = hits !== null && Array.isArray(hits.items) ? hits.items : [];
				return h("div", { className: "memarc" },
					h("div", { className: "memarc-tabs" },
						h("button", { type: "button", className: tab === "memory" ? "memarc-tab active" : "memarc-tab", onClick: () => setTab("memory") }, "记忆"),
						h("button", { type: "button", className: tab === "archive" ? "memarc-tab active" : "memarc-tab", onClick: () => setTab("archive") }, "归档会话")
					),
					error !== "" ? h("div", { className: "memarc-error" }, error) : null,
					tab === "memory"
						? h("div", { className: "memarc-panel" },
							h("div", { className: "memarc-path" }, mem !== null && typeof mem.root === "string" ? "记忆库：" + mem.root + "/.dsh-memory/memory.json" : "记忆库加载中…"),
							h("textarea", { className: "memarc-textarea", placeholder: "写入一条记忆，例如：用户偏好简体中文回复", value: text, onChange: (e) => setText(e.target.value) }),
							h("div", { className: "memarc-row" },
								h("input", { className: "memarc-input", placeholder: "标签（逗号分隔，可选）", value: tags, onChange: (e) => setTags(e.target.value) }),
								h("button", { type: "button", className: "memarc-btn", onClick: addMemory, disabled: busy }, "保存记忆")
							),
							h("div", { className: "memarc-row" },
								h("input", { className: "memarc-input", placeholder: "筛选记忆…", value: filter, onChange: (e) => setFilter(e.target.value) }),
								h("button", { type: "button", className: "memarc-btn ghost", onClick: () => loadMem() }, "刷新")
							),
							h("div", { className: "memarc-list" },
								visible.length === 0
									? h("div", { className: "memarc-empty" }, mem === null ? "加载中…" : "暂无记忆")
									: visible.map((e) => h("div", { className: "memarc-card", key: String(e.id) },
										h("div", { className: "memarc-text" }, String(e.text)),
										h("div", { className: "memarc-meta" },
											(Array.isArray(e.tags) ? e.tags : []).map((t) => h("span", { className: "memarc-tag", key: String(t) }, String(t))),
											h("span", null, fmtTime(e.createdAt)),
											h("button", { type: "button", className: "memarc-del", onClick: () => deleteMemory(e.id) }, "删除")
										)
									))
							)
						)
						: h("div", { className: "memarc-panel" },
							h("div", { className: "memarc-row" },
								h("input", { className: "memarc-input", placeholder: "全文搜索归档会话…", value: arcQuery, onChange: (e) => setArcQuery(e.target.value), onKeyDown: (e) => {
									if (e.key === "Enter") searchArchive();
								} }),
								h("button", { type: "button", className: "memarc-btn", onClick: searchArchive, disabled: busy }, "搜索"),
								h("button", { type: "button", className: "memarc-btn ghost", onClick: () => {
									setArmed(false);
									setHits(null);
									loadArc();
								} }, "刷新")
							),
							hits !== null ? h("div", { className: "memarc-list" },
								h("div", { className: "memarc-meta" }, "搜索命中 " + hitItems.length + " 个归档会话（点击打开）"),
								hitItems.length === 0
									? h("div", { className: "memarc-empty" }, "没有命中")
									: hitItems.map((it, i) => h("div", { className: "memarc-card clickable", key: String(it.sessionId) + ":" + i, onClick: () => openSession(it.sessionId) },
										h("div", { className: "memarc-text" }, displayTitle(it)),
										h("div", { className: "memarc-snippet" }, String(it.snippet)),
										h("div", { className: "memarc-meta" }, fmtTime(it.time))
									))
							) : null,
							arcItems.length > 0 ? h("div", { className: "memarc-toolbar" },
								h("label", { className: "memarc-row", style: { gap: "4px", cursor: "pointer" } },
									h("input", { type: "checkbox", className: "memarc-check", checked: allSelected(), onChange: toggleAll }),
									h("span", null, "全选")
								),
								h("span", { className: "memarc-count" }, "已选 " + selected.size + " / " + arcItems.length),
								h("button", { type: "button", className: "memarc-btn ghost", onClick: unarchiveSelected, disabled: busy || selected.size === 0 }, "取消归档"),
								h("button", { type: "button", className: armed ? "memarc-btn danger armed" : "memarc-btn danger", onClick: deleteSelected, disabled: busy || selected.size === 0 },
									armed ? "确认删除 " + selected.size + " 个？" : "删除…"),
								h("button", { type: "button", className: "memarc-btn ghost", onClick: () => {
									setArmed(false);
									setHits(null);
									loadArc();
								} }, "刷新")
							) : null,
							armed && selected.size > 0 ? h("div", { className: "memarc-warn" },
								"将永久删除选中的 " + selected.size + " 个会话及其日志，不可恢复"
								+ (liveSelectedCount() > 0 ? "；其中 " + liveSelectedCount() + " 个正在使用中，将被跳过" : "")
								+ "。再次点击「确认删除」执行。"
							) : null,
							notice !== "" ? h("div", { className: "memarc-notice" }, notice) : null,
							h("div", { className: "memarc-list" },
								h("div", { className: "memarc-meta" }, "已归档会话（" + (arc !== null ? String(arc.total) : "…") + "）— 点击打开；勾选后可批量取消归档或删除"),
								arc === null
									? h("div", { className: "memarc-empty" }, "加载中…")
									: arcItems.length === 0
										? h("div", { className: "memarc-empty" }, "暂无归档会话")
										: arcItems.map((it) => {
											const id = String(it.sessionId);
											const isSelected = selected.has(id);
											return h("div", { className: "memarc-card clickable" + (isSelected ? " selected" : ""), key: id, onClick: () => openSession(id) },
												h("div", { className: "memarc-checkrow" },
													h("input", { type: "checkbox", className: "memarc-check", checked: isSelected, onClick: (e) => e.stopPropagation(), onChange: () => toggleSelect(id) }),
													h("div", { className: "memarc-cardtitle" },
														h("div", { className: "memarc-text" }, displayTitle(it))
													),
													it.live ? h("span", { className: "memarc-badge live" }, "使用中") : null,
													it.persisted === false ? h("span", { className: "memarc-badge" }, "无日志") : null
												),
												h("div", { className: "memarc-meta" },
													typeof it.cwd === "string" && it.cwd.length > 0 ? h("span", null, it.cwd) : null,
													h("span", null, fmtTime(it.createdAt))
												)
											);
										})
							)
						)
				);
			}
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "memarc",
				order: 95,
				label: () => "记忆与归档"
			}, MemArcSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
