window.__ModuleLoader__.load({
	id: "dsh-session-git",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region rpc + styles
		const RPC_CHANNEL = "/session-git";
		const CSS = [
			".sgit { display:flex; flex-direction:column; gap:14px; color:var(--dsw-alias-label-primary); font-size:13px; }",
			".sgit-tabs { display:flex; gap:8px; border-bottom:1px solid var(--dsw-alias-border-l1); padding-bottom:8px; }",
			".sgit-tab { padding:6px 12px; border-radius:6px; border:1px solid transparent; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; font-size:13px; }",
			".sgit-tab.active { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l2); }",
			".sgit-panel { display:flex; flex-direction:column; gap:10px; }",
			".sgit-row { display:flex; gap:8px; align-items:center; }",
			".sgit-input { flex:1; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:6px; color:var(--dsw-alias-label-primary); padding:6px 8px; font-size:12px; font-family:inherit; }",
			".sgit-btn { background:var(--dsw-alias-brand-primary); border:none; color:#fff; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px; white-space:nowrap; }",
			".sgit-btn:disabled { opacity:0.6; cursor:default; }",
			".sgit-btn.ghost { background:transparent; border:1px solid var(--dsw-alias-border-l2); color:var(--dsw-alias-label-secondary); }",
			".sgit-btn.small { padding:3px 8px; font-size:12px; }",
			".sgit-list { display:flex; flex-direction:column; gap:6px; max-height:420px; overflow-y:auto; }",
			".sgit-item { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:8px; padding:8px 10px; display:flex; gap:8px; align-items:flex-start; }",
			".sgit-item:hover { border-color:var(--dsw-alias-border-l2); }",
			".sgit-item input[type=checkbox] { margin-top:3px; }",
			".sgit-item-body { flex:1; display:flex; flex-direction:column; gap:4px; min-width:0; }",
			".sgit-title { font-size:13px; word-break:break-word; }",
			".sgit-meta { color:var(--dsw-alias-label-secondary); font-size:11px; display:flex; gap:8px; align-items:center; flex-wrap:wrap; }",
			".sgit-tag { background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:1px 8px; font-size:11px; color:var(--dsw-alias-label-secondary); }",
			".sgit-tag.warn { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-state-error-primary); }",
			".sgit-preview { background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:6px; padding:8px; color:var(--dsw-alias-label-secondary); font-size:12px; line-height:1.5; white-space:pre-wrap; word-break:break-word; max-height:200px; overflow-y:auto; }",
			".sgit-empty { color:var(--dsw-alias-label-secondary); padding:12px 0; }",
			".sgit-error { color:var(--dsw-alias-state-error-primary); white-space:pre-wrap; }",
			".sgit-path { color:var(--dsw-alias-label-secondary); font-size:11px; word-break:break-all; }",
			".sgit-result { background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:6px; }",
			".sgit-result-line { display:flex; gap:8px; align-items:center; font-size:12px; }",
			".sgit-ok { color:var(--dsw-alias-state-success-primary, var(--dsw-alias-label-primary)); }",
			".sgit-fail { color:var(--dsw-alias-state-error-primary); }",
			".sgit-hint { color:var(--dsw-alias-label-secondary); font-size:11px; line-height:1.6; }"
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
			if (connection === void 0) throw new Error("dsh-session-git requires the Client connection service");
			const clientSessions = ctx.get("sessions");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-session-git", "");
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "session-git: styles");
			const h = react.createElement;
			async function callHost(endpoint, payload) {
				const result = await connection.rpc.call(RPC_CHANNEL, endpoint, payload === void 0 ? {} : payload);
				if (result && result.ok === true) return result.value;
				const message = result && result.error && typeof result.error.message === "string" ? result.error.message : "session-git RPC failed";
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
			function fmtBytes(n) {
				if (typeof n !== "number" || !(n > 0)) return "";
				if (n < 1024) return n + " B";
				if (n < 1048576) return Math.round(n / 1024) + " KB";
				return (n / 1048576).toFixed(1) + " MB";
			}
			function errMsg(e) {
				if (e !== null && typeof e === "object" && typeof e.message === "string") return e.message;
				return String(e);
			}
			function displayTitle(item, fallback) {
				return typeof item.title === "string" && item.title.length > 0 ? item.title : fallback;
			}
			function SessionGitSection(props) {
				const [tab, setTab] = react.useState("save");
				const [rootText, setRootText] = react.useState("");
				const [appliedRoot, setAppliedRoot] = react.useState("");
				const [sessionsData, setSessionsData] = react.useState(null);
				const [filesData, setFilesData] = react.useState(null);
				const [selSave, setSelSave] = react.useState({});
				const [selLoad, setSelLoad] = react.useState({});
				const [previews, setPreviews] = react.useState({});
				const [busy, setBusy] = react.useState(false);
				const [error, setError] = react.useState("");
				const [saveResult, setSaveResult] = react.useState(null);
				const [loadResults, setLoadResults] = react.useState([]);
				const sessionItems = sessionsData !== null && Array.isArray(sessionsData.items) ? sessionsData.items : [];
				const fileItems = filesData !== null && Array.isArray(filesData.items) ? filesData.items : [];
				const rootArg = () => appliedRoot.trim().length > 0 ? { path: appliedRoot.trim() } : {};
				function loadLists(rootOverride) {
					const arg = typeof rootOverride === "string" && rootOverride.trim().length > 0 ? { path: rootOverride.trim() } : {};
					return Promise.all([
						callHost("session/list", arg),
						callHost("git/list", arg)
					]).then((both) => {
						setSessionsData(both[0]);
						setFilesData(both[1]);
						setSelSave({});
						setSelLoad({});
					});
				}
				react.useEffect(() => {
					let alive = true;
					Promise.all([
						callHost("session/list", {}),
						callHost("git/list", {})
					]).then((both) => {
						if (!alive) return;
						setSessionsData(both[0]);
						setFilesData(both[1]);
					}).catch((e) => {
						if (alive) setError(errMsg(e));
					});
					return () => {
						alive = false;
					};
				}, []);
				function applyRoot() {
					if (busy) return;
					setBusy(true);
					setError("");
					setSaveResult(null);
					const next = rootText.trim();
					loadLists(next).then(() => {
						setAppliedRoot(next);
					}).catch((e) => setError(errMsg(e))).finally(() => setBusy(false));
				}
				function refresh() {
					if (busy) return;
					setBusy(true);
					setError("");
					loadLists(appliedRoot).catch((e) => setError(errMsg(e))).finally(() => setBusy(false));
				}
				function toggleSel(setter) {
					return (key) => setter((prev) => {
						const next = {};
						for (const k in prev) next[k] = prev[k];
						if (prev[key] === true) delete next[key];
						else next[key] = true;
						return next;
					});
				}
				const toggleSave = toggleSel(setSelSave);
				const toggleLoad = toggleSel(setSelLoad);
				function saveSelected() {
					const ids = Object.keys(selSave).filter((k) => selSave[k] === true);
					if (ids.length === 0 || busy) return;
					setBusy(true);
					setError("");
					setSaveResult(null);
					callHost("git/save", { ...rootArg(), sessionIds: ids }).then((r) => {
						setSaveResult(r);
						return callHost("git/list", rootArg()).then((files) => setFilesData(files));
					}).catch((e) => setError(errMsg(e))).finally(() => setBusy(false));
				}
				function loadSelected() {
					const files = Object.keys(selLoad).filter((k) => selLoad[k] === true);
					if (files.length === 0 || busy) return;
					setBusy(true);
					setError("");
					setLoadResults([]);
					const results = [];
					let chain = Promise.resolve();
					for (const file of files) {
						chain = chain.then(() => callHost("git/load", { ...rootArg(), file }).then((r) => {
							results.push({ ...r, ok: true });
						}).catch((e) => {
							results.push({ file, ok: false, error: errMsg(e) });
						}));
					}
					chain.then(() => callHost("git/list", rootArg()).then((files2) => {
						setFilesData(files2);
						setSelLoad({});
						setLoadResults(results);
					})).catch((e) => setError(errMsg(e))).finally(() => setBusy(false));
				}
				function togglePreview(file) {
					if (previews[file] !== void 0) {
						setPreviews((prev) => {
							const next = {};
							for (const k in prev) next[k] = prev[k];
							delete next[file];
							return next;
						});
						return;
					}
					setPreviews((prev) => ({ ...prev, [file]: "loading" }));
					callHost("git/show", { ...rootArg(), file }).then((r) => {
						setPreviews((prev) => ({ ...prev, [file]: r }));
					}).catch((e) => {
						setPreviews((prev) => ({ ...prev, [file]: { error: errMsg(e) } }));
					});
				}
				function openImported(id) {
					if (clientSessions === void 0) return;
					try {
						clientSessions.open(id);
						if (typeof props.close === "function") props.close();
					} catch (e) {
						setError(errMsg(e));
					}
				}
				function previewText(p) {
					if (p === "loading") return "预览加载中…";
					if (p === void 0 || p === null) return "";
					if (typeof p.error === "string") return "预览失败：" + p.error;
					const lines = [
						"原会话 " + p.sessionId + "，创建于 " + fmtTime(p.createdAt) + "，原工作目录 " + (p.originalCwd || "-") + "，预设 " + (p.preset || "-"),
						"规模：" + p.stats.events + " 事件（用户消息 " + p.stats.userMessages + "，助手消息 " + p.stats.assistantMessages + "，工具调用 " + p.stats.toolCalls + "）",
						"工具：" + (Array.isArray(p.toolNames) && p.toolNames.length > 0 ? p.toolNames.join(", ") : "（无）"),
						"",
						"第一条用户消息：",
						p.firstUserMessage !== "" ? p.firstUserMessage : "（无文本消息）"
					];
					return lines.join("\n");
				}
				if (!connection.isLoopback) {
					return h("div", { className: "sgit" }, h("div", { className: "sgit-empty" }, "此页面不是本机回环连接，无法读写项目会话文件（loopback-only）。"));
				}
				const saveCount = Object.keys(selSave).filter((k) => selSave[k] === true).length;
				const loadCount = Object.keys(selLoad).filter((k) => selLoad[k] === true).length;
				const shownRoot = sessionsData !== null && typeof sessionsData.root === "string" ? sessionsData.root : (filesData !== null && typeof filesData.root === "string" ? filesData.root : "");
				return h("div", { className: "sgit" },
					h("div", { className: "sgit-tabs" },
						h("button", { type: "button", className: tab === "save" ? "sgit-tab active" : "sgit-tab", onClick: () => setTab("save") }, "保存到项目"),
						h("button", { type: "button", className: tab === "load" ? "sgit-tab active" : "sgit-tab", onClick: () => setTab("load") }, "从项目加载")
					),
					error !== "" ? h("div", { className: "sgit-error" }, error) : null,
					h("div", { className: "sgit-panel" },
						h("div", { className: "sgit-row" },
							h("input", { className: "sgit-input", placeholder: "项目根路径（留空 = 当前工作区）", value: rootText, onChange: (e) => setRootText(e.target.value) }),
							h("button", { type: "button", className: "sgit-btn ghost", onClick: applyRoot, disabled: busy }, "应用"),
							h("button", { type: "button", className: "sgit-btn ghost", onClick: refresh, disabled: busy }, "刷新")
						),
						shownRoot !== "" ? h("div", { className: "sgit-path" }, "当前项目：" + shownRoot + "／会话文件目录：" + shownRoot + "\\.dsh-sessions\\") : null,
						tab === "save"
							? h("div", { className: "sgit-panel" },
								h("div", { className: "sgit-row" },
									h("button", { type: "button", className: "sgit-btn", onClick: saveSelected, disabled: busy || saveCount === 0 }, saveCount > 0 ? "保存选中（" + saveCount + "）" : "保存选中"),
									h("span", { className: "sgit-hint" }, "导出为 .dsh-sessions/*.json，随代码 git 提交；同名会话重复保存覆盖同一文件")
								),
								saveResult !== null
									? h("div", { className: "sgit-result" },
										h("div", { className: "sgit-result-line sgit-ok" }, "已保存 " + saveResult.total + " 个会话"),
										(Array.isArray(saveResult.saved) ? saveResult.saved : []).map((it) => h("div", { className: "sgit-result-line", key: it.file }, "✓ " + it.file + "（" + it.events + " 事件，" + fmtBytes(it.bytes) + "）")),
										(Array.isArray(saveResult.failures) ? saveResult.failures : []).map((f) => h("div", { className: "sgit-result-line sgit-fail", key: f.sessionId }, "✗ " + f.sessionId + "：" + f.error))
									)
									: null,
								h("div", { className: "sgit-list" },
									sessionItems.length === 0
										? h("div", { className: "sgit-empty" }, sessionsData === null ? "会话列表加载中…" : "该项目路径下没有 DSH 会话")
										: sessionItems.map((it) => h("div", { className: "sgit-item", key: it.sessionId },
											h("input", { type: "checkbox", checked: selSave[it.sessionId] === true, onChange: () => toggleSave(it.sessionId) }),
											h("div", { className: "sgit-item-body" },
												h("div", { className: "sgit-title" }, displayTitle(it, it.sessionId)),
												h("div", { className: "sgit-meta" },
													h("span", null, fmtTime(it.createdAt)),
													it.preset !== "" ? h("span", { className: "sgit-tag" }, it.preset) : null,
													it.persisted === true ? h("span", { className: "sgit-tag" }, "已持久化") : null,
													it.live === true ? h("span", { className: "sgit-tag" }, "进行中") : null
												)
											)
										))
								)
							)
							: h("div", { className: "sgit-panel" },
								h("div", { className: "sgit-row" },
									h("button", { type: "button", className: "sgit-btn", onClick: loadSelected, disabled: busy || loadCount === 0 }, loadCount > 0 ? "加载选中（" + loadCount + "）" : "加载选中"),
									h("span", { className: "sgit-hint" }, "导入为本机原生会话：出现在会话列表，打开即可复现协作现场并继续对话；原文件不受影响")
								),
								loadResults.length > 0
									? h("div", { className: "sgit-result" },
										h("div", { className: "sgit-result-line" }, "本次导入 " + loadResults.length + " 个："),
										loadResults.map((r) => r.ok === true
											? h("div", { className: "sgit-result-line", key: r.file },
												h("span", { className: "sgit-ok" }, "✓ " + (r.title !== "" ? "「" + r.title + "」" : r.file) + " → " + r.imported + "（" + r.events + " 事件）"),
												h("button", { type: "button", className: "sgit-btn small", onClick: () => openImported(r.imported) }, "打开")
											)
											: h("div", { className: "sgit-result-line sgit-fail", key: r.file }, "✗ " + r.file + "：" + r.error)
										)
									)
									: null,
								h("div", { className: "sgit-list" },
									fileItems.length === 0
										? h("div", { className: "sgit-empty" }, filesData === null ? "文件列表加载中…" : (filesData.note !== void 0 ? filesData.note : "该项目还没有已保存的会话文件"))
										: fileItems.map((it) => h("div", { className: "sgit-item", key: it.file },
											it.error === void 0 ? h("input", { type: "checkbox", checked: selLoad[it.file] === true, onChange: () => toggleLoad(it.file) }) : null,
											h("div", { className: "sgit-item-body" },
												h("div", { className: "sgit-title" }, displayTitle(it, it.file)),
												it.error !== void 0
													? h("div", { className: "sgit-meta" }, h("span", { className: "sgit-tag warn" }, "损坏：" + it.error))
													: h("div", { className: "sgit-meta" },
														h("span", null, fmtTime(it.createdAt)),
														h("span", null, it.events + " 事件"),
														h("span", null, fmtBytes(it.bytes)),
														it.preset !== "" ? h("span", { className: "sgit-tag" }, it.preset) : null,
														typeof it.cwd === "string" && it.cwd !== "" && it.cwd.toLowerCase() !== shownRoot.toLowerCase() ? h("span", { className: "sgit-tag" }, "来自 " + it.cwd) : null,
														h("button", { type: "button", className: "sgit-btn small ghost", onClick: () => togglePreview(it.file) }, previews[it.file] !== void 0 ? "收起预览" : "预览")
													),
												previews[it.file] !== void 0 ? h("div", { className: "sgit-preview" }, previewText(previews[it.file])) : null
											)
										))
								)
							)
					)
				);
			}
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "session-git",
				order: 96,
				label: () => "Session Git"
			}, SessionGitSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
