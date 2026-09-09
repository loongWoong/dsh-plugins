/**
 * dsh-model-reasoning — Client half.
 *
 * Registers the "推理能力" section in the settings page and talks to the Host
 * half over the `/model-reasoning` RPC channel. Written by hand in the same
 * `window.__ModuleLoader__` shape the bundled client halves use, so the package
 * needs no build step: React comes from `require("react")`, and every hook is a
 * plain `react.useState` / `react.useEffect` / `react.useCallback`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-reasoning',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const react = require('react')
    const h = react.createElement

    const RPC_CHANNEL = '/model-reasoning'
    const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    /** 与 Host 侧 DECLARE_LEVELS 一致：「顺带声明能力」补的那组等级。 */
    const DECLARE_HINT = 'minimal/low/medium/high'
    const LEVEL_HINTS = {
      off: '不推理；wire 值留空表示「不发送参数」',
      minimal: '最省的思考',
      low: '轻量思考',
      medium: '中等思考',
      high: '重度思考',
      xhigh: '不少网关不支持',
      max: '不少网关不支持'
    }

    const CSS = [
      '.mrsn { display:flex; flex-direction:column; gap:16px; color:var(--dsw-alias-label-primary); font-size:13px; padding-bottom:40px; }',
      '.mrsn-head { display:flex; align-items:flex-start; gap:12px; flex-wrap:wrap; }',
      '.mrsn-title { font-size:15px; font-weight:650; }',
      '.mrsn-sub { color:var(--dsw-alias-label-secondary); font-size:12px; line-height:1.6; margin-top:3px; max-width:88ch; }',
      '.mrsn-actions { margin-left:auto; display:flex; gap:8px; align-items:center; }',
      '.mrsn-btn { background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-label-primary); border-radius:6px; padding:5px 10px; font-size:12px; cursor:pointer; font-family:inherit; }',
      '.mrsn-btn:hover { background:var(--dsw-alias-bg-layer-1); }',
      '.mrsn-btn:disabled { opacity:.55; cursor:default; }',
      '.mrsn-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }',
      '.mrsn-btn-mini { padding:2px 8px; font-size:11px; border-radius:999px; }',
      '.mrsn-error { color:var(--dsw-alias-state-error-primary); font-size:12px; white-space:pre-wrap; }',
      '.mrsn-ok { color:var(--dsw-alias-state-success-primary); font-size:12px; }',
      '.mrsn-warn { color:var(--dsw-alias-state-warn-primary); font-size:12px; }',
      // 三段式面板：① 全局策略 ② 路由概览 ③ 模型明细
      '.mrsn-panel { border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1); overflow:hidden; }',
      '.mrsn-panelhd { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; padding:9px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); }',
      '.mrsn-kicker { font-size:10.5px; letter-spacing:.08em; color:var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }',
      '.mrsn-panelhd-title { font-size:13.5px; font-weight:650; }',
      '.mrsn-panelhd-note { font-size:11.5px; color:var(--dsw-alias-label-secondary); }',
      '.mrsn-panelbd { padding:12px 14px; display:flex; flex-direction:column; gap:12px; }',
      '.mrsn-panelbd-tight { padding:0; }',
      '.mrsn-panelft { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:9px 14px; border-top:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); }',
      // 网格表格：表头 + 数据行共用列宽定义，杜绝「每行自己 flex」的错位
      '.mrsn-tr { display:grid; gap:10px; align-items:center; padding:7px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); }',
      '.mrsn-tr:last-child { border-bottom:none; }',
      '.mrsn-thead { position:sticky; top:0; z-index:2; background:var(--dsw-alias-bg-layer-2); font-size:10.5px; letter-spacing:.05em; color:var(--dsw-alias-label-secondary); padding-top:6px; padding-bottom:6px; }',
      '.mrsn-routes { grid-template-columns:minmax(140px,1.5fr) 116px 68px 116px minmax(140px,1.25fr) 96px; }',
      '.mrsn-models { grid-template-columns:minmax(160px,1.9fr) 104px minmax(110px,1fr) 52px 74px 74px 104px; }',
      '.mrsn-click { cursor:pointer; user-select:none; }',
      '.mrsn-click:hover { background:var(--dsw-alias-bg-layer-2); }',
      '.mrsn-sel { background:var(--dsw-alias-bg-layer-2); box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary); }',
      '.mrsn-dim { opacity:.6; }',
      '.mrsn-num { text-align:right; font-variant-numeric:tabular-nums; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }',
      '.mrsn-cellname { display:flex; flex-direction:column; min-width:0; gap:1px; }',
      '.mrsn-cellend { display:flex; gap:5px; align-items:center; justify-content:flex-end; flex-wrap:wrap; }',
      '.mrsn-detail { padding:8px 14px 10px 26px; border-bottom:1px solid var(--dsw-alias-border-l1); display:flex; flex-direction:column; gap:4px; background:var(--dsw-alias-bg-base); }',
      // 长注释（端点路径、模型名单）只占一格，超出用省略号，完整内容在 title 里
      '.mrsn-ell { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--dsw-alias-label-secondary); min-width:0; }',
      '.mrsn-field { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--dsw-alias-label-secondary); }',
      '.mrsn-input, .mrsn-select { background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:6px; color:var(--dsw-alias-label-primary); padding:4px 7px; font-size:12px; font-family:inherit; min-width:0; }',
      '.mrsn-input:focus, .mrsn-select:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }',
      '.mrsn-mono { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }',
      '.mrsn-search { width:210px; }',
      '.mrsn-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:9px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); }',
      '.mrsn-count { font-size:11.5px; color:var(--dsw-alias-label-secondary); margin-left:auto; }',
      '.mrsn-list { display:flex; flex-direction:column; }',
      '.mrsn-card { border-bottom:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); }',
      '.mrsn-card:last-child { border-bottom:none; }',
      '.mrsn-name { font-weight:600; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      '.mrsn-id { color:var(--dsw-alias-label-secondary); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      '.mrsn-badge { font-size:10.5px; border-radius:999px; padding:1px 7px; border:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); white-space:nowrap; }',
      '.mrsn-badge-on { color:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); }',
      '.mrsn-badge-warn { color:var(--dsw-alias-state-warn-primary); border-color:var(--dsw-alias-state-warn-primary); }',
      '.mrsn-toast { position:fixed; right:22px; bottom:22px; z-index:60; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-left:3px solid var(--dsw-alias-state-success-primary); border-radius:8px; padding:9px 13px; font-size:12.5px; box-shadow:0 10px 26px rgba(0,0,0,.3); max-width:min(52ch,72vw); }',
      '.mrsn-toast-err { border-left-color:var(--dsw-alias-state-error-primary); }',
      '.mrsn-editor { border-top:1px solid var(--dsw-alias-border-l1); padding:12px; display:flex; flex-direction:column; gap:12px; background:var(--dsw-alias-bg-base); }',
      '.mrsn-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }',
      '.mrsn-block { display:flex; flex-direction:column; gap:6px; align-items:flex-start; }',
      '.mrsn-label { font-size:11px; color:var(--dsw-alias-label-secondary); letter-spacing:.02em; }',
      '.mrsn-seg { display:flex; gap:4px; flex-wrap:wrap; }',
      '.mrsn-segbtn { border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); border-radius:6px; padding:3px 9px; font-size:11.5px; cursor:pointer; font-family:inherit; }',
      '.mrsn-segbtn.active { color:#fff; background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); }',
      '.mrsn-levels { border:1px solid var(--dsw-alias-border-l1); border-radius:8px; overflow:hidden; }',
      '.mrsn-level { display:grid; grid-template-columns:110px 1fr 1.1fr; gap:8px; align-items:center; padding:5px 10px; border-bottom:1px solid var(--dsw-alias-border-l1); }',
      '.mrsn-level:last-child { border-bottom:none; }',
      '.mrsn-levelname { display:flex; align-items:center; gap:6px; font-size:12px; }',
      '.mrsn-wireoff { color:var(--dsw-alias-label-secondary); font-size:11px; }',
      '.mrsn-hint { color:var(--dsw-alias-label-secondary); font-size:11px; line-height:1.5; }',
      '.mrsn-compat { display:flex; flex-direction:column; gap:5px; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; padding:8px 10px; }',
      '.mrsn-compatrow { display:flex; align-items:center; gap:8px; font-size:12px; }',
      '.mrsn-compatlabel { flex:1; min-width:0; color:var(--dsw-alias-label-secondary); }',
      '.mrsn-foot { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }',
      '.mrsn-test { border:1px solid var(--dsw-alias-border-l1); border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; gap:6px; }',
      '.mrsn-details { display:flex; flex-direction:column; gap:6px; }',
      '.mrsn-gwrap { display:grid; grid-template-columns:minmax(250px,1fr) minmax(300px,1.2fr); gap:16px; align-items:start; }',
      '.mrsn-gcol { display:flex; flex-direction:column; gap:9px; min-width:0; }',
      '.mrsn-glevel { display:flex; align-items:baseline; gap:8px; }',
      '.mrsn-big { font-size:22px; font-weight:700; line-height:1.1; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }',
      '.mrsn-gcap { font-size:11.5px; color:var(--dsw-alias-label-secondary); line-height:1.55; }',
      '.mrsn-range { width:100%; accent-color:var(--dsw-alias-brand-primary); cursor:pointer; margin:2px 0 0; }',
      '.mrsn-ticks { display:flex; gap:3px; }',
      '.mrsn-tick { flex:1; text-align:center; font-size:10.5px; padding:2px 0; border-radius:5px; cursor:pointer; color:var(--dsw-alias-label-secondary); font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }',
      '.mrsn-tick.active { color:#fff; background:var(--dsw-alias-brand-primary); }',
      '.mrsn-opts { display:flex; flex-direction:column; gap:7px; }',
      '.mrsn-opt { display:flex; align-items:flex-start; gap:7px; font-size:12px; cursor:pointer; }',
      '.mrsn-opthint { display:block; font-size:11px; color:var(--dsw-alias-label-secondary); line-height:1.5; margin-top:1px; }',
      '.mrsn-plan { display:flex; flex-direction:column; border:1px solid var(--dsw-alias-border-l1); border-radius:8px; overflow:hidden; font-size:11.5px; }',
      '.mrsn-planrow { display:grid; grid-template-columns:minmax(80px,1fr) 74px minmax(110px,1.7fr); gap:8px; align-items:baseline; padding:5px 10px; border-bottom:1px solid var(--dsw-alias-border-l1); }',
      '.mrsn-planrow:last-child { border-bottom:none; }',
      '.mrsn-planhead { background:var(--dsw-alias-bg-layer-2); font-size:10.5px; letter-spacing:.05em; color:var(--dsw-alias-label-secondary); }',
      // 输入框工具行里的紧凑滑杆（模型下拉左侧）
      '.mrsn-cs { display:flex; align-items:center; gap:6px; height:26px; padding:0 9px; border:1px solid var(--dsw-alias-border-l1); border-radius:999px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-secondary); font-size:11.5px; white-space:nowrap; flex:none; }',
      '.mrsn-cs:hover { background:var(--dsw-alias-bg-layer-2); }',
      '.mrsn-cs-busy { opacity:.6; }',
      '.mrsn-cs-label { letter-spacing:.02em; }',
      '.mrsn-cs-range { width:74px; height:14px; margin:0; accent-color:var(--dsw-alias-brand-primary); cursor:pointer; }',
      '.mrsn-cs-range:disabled { opacity:.5; cursor:default; }',
      '.mrsn-cs-value { min-width:18px; text-align:center; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; color:var(--dsw-alias-label-primary); }',
      '.mrsn-cs-warn { color:var(--dsw-alias-state-warn-primary); }'
    ].join('\n')

    const has = (target, key) => Object.prototype.hasOwnProperty.call(target || {}, key)
    /** Host 侧把「没有值」统一发成 null，这里两种都当缺省处理。 */
    const isAbsent = (value) => value === undefined || value === null

    /** 右下角写入提示的停留时长。 */
    const TOAST_MS = 2800

    /** token 数按 1024 进制缩写：表格里 1,048,576 不如 1M 好扫读。 */
    function fmtTokens(value) {
      if (isAbsent(value)) return '—'
      const n = Number(value)
      if (!Number.isFinite(n)) return '—'
      if (n >= 1048576) return (n / 1048576).toFixed(n % 1048576 === 0 ? 0 : 1) + 'M'
      if (n >= 1024) return Math.round(n / 1024) + 'K'
      return String(n)
    }

    /**
     * 「一键声明」写入的等级表，必须与 Host 侧 declareDict/DECLARE_LEVELS 一致：
     * off 留空（不发参数），其余用等级名本身当 wire 值，之后可在模型卡片逐档改。
     */
    function declareDict(level) {
      const dict = { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' }
      if (level === 'xhigh' || level === 'max') dict[level] = level
      return dict
    }

    /** 该模型是否属于「配置缺口 / 读不到」这类需要处理的状态。 */
    function needsAttention(model) {
      return model.capability === 'undeclared' || model.capability === 'unknown'
    }

    function messageOf(error) {
      if (error === null || error === undefined) return '未知错误'
      if (typeof error === 'string') return error
      return String(error.message || error)
    }

    /** 把界面草稿和「已存配置 / 当前生效能力」对齐。 */
    function initDraft(model, gateFields) {
      const stored = model.userEntry || {}
      const effective = model.effective || {}
      const declared = stored.reasoningEfforts
      let mode = 'inherit'
      let dict = null
      if (declared === false) mode = 'disabled'
      else if (declared !== undefined && declared !== null && typeof declared === 'object') {
        mode = 'custom'
        dict = declared
      }
      const offered = Array.isArray(effective.efforts) ? effective.efforts : []
      const preset = dict !== null
        ? dict
        : offered.length > 0
          ? Object.fromEntries(offered.map((level) => [level, level === 'off' ? null : level]))
          : { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' }
      const efforts = {}
      for (const level of LEVELS) {
        const on = dict !== null ? has(dict, level) : Object.keys(preset).indexOf(level) >= 0
        const raw = has(preset, level) ? preset[level] : undefined
        efforts[level] = { on, wire: raw === null || raw === undefined ? '' : String(raw) }
      }
      const storedInput = Array.isArray(stored.input) ? stored.input : null
      const inputMode = storedInput === null ? 'inherit' : storedInput.indexOf('image') >= 0 ? 'image' : 'text'
      const compat = {}
      const storedCompat = has(stored, 'compat') && stored.compat !== null ? stored.compat : {}
      for (const field of gateFields) {
        compat[field.key] = has(storedCompat, field.key) ? String(storedCompat[field.key]) : 'inherit'
      }
      return {
        mode,
        efforts,
        inputMode,
        contextWindow: isAbsent(stored.contextWindow) ? '' : String(stored.contextWindow),
        maxTokens: isAbsent(stored.maxTokens) ? '' : String(stored.maxTokens),
        compat
      }
    }

    /** 草稿 → 写回 patch（null 表示删除该字段，即恢复继承）。 */
    function buildPatch(draft, gateFields) {
      const patch = {}
      if (draft.mode === 'inherit') patch.reasoningEfforts = null
      else if (draft.mode === 'disabled') patch.reasoningEfforts = false
      else {
        const dict = {}
        for (const level of LEVELS) {
          const row = draft.efforts[level]
          if (!row.on) continue
          const wire = row.wire.trim()
          dict[level] = wire.length === 0 ? null : wire
        }
        patch.reasoningEfforts = dict
      }
      patch.input = draft.inputMode === 'inherit' ? null : draft.inputMode === 'image' ? ['text', 'image'] : ['text']
      patch.contextWindow = draft.contextWindow.trim().length === 0 ? null : Number(draft.contextWindow)
      patch.maxTokens = draft.maxTokens.trim().length === 0 ? null : Number(draft.maxTokens)
      const compat = {}
      for (const field of gateFields) {
        const value = draft.compat[field.key]
        if (value === 'inherit') compat[field.key] = null
        else if (field.kind === 'bool') compat[field.key] = value === '1'
        else compat[field.key] = value
      }
      patch.compat = compat
      return patch
    }

    /** 界面层校验，规则与适配器一致，省得写进去才被拒。 */
    function validatePatch(patch, gateFields) {
      const efforts = patch.reasoningEfforts
      if (efforts !== null && efforts !== false) {
        const keys = Object.keys(efforts)
        if (keys.length === 0) return '自定义等级至少要勾一个；否则请选「继承」或「不支持推理」。'
        let beyondOff = false
        for (const key of keys) {
          const wire = efforts[key]
          if (wire === null) {
            if (key !== 'off') return '等级 ' + key + ' 必须填写要发给端点的 wire 值；只有 off 可以留空。'
          } else if (wire.length === 0) {
            return '等级 ' + key + ' 的 wire 值不能只有空格。'
          }
          if (key !== 'off') beyondOff = true
        }
        if (!beyondOff) return '只勾 off 等于没有推理能力，请至少再勾一个等级。'
      }
      for (const key of ['contextWindow', 'maxTokens']) {
        const value = patch[key]
        if (value !== null && (!Number.isFinite(value) || !Number.isInteger(value) || value < 1)) {
          return (key === 'contextWindow' ? '上下文窗口' : '最大输出') + '必须是正整数。'
        }
      }
      for (const field of gateFields) {
        const value = patch.compat[field.key]
        if (field.kind === 'enum' && value !== null && field.values.indexOf(value) < 0) return field.label + '的取值不被支持。'
      }
      return ''
    }

    function LevelTable(props) {
      const draft = props.draft
      const setDraft = props.setDraft
      const setRow = (level, changes) => setDraft((prev) => {
        const efforts = Object.assign({}, prev.efforts)
        efforts[level] = Object.assign({}, efforts[level], changes)
        return Object.assign({}, prev, { efforts })
      })
      const quick = (levels) => setDraft((prev) => {
        const efforts = {}
        for (const level of LEVELS) {
          const wire = prev.efforts[level].wire
          efforts[level] = { on: levels.indexOf(level) >= 0, wire: wire.length > 0 ? wire : level === 'off' ? '' : level }
        }
        return Object.assign({}, prev, { efforts })
      })
      return h('div', { className: 'mrsn-levels' },
        h('div', { className: 'mrsn-level', style: { background: 'var(--dsw-alias-bg-layer-2)' } },
          h('span', { className: 'mrsn-label' }, '思考等级'),
          h('span', { className: 'mrsn-label' }, '提供 / 说明'),
          h('span', { className: 'mrsn-label' }, '发送给端点的 wire 值')),
        LEVELS.map((level) => {
          const row = draft.efforts[level]
          return h('div', { className: 'mrsn-level', key: level },
            h('label', { className: 'mrsn-levelname mrsn-mono', title: LEVEL_HINTS[level] },
              h('input', {
                type: 'checkbox',
                checked: row.on,
                onChange: (event) => setRow(level, { on: event.target.checked })
              }),
              h('span', null, level)),
            row.on
              ? h('span', { className: 'mrsn-hint' }, level === 'off' ? '留空 = 不发送参数' : LEVEL_HINTS[level])
              : h('span', { className: 'mrsn-wireoff' }, '不提供（该等级不可选）'),
            row.on
              ? h('input', {
                className: 'mrsn-input mrsn-mono',
                value: row.wire,
                placeholder: level === 'off' ? '(留空 = 不发送)' : level,
                onChange: (event) => setRow(level, { wire: event.target.value })
              })
              : h('span', { className: 'mrsn-wireoff mrsn-mono' }, '—'))
        }),
        h('div', { className: 'mrsn-foot', style: { padding: '6px 10px' } },
          h('button', { className: 'mrsn-btn mrsn-btn-mini', onClick: () => quick(['off', 'minimal', 'low', 'medium', 'high']) }, '常用五档'),
          h('button', { className: 'mrsn-btn mrsn-btn-mini', onClick: () => quick(['off', 'low', 'high', 'max']) }, 'off/low/high/max'),
          h('button', { className: 'mrsn-btn mrsn-btn-mini', onClick: () => quick(['off']) }, '仅 off'),
          h('button', { className: 'mrsn-btn mrsn-btn-mini', onClick: () => quick([]) }, '全部清除')))
    }

    function CompatBlock(props) {
      const draft = props.draft
      const setDraft = props.setDraft
      const gate = props.gate
      const setField = (key, value) => setDraft((prev) => Object.assign({}, prev, {
        compat: Object.assign({}, prev.compat, { [key]: value })
      }))
      return h('div', { className: 'mrsn-compat' },
        h('div', { className: 'mrsn-label' }, '兼容性开关 · 选「继承」= 不写入，交给目录或端点探测'),
        gate.map((field) => h('div', { className: 'mrsn-compatrow', key: field.key },
          h('span', { className: 'mrsn-compatlabel' }, field.label, ' ', h('span', { className: 'mrsn-mono mrsn-hint' }, field.key)),
          field.kind === 'enum'
            ? h('select', {
              className: 'mrsn-select',
              value: draft.compat[field.key],
              onChange: (event) => setField(field.key, event.target.value)
            },
            h('option', { value: 'inherit' }, '— 继承 —'),
            field.values.map((value) => h('option', { value, key: value }, value)))
            : h('div', { className: 'mrsn-seg' },
              [['inherit', '继承'], ['1', '支持'], ['0', '不支持']].map((pair) => h('button', {
                key: pair[0],
                className: 'mrsn-segbtn' + (draft.compat[field.key] === pair[0] ? ' active' : ''),
                onClick: () => setField(field.key, pair[0])
              }, pair[1]))))))
    }

    function ModelCard(props) {
      const providerRow = props.providerRow
      const model = props.model
      const snapshot = props.snapshot
      const callHost = props.callHost
      const gate = Array.isArray(providerRow.gateFields) ? providerRow.gateFields : []
      const storedKey = JSON.stringify(isAbsent(model.userEntry) ? null : model.userEntry)
      const [open, setOpen] = react.useState(false)
      const [draft, setDraft] = react.useState(() => initDraft(model, gate))
      const [status, setStatus] = react.useState(null)
      const [busy, setBusy] = react.useState(false)
      const [testEffort, setTestEffort] = react.useState('')
      const [testResult, setTestResult] = react.useState(null)
      const [testing, setTesting] = react.useState(false)
      const [declaring, setDeclaring] = react.useState(false)

      react.useEffect(() => {
        setDraft(initDraft(model, gate))
        setStatus(null)
        setTestResult(null)
      }, [storedKey])

      const effective = model.effective || {}
      const offered = draft.mode === 'custom'
        ? LEVELS.filter((level) => draft.efforts[level].on)
        : Array.isArray(effective.efforts) ? effective.efforts : []
      const capability = draft.mode === 'inherit' ? '继承' : draft.mode === 'disabled' ? '不推理' : '自定义'
      const selection = snapshot.defaultSelection
      const isDefault = !isAbsent(selection) && selection.provider === providerRow.provider && selection.model === model.id

      const save = async () => {
        const patch = buildPatch(draft, gate)
        const invalid = validatePatch(patch, gate)
        if (invalid.length > 0) {
          setStatus({ kind: 'error', text: invalid })
          return
        }
        setBusy(true)
        setStatus(null)
        try {
          const result = await callHost('save', {
            provider: providerRow.provider,
            model: model.id,
            modelPatch: patch,
            expectedRevision: snapshot.revision
          })
          if (result && result.ok) {
            setStatus({ kind: 'ok', text: '已写入 settings，下一次请求即生效' })
            props.onNotice(providerRow.displayName + ' · ' + model.name + ' 已更新')
            await props.onReload()
          } else {
            setStatus({ kind: 'error', text: messageOf(result && result.error) })
          }
        } catch (error) {
          setStatus({ kind: 'error', text: messageOf(error) })
        } finally {
          setBusy(false)
        }
      }

      /**
       * 行内「声明能力」：只补 `reasoningEfforts`，其余字段一概不动
       * （host 的 patchEntry 按 hasOwnProperty 逐键应用，局部 patch 是安全的）。
       * 目标是把「模型会思考、只是没配」这类配置缺口一次点掉，不必先进编辑器。
       */
      const quickDeclare = async (event) => {
        event.stopPropagation()
        setDeclaring(true)
        setStatus(null)
        try {
          const result = await callHost('save', {
            provider: providerRow.provider,
            model: model.id,
            modelPatch: { reasoningEfforts: declareDict('medium') },
            expectedRevision: snapshot.revision
          })
          if (result && result.ok) {
            props.onNotice(model.name + ' 已声明 off/' + DECLARE_HINT + '，现在可以选思考等级了')
            await props.onReload()
          } else setStatus({ kind: 'error', text: messageOf(result && result.error) })
        } catch (error) {
          setStatus({ kind: 'error', text: messageOf(error) })
        } finally {
          setDeclaring(false)
        }
      }

      const runTest = async () => {
        setTesting(true)
        setTestResult(null)
        try {
          const result = await callHost('test', { provider: providerRow.provider, model: model.id, effort: testEffort })
          setTestResult(result && result.ok ? result : { error: messageOf(result && result.error) })
        } catch (error) {
          setTestResult({ error: messageOf(error) })
        } finally {
          setTesting(false)
        }
      }

      // 「没有推理元数据」有四种原因，界面必须说清哪一种能修，并就地给出入口：
      // undeclared 是配置缺口（一键声明即可用），off 是用户明确关掉的，unknown 是读不到。
      const source = model.capability === undefined ? '' : model.capability
      const undeclared = source === 'undeclared'
      const capabilityCell = offered.length > 0
        ? h('span', { className: 'mrsn-badge mrsn-badge-on', title: '当前生效的思考等级：' + offered.join('、') }, '可推理')
        : undeclared
          ? h('button', {
            className: 'mrsn-btn mrsn-btn-mini',
            disabled: declaring || busy,
            onClick: quickDeclare,
            title: '条目上还没有 reasoningEfforts，pi-ai 因此只认 off —— 这是配置缺口，不是模型不会思考。\n点一下写入 off/' + DECLARE_HINT + '（wire 值＝等级名），只改这一个字段。'
          }, declaring ? '声明中…' : '声明能力')
          : h('span', {
            className: 'mrsn-badge mrsn-badge-warn',
            title: source === 'unknown'
              ? (model.effective.error || '能力解析失败')
              : '该模型被标为不支持推理；要启用就在展开的编辑区选「自定义等级」。'
          }, source === 'unknown' ? '能力未知' : draft.mode === 'disabled' || source === 'off' ? '已关推理' : '无推理能力')

      return h('div', { className: 'mrsn-card' },
        h('div', {
          className: 'mrsn-tr mrsn-models mrsn-click',
          onClick: () => setOpen((prev) => !prev),
          title: open ? '收起编辑' : '展开编辑'
        },
        h('span', { className: 'mrsn-cellname' },
          h('span', { className: 'mrsn-name', title: model.name }, (open ? '▾ ' : '▸ ') + model.name),
          h('span', { className: 'mrsn-id mrsn-mono', title: model.id }, model.id)),
        capabilityCell,
        h('span', {
          className: 'mrsn-mono mrsn-hint',
          title: offered.length > 0 ? '生效等级：' + offered.join('、') : '没有可选的思考等级'
        }, offered.length > 0 ? offered.join(' ') : '—'),
        h('span', { className: 'mrsn-hint' }, Array.isArray(effective.input) && effective.input.indexOf('image') >= 0 ? '图' : '文本'),
        h('span', {
          className: 'mrsn-num',
          title: isAbsent(effective.contextWindow) ? '未设置上下文窗口' : effective.contextWindow.toLocaleString() + ' tokens'
        }, fmtTokens(effective.contextWindow)),
        h('span', {
          className: 'mrsn-num',
          title: isAbsent(effective.maxTokens) ? '未封顶最大输出' : effective.maxTokens.toLocaleString() + ' tokens'
        }, fmtTokens(effective.maxTokens)),
        h('span', { className: 'mrsn-cellend' },
          isDefault ? h('span', { className: 'mrsn-badge mrsn-badge-on', title: 'DSH 当前默认模型' }, '默认') : null,
          capability === '继承' ? null : h('span', { className: 'mrsn-badge', title: '该条目上的自定义状态' }, capability))),
        open ? h('div', { className: 'mrsn-editor' },
          h('div', { className: 'mrsn-grid' },
            h('div', { className: 'mrsn-block' },
              h('span', { className: 'mrsn-label' }, '能力 · 推理 / 思考'),
              h('div', { className: 'mrsn-seg' },
                [['inherit', '继承默认'], ['custom', '自定义等级'], ['disabled', '不支持推理']].map((pair) => h('button', {
                  key: pair[0],
                  className: 'mrsn-segbtn' + (draft.mode === pair[0] ? ' active' : ''),
                  onClick: () => setDraft((prev) => Object.assign({}, prev, { mode: pair[0] }))
                }, pair[1]))),
              h('span', { className: 'mrsn-hint' }, '「自定义」整份替换该模型的等级表：没勾的等级即不支持。')),
            h('div', { className: 'mrsn-block' },
              h('span', { className: 'mrsn-label' }, '能力 · 图片输入'),
              h('div', { className: 'mrsn-seg' },
                [['inherit', '继承'], ['text', '仅文本'], ['image', '文本 + 图片']].map((pair) => h('button', {
                  key: pair[0],
                  className: 'mrsn-segbtn' + (draft.inputMode === pair[0] ? ' active' : ''),
                  onClick: () => setDraft((prev) => Object.assign({}, prev, { inputMode: pair[0] }))
                }, pair[1]))),
              h('span', { className: 'mrsn-hint' }, '声明端点真正接受的模态；多写会在带图请求时被端点拒绝。'))),
          draft.mode === 'custom' ? h(LevelTable, { draft, setDraft }) : null,
          h('div', { className: 'mrsn-grid' },
            h('label', { className: 'mrsn-block' },
              h('span', { className: 'mrsn-label' }, '上下文窗口（tokens）'),
              h('input', {
                className: 'mrsn-input',
                value: draft.contextWindow,
                placeholder: isAbsent(effective.contextWindow) ? '未设置' : String(effective.contextWindow),
                onChange: (event) => setDraft((prev) => Object.assign({}, prev, { contextWindow: event.target.value }))
              })),
            h('label', { className: 'mrsn-block' },
              h('span', { className: 'mrsn-label' }, '最大输出 tokens'),
              h('input', {
                className: 'mrsn-input',
                value: draft.maxTokens,
                placeholder: isAbsent(effective.maxTokens) ? '未设置（不额外封顶）' : String(effective.maxTokens),
                onChange: (event) => setDraft((prev) => Object.assign({}, prev, { maxTokens: event.target.value }))
              }))),
          h('div', { className: 'mrsn-details' },
            h('span', { className: 'mrsn-label' }, '兼容性 · ' + (providerRow.api || '未声明协议') + '（' + gate.length + ' 项可覆盖）'),
            h(CompatBlock, { draft, setDraft, gate })),
          h('div', { className: 'mrsn-test' },
            h('div', { className: 'mrsn-field' },
              h('span', null, '测试'),
              h('select', {
                className: 'mrsn-select', value: testEffort,
                onChange: (event) => setTestEffort(event.target.value)
              },
              h('option', { value: '' }, '— 默认推理强度 —'),
              offered.map((level) => h('option', { value: level, key: level }, level))),
              h('button', { className: 'mrsn-btn', onClick: runTest, disabled: testing || busy }, testing ? '测试中…' : '发送一次探测请求'),
              h('span', { className: 'mrsn-hint' }, '真实调用端点，只发一句话，用来确认思考是否真的回来。')),
            testResult === null ? null : testResult.error !== undefined
              ? h('span', { className: 'mrsn-error' }, '失败：' + testResult.error)
              : h('span', { className: testResult.reasoning ? 'mrsn-ok' : 'mrsn-warn' },
                (testResult.reasoning ? '有思考返回' : '没有思考内容') + ' · 思考 ' + testResult.reasoningChars + ' 字 · finish=' + (testResult.finish || '-') + ' · 回复「' + testResult.text + '」')),
          h('div', { className: 'mrsn-foot' },
            h('button', { className: 'mrsn-btn mrsn-btn-primary', onClick: save, disabled: busy }, busy ? '写入中…' : '写入 settings'),
            h('button', {
              className: 'mrsn-btn', disabled: busy,
              onClick: () => {
                setDraft(initDraft(model, gate))
                setStatus(null)
              }
            }, '放弃修改'),
            h('span', { className: 'mrsn-hint mrsn-mono' }, model.target === 'models'
              ? 'llm-pi-ai.providers.' + providerRow.provider + '.models[]'
              : 'llm-pi-ai.providers.' + providerRow.provider + '.modelOverrides.' + model.id),
            status === null ? null : h('span', { className: status.kind === 'ok' ? 'mrsn-ok' : 'mrsn-error' }, status.text))) : null)
    }

    /**
     * 全局默认推理强度：一个滑动条定档位，落到每条路由上由该路由的模型能力适配。
     * 请求路径不会替我们降级（不支持的等级直接报错），所以预览必须说清楚
     * 「这一档在这条路由上实际会写成什么」。
     */
    function GlobalBlock(props) {
      const snapshot = props.snapshot
      const callHost = props.callHost
      const onReload = props.onReload
      const onNotice = props.onNotice
      const routes = snapshot.providers.filter((row) => row.configured)
      const [level, setLevel] = react.useState(snapshot.globalDefault.length > 0 ? snapshot.globalDefault : 'medium')
      const [alsoDefault, setAlsoDefault] = react.useState(snapshot.defaultSelectionEffort.length > 0)
      const [declare, setDeclare] = react.useState(true)
      const [busy, setBusy] = react.useState(false)
      const [result, setResult] = react.useState(null)

      const applyAll = async () => {
        setBusy(true)
        setResult(null)
        try {
          const answer = await callHost('applyGlobal', {
            level,
            providers: routes.map((row) => row.provider),
            alsoDefault,
            declare,
            expectedRevision: snapshot.revision
          })
          if (answer && answer.ok) {
            setResult(answer)
            onNotice('全局默认推理强度已按路由适配（路由默认 ' + answer.changed + ' 处'
              + (answer.declared > 0 ? '，能力声明 ' + answer.declared + ' 个模型' : '') + '）')
            await onReload()
          } else setResult({ error: messageOf(answer && answer.error) })
        } catch (error) {
          setResult({ error: messageOf(error) })
        } finally {
          setBusy(false)
        }
      }

      const pendingTotal = routes.reduce((sum, row) => sum + (isAbsent(row.undeclared) ? 0 : row.undeclared.length), 0)

      return h('div', { className: 'mrsn-panel' },
        h('div', { className: 'mrsn-panelhd' },
          h('span', { className: 'mrsn-kicker' }, '① 全局策略'),
          h('span', { className: 'mrsn-panelhd-title' }, '默认推理强度'),
          h('span', { className: 'mrsn-panelhd-note' }, routes.length + ' 条已配置路由'
            + (pendingTotal > 0 ? ' · ' + pendingTotal + ' 个模型还没声明能力' : ''))),
        h('div', { className: 'mrsn-panelbd' },
          h('div', { className: 'mrsn-gwrap' },
            h('div', { className: 'mrsn-gcol' },
              h('div', { className: 'mrsn-glevel' },
                h('span', { className: 'mrsn-big' }, level),
                snapshot.globalMixed
                  ? h('span', { className: 'mrsn-badge mrsn-badge-warn' }, '各路由当前不统一')
                  : snapshot.globalDefault.length > 0
                    ? h('span', { className: 'mrsn-badge' }, '当前统一为 ' + snapshot.globalDefault)
                    : h('span', { className: 'mrsn-badge' }, '没有统一的路由默认')),
              h('input', {
                className: 'mrsn-range',
                type: 'range',
                min: 0,
                max: LEVELS.length - 1,
                step: 1,
                value: LEVELS.indexOf(level),
                'aria-label': '全局默认推理强度',
                onChange: (event) => {
                  setLevel(LEVELS[Number(event.target.value)])
                  setResult(null)
                }
              }),
              h('div', { className: 'mrsn-ticks' }, LEVELS.map((item) => h('span', {
                key: item,
                className: 'mrsn-tick' + (item === level ? ' active' : ''),
                title: LEVEL_HINTS[item],
                onClick: () => {
                  setLevel(item)
                  setResult(null)
                }
              }, item))),
              h('span', { className: 'mrsn-gcap' },
                '滑杆只写「路由默认值」：会话里输入框上的强度优先于它。档位按 pi-ai 的等级顺序排列，不是等距语义；xhigh / max 很多网关不支持。')),
            h('div', { className: 'mrsn-gcol' },
              h('div', { className: 'mrsn-plan' },
                h('div', { className: 'mrsn-planrow mrsn-planhead' },
                  h('span', null, '路由'),
                  h('span', null, '写入'),
                  h('span', null, '依据')),
                routes.map((row) => {
                  const table = isAbsent(row.adaptsTo) ? null : row.adaptsTo
                  const adaptation = table === null || table[level] === undefined ? { level: null, mode: 'none', note: '无法判定该路由的能力' } : table[level]
                  const note = adaptation.note === undefined ? '' : adaptation.note
                  const pending = !isAbsent(row.undeclared) && row.undeclared.length > 0
                  const blocked = !isAbsent(row.offDeclared) && row.offDeclared.length > 0
                  // 三列必须恒定，否则网格会错位：写入结果合成一个单元格。
                  let writeText = adaptation.mode === 'declare' ? '暂不写入' : '不写入'
                  let writeClass = 'mrsn-hint'
                  if (adaptation.mode === 'exact') {
                    writeText = '→ ' + adaptation.level
                    writeClass = 'mrsn-ok'
                  } else if (adaptation.mode === 'fallback' || (adaptation.mode === 'declare' && declare)) {
                    writeText = '→ ' + adaptation.level
                    writeClass = 'mrsn-warn'
                  }
                  return h('div', { className: 'mrsn-planrow', key: row.provider },
                    h('span', { className: 'mrsn-mono', title: row.displayName }, row.displayName),
                    h('span', { className: writeClass }, writeText),
                    h('span', {
                      className: 'mrsn-ell',
                      title: note
                        + (pending ? '\n待声明：' + row.undeclared.join('、') : '')
                        + (blocked ? '\n已关推理：' + row.offDeclared.join('、') : '')
                    }, note
                      + (pending ? '（待声明 ' + row.undeclared.length + '）' : '')
                      + (blocked ? '（已关 ' + row.offDeclared.length + '）' : '')))
                }))),
              h('div', { className: 'mrsn-opts' },
                h('label', { className: 'mrsn-opt' },
                  h('input', {
                    type: 'checkbox', checked: declare,
                    onChange: (event) => {
                      setDeclare(event.target.checked)
                      setResult(null)
                    }
                  }),
                  h('span', null, '顺带声明还没配置能力的模型',
                    h('span', { className: 'mrsn-opthint' },
                      '给条目上没有 reasoningEfforts 的模型补 off/' + DECLARE_HINT + '（wire 值＝等级名），和路由默认放在同一次 mutate：要么都写成功，要么都不写。之后可在模型卡片逐档改。'))),
                h('label', { className: 'mrsn-opt' },
                  h('input', {
                    type: 'checkbox', checked: alsoDefault,
                    onChange: (event) => setAlsoDefault(event.target.checked)
                  }),
                  h('span', null, '同时用于 Agent 默认模型',
                    h('span', { className: 'mrsn-opthint' }, '另写 agent-default-model.reasoningEffort（DSH 原生的默认模型推理强度）'
                      + (snapshot.defaultSelectionEffort.length > 0 ? '，现值 ' + snapshot.defaultSelectionEffort : '') + '。')))))),
        h('div', { className: 'mrsn-panelft' },
          h('button', {
            className: 'mrsn-btn mrsn-btn-primary', onClick: applyAll, disabled: busy || routes.length === 0
          }, busy ? '写入中…' : '应用到 ' + routes.length + ' 个路由'),
          result === null
            ? h('span', { className: 'mrsn-gcap' }, '写入 settings.yaml 的 providers.<路由>.reasoning，下一次请求即生效，不需要重启。')
            : result.error !== undefined
              ? h('span', { className: 'mrsn-error' }, '失败：' + result.error)
              : h('span', { className: 'mrsn-ok' }, '已写入 ' + result.changed + ' 个路由默认'
                + (result.declared > 0 ? ' · 声明了 ' + result.declared + ' 个模型的能力' : '')
                + (result.defaultWritten ? ' · Agent 默认模型已设为 ' + level : '')
                + (result.defaultNote === undefined ? '' : ' · ' + result.defaultNote))))
    }

    // ---------- 输入框：推理强度滑杆（模型下拉左侧） ----------

    /** 紧凑滑杆用的单字标签；完整含义在 title 里。 */
    const LEVEL_SHORT = {
      off: '关',
      minimal: '极',
      low: '低',
      medium: '中',
      high: '高',
      xhigh: '超',
      max: '满'
    }
    /** 特殊档位：不写 reasoningEffort，让请求回落到路由默认（即设置页滑杆写的值）。 */
    const FOLLOW = ''

    /**
     * 滑杆档位 = 「默认」+ 当前模型目录声明的等级（按 off→max 排序，
     * 目录里出现的自定义 id 追加在末尾，保证可选）。
     * @param {object} reasoning - 目录里的 model.reasoning。
     * @returns {Array<{key:string,effort:string,label:string,name:string}>}
     */
    function stopsOf(reasoning) {
      const offered = (reasoning.efforts || []).map((item) => item.id)
      const ordered = LEVELS.filter((level) => offered.indexOf(level) >= 0)
        .concat(offered.filter((id) => LEVELS.indexOf(id) < 0))
      const stops = [{
        key: 'follow',
        effort: FOLLOW,
        label: '默认',
        name: '默认：不覆盖，用「推理能力」页写入的路由默认'
      }]
      for (const id of ordered) {
        const meta = (reasoning.efforts || []).find((item) => item.id === id)
        const nice = meta && meta.name ? meta.name : id
        stops.push({
          key: 'e:' + id,
          effort: id,
          label: LEVEL_SHORT[id] === undefined ? id : LEVEL_SHORT[id],
          name: nice + '（' + id + '）'
        })
      }
      return stops
    }

    /**
     * 会话级推理强度滑杆。状态与模型下拉完全同源（ModelDirectory.store），
     * 写入也走同一个 directory.select()，所以两处永远一致。
     * @param {object} props - available / directory / load / select（由 slot inject 提供）。
     * @returns 紧凑滑杆，或当前情形下没有可写目标时 null。
     */
    function EffortSeat(props) {
      const store = props.directory
      const state = react.useSyncExternalStore((fn) => store.subscribe(fn), () => store.getSnapshot())
      const [drag, setDrag] = react.useState(null)
      const [note, setNote] = react.useState('')
      react.useEffect(() => {
        props.load()
      }, [])
      const current = state.current
      if (props.available === false) return null
      if (current === null || current === undefined) return null
      const group = (state.groups || []).find((item) => item.id === current.provider)
      if (group === undefined) return null
      const model = (group.models || []).find((item) => item.id === current.model)
      if (model === undefined || model.reasoning === undefined) return null
      const stops = stopsOf(model.reasoning)
      const explicit = isAbsent(current.reasoningEffort) ? FOLLOW : current.reasoningEffort
      const found = stops.findIndex((item) => item.effort === explicit)
      const shown = drag === null ? (found < 0 ? 0 : found) : drag
      const label = drag === null
        ? (found < 0 ? (LEVEL_SHORT[explicit] === undefined ? explicit : LEVEL_SHORT[explicit]) : stops[found].label)
        : stops[shown].label
      const busy = state.status === 'selecting'
      const warn = found < 0 ? '当前值「' + explicit + '」不在该模型支持的等级里。' : ''
      const commit = () => {
        const index = drag
        setDrag(null)
        if (index === null) return
        const stop = stops[index]
        if (stop === undefined || stop.effort === explicit) return
        setNote('')
        const selection = { provider: current.provider, model: current.model }
        if (stop.effort !== FOLLOW) selection.reasoningEffort = stop.effort
        Promise.resolve(props.select(selection)).then(
          (ok) => {
            if (ok === false) setNote('切换失败')
          },
          (error) => {
            setNote(messageOf(error))
          }
        )
      }
      const title = '推理强度（只对当前会话生效，优先于路由默认）\n'
        + stops[shown].name
        + (warn === '' ? '' : '\n' + warn)
        + (note === '' ? '' : '\n' + note)
      const valueClass = note === '' && warn === '' ? 'mrsn-cs-value' : 'mrsn-cs-value mrsn-cs-warn'
      return h('div', {
        className: busy ? 'mrsn-cs mrsn-cs-busy' : 'mrsn-cs',
        title
      },
      h('span', { className: 'mrsn-cs-label' }, '思考'),
      h('input', {
        className: 'mrsn-cs-range',
        type: 'range',
        min: 0,
        max: stops.length - 1,
        step: 1,
        value: shown,
        disabled: busy,
        'aria-label': '推理强度',
        onChange: (event) => {
          setDrag(Number(event.target.value))
        },
        onPointerUp: commit,
        onKeyUp: commit,
        onBlur: commit
      }),
      h('span', { className: valueClass }, label))
    }

    function Section(props) {
      const callHost = props.callHost
      const [snapshot, setSnapshot] = react.useState(null)
      const [error, setError] = react.useState('')
      const [notice, setNotice] = react.useState('')
      const [toastKind, setToastKind] = react.useState('ok')
      const [providerId, setProviderId] = react.useState('')
      const [query, setQuery] = react.useState('')
      const [showAll, setShowAll] = react.useState(false)
      const [onlyGaps, setOnlyGaps] = react.useState(false)
      const [expanded, setExpanded] = react.useState('')
      const [busy, setBusy] = react.useState(false)
      const [loadedAt, setLoadedAt] = react.useState('')

      /** 右下角 toast：任何写入成功/失败都给一次明确反馈，超时自动消失。 */
      const notify = (text, kind) => {
        setToastKind(kind === undefined ? 'ok' : kind)
        setNotice(text)
      }
      react.useEffect(() => {
        if (notice.length === 0) return undefined
        const timer = setTimeout(() => setNotice(''), TOAST_MS)
        return () => clearTimeout(timer)
      }, [notice])

      const load = react.useCallback(async () => {
        setBusy(true)
        try {
          const result = await callHost('snapshot')
          if (result && result.ok) {
            setSnapshot(result)
            setError('')
            setLoadedAt(new Date().toLocaleTimeString())
            setProviderId((prev) => {
              if (prev.length > 0 && result.providers.some((row) => row.provider === prev)) return prev
              const live = result.providers.find((row) => row.live)
              const first = live === undefined ? result.providers[0] : live
              return first === undefined ? '' : first.provider
            })
          } else setError(messageOf(result && result.error))
        } catch (caught) {
          setError(messageOf(caught))
        } finally {
          setBusy(false)
        }
      }, [callHost])

      react.useEffect(() => {
        load()
      }, [load])

      const rows = snapshot === null ? [] : snapshot.providers.filter((row) => showAll || row.configured || row.live)
      const current = rows.length === 0 ? undefined : (rows.find((row) => row.provider === providerId) || rows[0])

      const changeDefaultReasoning = async (level) => {
        if (current === undefined || snapshot === null) return
        setBusy(true)
        setError('')
        try {
          const result = await callHost('save', {
            provider: current.provider,
            providerReasoning: level,
            expectedRevision: snapshot.revision
          })
          if (result && result.ok) {
            notify(current.displayName + ' 的默认推理强度已' + (level.length === 0 ? '恢复继承' : '设为 ' + level))
            await load()
          } else setError(messageOf(result && result.error))
        } catch (caught) {
          setError(messageOf(caught))
        } finally {
          setBusy(false)
        }
      }

      // 一个搜索框同时收窄「路由列表」和「当前路由的模型列表」；选中的路由始终
      // 保留在列表里，否则搜一下就把当前上下文弄丢了。
      const needle = query.trim().toLowerCase()
      const matches = (text) => needle.length === 0 || String(text).toLowerCase().indexOf(needle) >= 0
      const routeHasMatch = (row) => matches(row.provider) || matches(row.displayName)
        || row.models.some((model) => matches(model.id) || matches(model.name))
      const visible = needle.length === 0 ? rows : rows.filter((row) => routeHasMatch(row) || row.provider === providerId)
      const models = current === undefined ? [] : current.models.filter((model) => (needle.length === 0
        || matches(model.id) || matches(model.name)) && (!onlyGaps || needsAttention(model)))
      const configuredTotal = snapshot === null ? 0 : snapshot.providers.filter((row) => row.configured).length
      const modelsTotal = snapshot === null ? 0 : snapshot.providers.reduce((sum, row) => sum + row.models.length, 0)
      const gapsTotal = snapshot === null ? 0 : snapshot.providers.reduce((sum, row) => sum
        + (isAbsent(row.undeclared) ? 0 : row.undeclared.length)
        + (isAbsent(row.unresolved) ? 0 : row.unresolved.length), 0)

      return h('div', { className: 'mrsn' },
        h('div', { className: 'mrsn-head' },
          h('div', null,
            h('div', { className: 'mrsn-title' }, '模型推理能力 / 推理强度'),
            h('div', { className: 'mrsn-sub' },
              '滑杆定全局默认并按路由能力适配；点开模型条目可改推理能力声明、上下文与输出上限、兼容开关。写入即生效，不需要重启。')),
          h('div', { className: 'mrsn-actions' },
            loadedAt.length > 0 ? h('span', { className: 'mrsn-count' }, '读取于 ' + loadedAt) : null,
            h('button', {
              className: 'mrsn-btn', disabled: busy,
              onClick: () => load()
            }, busy ? '读取中…' : '重新读取'))),
        error.length > 0 ? h('div', { className: 'mrsn-error' }, error) : null,
        snapshot === null ? (error.length > 0 ? null : h('div', { className: 'mrsn-hint' }, '读取模型配置…')) : null,
        snapshot !== null && snapshot.writable !== false ? h(GlobalBlock, {
          snapshot,
          callHost,
          onReload: load,
          onNotice: notify
        }) : null,
        snapshot === null ? null : h('div', { className: 'mrsn-panel' },
          h('div', { className: 'mrsn-panelhd' },
            h('span', { className: 'mrsn-kicker' }, '② 路由概览'),
            h('span', { className: 'mrsn-panelhd-title' }, 'Provider 与其默认值'),
            h('span', { className: 'mrsn-panelhd-note' }, '点一行选中它，并在下方 ③ 展开它的模型')),
          h('div', { className: 'mrsn-bar' },
            h('input', {
              className: 'mrsn-input mrsn-search', placeholder: '搜索路由 / 模型…', value: query,
              onChange: (event) => setQuery(event.target.value)
            }),
            h('button', {
              className: 'mrsn-btn mrsn-btn-mini', title: '包含 pi-ai 目录里尚未配置的路由',
              onClick: () => setShowAll((prev) => !prev)
            }, showAll ? '只看已配置' : '显示全部路由'),
            h('span', { className: 'mrsn-count' }, '共 ' + snapshot.providers.length + ' 条 · 已配置 ' + configuredTotal + ' 条 · '
              + modelsTotal + ' 个模型' + (gapsTotal > 0 ? ' · ' + gapsTotal + ' 个待处理' : ''))),
          h('div', { className: 'mrsn-panelbd mrsn-panelbd-tight' },
            h('div', { className: 'mrsn-tr mrsn-routes mrsn-thead' },
              h('span', null, '路由'),
              h('span', null, '协议'),
              h('span', { className: 'mrsn-num' }, '模型'),
              h('span', null, '默认强度'),
              h('span', null, '能力状况'),
              h('span', null, '状态')),
            visible.length === 0 ? h('div', { className: 'mrsn-hint', style: { padding: '10px 14px' } }, '没有匹配的路由') : null,
            visible.map((row) => {
              const ready = row.models.filter((model) => !isAbsent(model.effective)
                && Array.isArray(model.effective.efforts) && model.effective.efforts.length > 0).length
              const pending = isAbsent(row.undeclared) ? 0 : row.undeclared.length
              const unknown = isAbsent(row.unresolved) ? 0 : row.unresolved.length
              const off = isAbsent(row.offDeclared) ? 0 : row.offDeclared.length
              const selected = current !== undefined && current.provider === row.provider
              const open = expanded === row.provider
              const effective = row.configuredDefaultReasoning.length > 0 ? row.configuredDefaultReasoning : row.defaultReasoning
              return h('div', { key: row.provider },
                h('div', {
                  className: 'mrsn-tr mrsn-routes mrsn-click' + (selected ? ' mrsn-sel' : '') + (row.live ? '' : ' mrsn-dim'),
                  title: row.live ? '已注册，可直接请求' : '该路由尚未注册（缺凭据或未配置）',
                  onClick: () => {
                    setProviderId(row.provider)
                    setExpanded(open ? '' : row.provider)
                  }
                },
                h('span', { className: 'mrsn-cellname' },
                  h('span', { className: 'mrsn-name', title: row.displayName }, (open ? '▾ ' : '▸ ') + row.displayName),
                  h('span', { className: 'mrsn-id mrsn-mono', title: row.provider }, row.provider)),
                h('span', { className: 'mrsn-mono mrsn-hint' }, row.api || '未声明'),
                h('span', { className: 'mrsn-num' }, String(row.models.length)),
                h('span', { className: 'mrsn-mono' }, effective.length === 0 ? '—'
                  : row.configuredDefaultReasoning.length > 0 ? effective : '继承 ' + effective),
                h('span', { className: 'mrsn-cellend' },
                  h('span', {
                    className: pending + unknown > 0 ? 'mrsn-badge mrsn-badge-warn' : 'mrsn-badge mrsn-badge-on',
                    title: pending + unknown > 0
                      ? '已声明可推理等级的模型数；剩下的是配置缺口或能力读不到，展开看名单'
                      : row.models.length + ' 个模型都声明了可推理等级'
                  }, ready + '/' + row.models.length + ' 可推理'),
                  pending > 0 ? h('span', {
                    className: 'mrsn-badge', title: '条目上没有 reasoningEfforts：' + row.undeclared.join('、')
                  }, '待声明 ' + pending) : null,
                  unknown > 0 ? h('span', {
                    className: 'mrsn-badge', title: '能力解析失败：' + row.unresolved.join('、')
                  }, '未知 ' + unknown) : null,
                  off > 0 ? h('span', {
                    className: 'mrsn-badge', title: '被显式设为不支持推理，本包不擅自改：' + row.offDeclared.join('、')
                  }, '已关 ' + off) : null),
                h('span', { className: 'mrsn-cellend' },
                  row.declared ? h('span', { className: 'mrsn-badge', title: 'settings.yaml 里自建的路由条目' }, '自建') : null,
                  selected ? h('span', { className: 'mrsn-badge mrsn-badge-on' }, '已选') : null,
                  row.live ? null : h('span', { className: 'mrsn-badge' }, '未注册'))),
                open ? h('div', { className: 'mrsn-detail' },
                  row.baseURL.length > 0 ? h('span', { className: 'mrsn-hint mrsn-mono' }, row.baseURL) : null,
                  pending > 0 ? h('span', { className: 'mrsn-hint' }, '待声明能力：' + row.undeclared.join('、')) : null,
                  unknown > 0 ? h('span', { className: 'mrsn-hint' }, '能力解析失败：' + row.unresolved.join('、')) : null,
                  off > 0 ? h('span', { className: 'mrsn-hint' }, '已关推理（要启用请在 ③ 里选「自定义等级」）：' + row.offDeclared.join('、')) : null,
                  isAbsent(row.potentialEfforts) || row.potentialEfforts.length === 0 ? null
                    : h('span', { className: 'mrsn-hint mrsn-mono' }, '补齐声明后可用：' + row.potentialEfforts.join('/'))) : null)
            }))),
        snapshot === null || current === undefined ? null : h('div', { className: 'mrsn-panel' },
          h('div', { className: 'mrsn-panelhd' },
            h('span', { className: 'mrsn-kicker' }, '③ 模型明细'),
            h('span', { className: 'mrsn-panelhd-title' }, current.displayName),
            h('span', { className: 'mrsn-panelhd-note' }, current.api || '未声明协议'),
            h('span', { className: 'mrsn-field', style: { marginLeft: 'auto' } },
              '该路由默认强度',
              h('select', {
                className: 'mrsn-select', value: current.configuredDefaultReasoning, disabled: busy,
                onChange: (event) => changeDefaultReasoning(event.target.value)
              },
              h('option', { value: '' }, '— 继承 —'),
              LEVELS.map((level) => h('option', { value: level, key: level }, level))),
              current.configuredDefaultReasoning.length === 0 && current.defaultReasoning.length > 0
                ? h('span', { className: 'mrsn-hint' }, '（生效 ' + current.defaultReasoning + '）') : null)),
          h('div', { className: 'mrsn-bar' },
            h('select', {
              className: 'mrsn-select', value: current.provider, disabled: busy, 'aria-label': '选择路由',
              onChange: (event) => {
                setProviderId(event.target.value)
                setExpanded(event.target.value)
              }
            },
            rows.map((row) => h('option', { value: row.provider, key: row.provider }, row.displayName + '（' + row.models.length + '）'))),
            h('input', {
              className: 'mrsn-input mrsn-search', placeholder: '搜索模型名 / id…', value: query,
              onChange: (event) => setQuery(event.target.value)
            }),
            h('button', {
              className: 'mrsn-btn mrsn-btn-mini', title: '只看待声明能力 / 能力读不到的模型',
              onClick: () => setOnlyGaps((prev) => !prev)
            }, onlyGaps ? '全部模型' : '只看需要处理'),
            h('span', { className: 'mrsn-count' }, models.length + ' / ' + current.models.length + ' 个模型')),
          h('div', { className: 'mrsn-panelbd mrsn-panelbd-tight' },
            h('div', { className: 'mrsn-tr mrsn-models mrsn-thead' },
              h('span', null, '模型'),
              h('span', null, '能力'),
              h('span', null, '思考等级'),
              h('span', null, '输入'),
              h('span', { className: 'mrsn-num' }, 'ctx'),
              h('span', { className: 'mrsn-num' }, '输出'),
              h('span', null, '来源')),
            current.models.length === 0
              ? h('div', { className: 'mrsn-hint', style: { padding: '10px 14px' } }, '该路由没有可编辑的模型条目：未声明 models，且 pi-ai 目录里没有它。请先在「模型」页添加模型。')
              : models.length === 0 ? h('div', { className: 'mrsn-hint', style: { padding: '10px 14px' } }, '没有匹配的模型') : null,
            h('div', { className: 'mrsn-list' }, models.map((model) => h(ModelCard, {
              key: current.provider + '/' + model.id,
              providerRow: current,
              model,
              snapshot,
              callHost,
              onReload: load,
              onNotice: notify
            }))))),
        snapshot !== null && snapshot.writable === false ? h('div', { className: 'mrsn-warn' }, '当前 settings 提供方不可写，只能查看。') : null,
        snapshot !== null && !isAbsent(snapshot.documentPath)
          ? h('div', { className: 'mrsn-hint' }, '写入的是 settings.yaml 的 ', h('code', { className: 'mrsn-mono' }, 'llm-pi-ai'),
            ' 命名空间（', h('code', { className: 'mrsn-mono' }, snapshot.documentPath), '）；只改上面列出的字段，其余配置原样保留。')
          : null,
        notice.length > 0 ? h('div', { className: toastKind === 'ok' ? 'mrsn-toast' : 'mrsn-toast mrsn-toast-err' }, notice) : null)
    }

    const inject = ['slots', 'connection']

    function apply(ctx) {
      const connection = ctx.get('connection')
      if (connection === undefined) throw new Error('dsh-model-reasoning requires the Client connection service')
      const callHost = async (endpoint, payload) => {
        const result = await connection.rpc.call(RPC_CHANNEL, endpoint, payload === undefined ? {} : payload)
        if (result && result.ok === true) return result.value
        const message = result && result.error && typeof result.error.message === 'string' ? result.error.message : 'model-reasoning RPC failed'
        throw new Error(message)
      }
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-model-reasoning', '')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => {
          style.remove()
        }
      }, 'model-reasoning: styles')
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'model-reasoning', order: 12, label: '推理能力' },
        () => h(Section, { callHost })
      ))
      // 输入框工具行的左侧席位：渲染在模型下拉的左边。modelDirectories 是
      // 懒依赖——没有它时设置页照样可用，只是这条滑杆不出现。
      ctx.inject(['slots', 'modelDirectories'], (scope) => {
        const models = scope.modelDirectories
        const sessions = scope.get('sessions')
        scope.slots.inject('conversation.input.left', () => scope.slots.register({
          name: 'conversation.input.left',
          id: 'model-reasoning-effort',
          order: 20,
          label: '推理强度',
          inject: (sessionId) => {
            const directory = models.directoryFor(sessionId)
            const available = sessions === undefined || sessions.subagentAddress(sessionId) === undefined
            return {
              available,
              directory: directory.store,
              load: () => {
                if (available) directory.load().catch(() => {})
              },
              select: (selection) => available
                ? directory.select(selection).then(() => true, () => false)
                : Promise.resolve(false)
            }
          }
        }, EffortSeat))
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
