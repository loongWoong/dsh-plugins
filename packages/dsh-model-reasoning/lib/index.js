/**
 * dsh-model-reasoning — Host half.
 *
 * Model Reasoning: the model-capability editor that DSH's shipped Models page
 * deliberately does not offer, modelled on pi-web's model editor. A settings
 * section ("推理能力") edits, per model, the fields the pi-ai adapter actually
 * honours:
 *
 *  - `reasoningEfforts`   `false` | `{ level: wireValue|null }` over
 *                         off/minimal/low/medium/high/xhigh/max — only `off`
 *                         may map to null (send no parameter), and a custom
 *                         dictionary REPLACES the whole level table;
 *  - `input`              request modalities (`['text']` / `['text','image']`);
 *  - `contextWindow`      effective context budget;
 *  - `maxTokens`          per-model output cap;
 *  - `compat`             per-protocol gates (thinkingFormat, maxTokensField,
 *                         supportsReasoningEffort, …) — only the fields the
 *                         route's protocol really reads are offered;
 *  - `providers.<route>.reasoning`  the route's default reasoning effort.
 *
 * Everything is written through `settings.mutate('llm-pi-ai', ops, expected)`
 * with path-addressed ops only — the whole `models` array (array indices are
 * not addressable), or single `modelOverrides.<id>.<field>` leaves on catalog
 * routes. A provider profile is never replaced wholesale, so `apiKeyEnv`,
 * `baseURL` and any field this package does not know survive every write.
 *
 * RPC channel `/model-reasoning` (loopback-only) serves the settings UI:
 * snapshot, save, test.
 *
 * Consumes host services only (settings, llm, connection; optionally
 * agentDefaultModel and timer); publishes none, so it needs no isolate realm.
 */

export const name = 'model-reasoning'

export const inject = [
  'settings',
  'llm',
  'connection',
]

const NS = 'llm-pi-ai'
/** DSH 原生的「Agent 默认模型选择」命名空间，`reasoningEffort` 是它的一个可选字段。 */
const NS_DEFAULT = 'agent-default-model'
const RPC_CHANNEL = '/model-reasoning'

/** pi-ai 的思考等级，按强度升序（与适配器 THINKING_LEVELS 一致）。 */
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
/**
 * 「顺带声明能力」时给模型补上的等级表。取 openai 系最常见的那一组：`xhigh`/`max`
 * 很多网关不认，所以不默认写进去，需要时在模型卡片里逐档补 wire 值。
 * wire 值＝等级名本身（pi-ai 直接把它发给端点）；`off: null` 表示「不发送参数」，
 * 在 pi-ai 里仍算支持 off（只有映射成非 null 的字符串才会被发出去）。
 */
const DECLARE_LEVELS = ['minimal', 'low', 'medium', 'high']
/** 可声明的请求模态。 */
const MODALITIES = ['text', 'image']
/** 思考参数下发格式（openai-completions）。 */
const THINKING_FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling']
const MAX_TOKENS_FIELDS = ['max_completion_tokens', 'max_tokens']
const CACHE_CONTROL_FORMATS = ['anthropic']

/** 每个协议族可声明的 compat 开关；与适配器 COMPAT_GATES 的 offer 集合一致。 */
const GATES = {
  'openai-completions': [
    { key: 'thinkingFormat', label: '思考参数格式', kind: 'enum', values: THINKING_FORMATS },
    { key: 'supportsReasoningEffort', label: '端点接受 reasoning_effort', kind: 'bool' },
    { key: 'supportsDeveloperRole', label: '用 developer role 传系统提示词', kind: 'bool' },
    { key: 'supportsStore', label: '端点接受 store', kind: 'bool' },
    { key: 'supportsUsageInStreaming', label: '流式返回 usage', kind: 'bool' },
    { key: 'maxTokensField', label: '输出上限字段名', kind: 'enum', values: MAX_TOKENS_FIELDS },
    { key: 'requiresToolResultName', label: 'tool result 需要 name', kind: 'bool' },
    { key: 'requiresAssistantAfterToolResult', label: 'tool 结果后需要 assistant 消息', kind: 'bool' },
    { key: 'requiresThinkingAsText', label: '思考需以 thinking 标签文本回传', kind: 'bool' },
    { key: 'requiresReasoningContentOnAssistantMessages', label: '回放 assistant 需要空 reasoning_content', kind: 'bool' },
    { key: 'supportsStrictMode', label: 'tools 接受 strict', kind: 'bool' },
    { key: 'cacheControlFormat', label: '提示缓存标记格式', kind: 'enum', values: CACHE_CONTROL_FORMATS },
    { key: 'supportsLongCacheRetention', label: '支持长缓存保留', kind: 'bool' }
  ],
  'openai-responses': [
    { key: 'supportsDeveloperRole', label: '用 developer role 传系统提示词', kind: 'bool' },
    { key: 'supportsStrictMode', label: 'tools 接受 strict', kind: 'bool' },
    { key: 'supportsLongCacheRetention', label: '支持长缓存保留', kind: 'bool' }
  ],
  'anthropic-messages': [
    { key: 'forceAdaptiveThinking', label: '强制自适应思考', kind: 'bool' },
    { key: 'allowEmptySignature', label: '允许空 thinking signature', kind: 'bool' },
    { key: 'supportsTemperature', label: '端点接受 temperature', kind: 'bool' },
    { key: 'supportsEagerToolInputStreaming', label: 'tools 接受 eager_input_streaming', kind: 'bool' },
    { key: 'supportsCacheControlOnTools', label: 'tools 接受 cache_control', kind: 'bool' },
    { key: 'supportsStrictTools', label: '接受 Anthropic strict 工具', kind: 'bool' },
    { key: 'supportsLongCacheRetention', label: '支持长缓存保留', kind: 'bool' }
  ]
}

const has = (target, key) => Object.prototype.hasOwnProperty.call(target, key)
const isObj = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const fail = (message) => ({ ok: false, error: String(message) })
/** Client RPC 只走无损 JSON：`undefined` 会被拒，缺字段一律规范化成 null。 */
const orNull = (value) => value === undefined ? null : value

/** 把 settings 层读到的值变成纯 JSON（这些层按契约本就只存 JSON 数据）。 */
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/** 去掉 schemastery 物化出来的空壳（input: [] / compat: {}），避免把噪声写回文档。 */
function tidy(entry) {
  const next = {}
  for (const key of Object.keys(entry)) {
    const value = entry[key]
    if (value === undefined) continue
    if (Array.isArray(value) && value.length === 0 && key === 'input') continue
    if (isObj(value) && Object.keys(value).length === 0 && key === 'compat') continue
    next[key] = value
  }
  return next
}

/** 复刻适配器对 reasoningEfforts 的校验，让错误在界面上就能看见。 */
function validateEfforts(dict) {
  if (dict === false || dict === null) return undefined
  if (!isObj(dict)) return 'reasoningEfforts 必须是 false 或等级字典'
  const keys = Object.keys(dict)
  if (keys.length === 0) return 'reasoningEfforts 不能是空字典：要么声明等级，要么设为「不支持」，要么恢复继承'
  let beyondOff = false
  for (const key of keys) {
    if (LEVELS.indexOf(key) < 0) return `未知思考等级 "${key}"`
    const wire = dict[key]
    if (wire === null) {
      if (key !== 'off') return `只有 off 可以不填 wire 值（${key} 必须填写要发送的值）`
    } else if (typeof wire !== 'string' || wire.length === 0) {
      return `${key} 需要填写要发送的 wire 值，且不能是空字符串`
    }
    if (key !== 'off') beyondOff = true
  }
  if (!beyondOff) return '至少要声明一个 off 以外的等级，否则该模型仍然不会推理'
  return undefined
}

/** 把界面上的 patch 应用到一个 models 条目上；值为 null 表示删除该字段。 */
function patchEntry(entry, patch) {
  const next = tidy(entry)
  if (has(patch, 'reasoningEfforts')) {
    const value = patch.reasoningEfforts
    if (value === null) delete next.reasoningEfforts
    else next.reasoningEfforts = value
  }
  for (const key of ['input', 'contextWindow', 'maxTokens', 'name']) {
    if (!has(patch, key)) continue
    const value = patch[key]
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) delete next[key]
    else next[key] = value
  }
  if (has(patch, 'compat')) {
    const compat = Object.assign({}, isObj(next.compat) ? next.compat : {})
    for (const key of Object.keys(patch.compat)) {
      const value = patch.compat[key]
      if (value === null || value === undefined) delete compat[key]
      else compat[key] = value
    }
    if (Object.keys(compat).length > 0) next.compat = compat
    else delete next.compat
  }
  return next
}

function descriptorOf(settings) {
  return settings.describe({ redactSecrets: true }).find((item) => item.ns === NS)
}

function gateOf(api) {
  return GATES[api] === undefined ? GATES['openai-completions'] : GATES[api]
}

/**
 * 一条路由上「所有模型都支持」的等级交集。
 *
 * 请求路径对不支持的等级直接抛 `UNSUPPORTED_REASONING_EFFORT`（llm-pi-ai 的
 * `resolveReasoningLevel`），**不会**自动降级。所以路由级默认必须落在交集里，
 * 否则路由里能力较弱的那个模型每次请求都会失败。
 */
function sharedEfforts(models) {
  const lists = models.map((model) => model.effective.efforts)
  if (lists.length === 0) return []
  return LEVELS.filter((level) => lists.every((list) => list.indexOf(level) >= 0))
}

/**
 * 把一条路由的模型分成「能力已知」和「能力待声明」两类。
 *
 * 关键事实（`@earendil-works/pi-ai` 的 `getSupportedThinkingLevels`）：条目上
 * **没有** `reasoningEfforts` 的模型——手填的、以及目录里被标成不推理的——在 pi-ai
 * 眼里只支持 `off`。所以「路由默认写 high 会让它每次请求都失败」，但这是**配置问题**：
 * 条目补上 `reasoningEfforts` 就声明了能力，`resolveModelReasoning` 随即把
 * `reasoning` 置为 true 并带上 `thinkingLevelMap`。这类模型不是死路，是**待声明**。
 *
 * 与之相对，显式写了 `reasoningEfforts: false` 的模型是用户明确说过「它不推理」，
 * 本包不擅自改它，它会挡住路由的思考档位默认。
 *
 * @param {Array<{id:string, userEntry:object|null, effective:{efforts:string[], error?:string}}>} models
 * @returns {{shared:string[], potential:string[], undeclared:string[], offDeclared:string[],
 *   unresolved:Array<{id:string,error:string}>}}
 *   `potential` 是把待声明的模型补齐之后，路由默认还能落在的等级。
 */
function routeCapability(models) {
  const fixed = []
  const undeclared = []
  const offDeclared = []
  const unresolved = []
  for (const model of models) {
    const entry = model.userEntry
    const declaredHere = isObj(entry) && has(entry, 'reasoningEfforts')
    if (declaredHere && entry.reasoningEfforts === false) offDeclared.push(model.id)
    if ((model.effective.error || '').length > 0 && !declaredHere) {
      unresolved.push({ id: model.id, error: model.effective.error })
      continue
    }
    if ((model.effective.efforts || []).length === 0) {
      // 声明过（false 或只写了 off）的按「已知」处理，不擅自覆盖；没声明过的才是待声明。
      if (declaredHere) fixed.push(model)
      else undeclared.push(model.id)
    } else {
      fixed.push(model)
    }
  }
  let potential = LEVELS.slice()
  for (const model of fixed) {
    // 显式 reasoningEfforts:false 的模型在 pi-ai 里仍支持 off，所以它只挡思考档位。
    const list = model.effective.efforts.length > 0 ? model.effective.efforts : ['off']
    potential = potential.filter((level) => list.indexOf(level) >= 0)
  }
  return { shared: sharedEfforts(models), potential, undeclared, offDeclared, unresolved }
}

/** 在候选等级里挑离 `level` 最近的一个；同样远时取更低的（不会偷偷加码）。 */
function nearestLevel(candidates, level) {
  const index = LEVELS.indexOf(level)
  let best = candidates[0]
  let bestGap = Math.abs(LEVELS.indexOf(best) - index)
  for (const candidate of candidates) {
    const gap = Math.abs(LEVELS.indexOf(candidate) - index)
    if (gap < bestGap || (gap === bestGap && LEVELS.indexOf(candidate) < LEVELS.indexOf(best))) {
      best = candidate
      bestGap = gap
    }
  }
  return best
}

/** 「顺带声明能力」写给一个模型的 `reasoningEfforts` 字典。 */
function declareDict(level) {
  const dict = { off: null }
  for (const item of DECLARE_LEVELS) dict[item] = item
  if (level !== 'off' && DECLARE_LEVELS.indexOf(level) < 0) dict[level] = level
  return dict
}

/**
 * 「顺带声明能力」的写入 op。models 列表路由整体回写数组（路径 op 不能按下标
 * 寻址），catalog 路由逐条写 `modelOverrides.<id>.reasoningEfforts`。两种都只改
 * 命中的条目，其余字段（含 `apiKeyEnv`、未知字段）由 `patchEntry` 原样带着。
 */
function declareOps(provider, profile, userProfile, ids, dict) {
  const ops = []
  const userModelList = Array.isArray(userProfile.models) ? userProfile.models : undefined
  const configModelList = Array.isArray(profile.models) ? profile.models : undefined
  if (userModelList !== undefined || configModelList !== undefined) {
    const list = (userModelList !== undefined ? userModelList : configModelList).slice()
    let touched = 0
    for (let i = 0; i < list.length; i += 1) {
      if (!isObj(list[i]) || ids.indexOf(list[i].id) < 0) continue
      list[i] = patchEntry(list[i], { reasoningEfforts: dict })
      touched += 1
    }
    if (touched === 0) return { error: '待声明能力的模型不在该路由的 models 列表里' }
    ops.push({ op: 'set', path: ['providers', provider, 'models'], value: list })
    return { ops, entries: touched }
  }
  for (const id of ids) {
    ops.push({ op: 'set', path: ['providers', provider, 'modelOverrides', id, 'reasoningEfforts'], value: dict })
  }
  return { ops, entries: ids.length }
}

/**
 * 把用户选定的全局档位适配到一条路由：能用就用；能力没声明就先声明再写；声明过但
 * 不支持就就近换一个；确实没有一个模型能思考就不写（保留端点自身行为）。
 *
 * 用户要「有思考」的档位时，回落只在 off 以外挑——否则只支持 off/high 两端的路由
 * 会被静默关掉思考。
 *
 * @param {string} level 用户选定的档位
 * @param {string[]} shared 现在就能用的交集
 * @param {{potential:string[],undeclared:string[],offDeclared:string[]}} [cap] 缺省时退化为只看 shared
 */
function adaptLevel(level, shared, cap) {
  const undeclared = cap === undefined || cap.undeclared === undefined ? [] : cap.undeclared
  const potential = cap === undefined || cap.potential === undefined ? shared : cap.potential
  const offDeclared = cap === undefined || cap.offDeclared === undefined ? [] : cap.offDeclared
  const unresolved = cap === undefined || cap.unresolved === undefined ? [] : cap.unresolved
  if (shared.indexOf(level) >= 0) return { level, mode: 'exact', declare: [], note: '' }
  if (unresolved.length > 0) {
    // 读不到能力就既不写也不自动声明：猜错会让这个模型每次请求都失败。
    return {
      level: null,
      mode: 'none',
      declare: [],
      note: unresolved.length + ' 个模型的能力解析失败（' + unresolved[0].id + '：' + unresolved[0].error + '）'
    }
  }
  if (level === 'off' && potential.indexOf('off') >= 0) {
    // 没有推理元数据的模型只支持 off，所以写 off 不需要先声明任何东西。
    return {
      level: 'off',
      mode: 'exact',
      declare: [],
      note: undeclared.length === 0 ? '' : '未声明能力的模型只支持关闭思考，off 不用先声明'
    }
  }
  if (undeclared.length > 0) {
    const candidates = potential.filter((item) => item !== 'off')
    if (candidates.length === 0) {
      return {
        level: null,
        mode: 'none',
        declare: [],
        note: offDeclared.length > 0
          ? '模型 ' + offDeclared.join('、') + ' 被显式设为不支持推理，路由默认写思考档位会让它每次请求都失败'
          : '本路由已声明能力的模型没有可思考的等级'
      }
    }
    const target = nearestLevel(candidates, level)
    const names = undeclared.length <= 2 ? undeclared.join('、') : undeclared.slice(0, 2).join('、') + ' 等 ' + undeclared.length + ' 个'
    return {
      level: target,
      mode: 'declare',
      declare: undeclared,
      note: '先给 ' + names + ' 声明 off/' + DECLARE_LEVELS.join('/') + '，再写 ' + target
        + (target === level ? '' : '（本路由不支持 ' + level + '，就近）')
    }
  }
  const candidates = level === 'off' ? shared : shared.filter((item) => item !== 'off')
  if (candidates.length === 0) {
    if (offDeclared.length > 0) {
      return {
        level: null,
        mode: 'none',
        declare: [],
        note: '模型 ' + offDeclared.join('、') + ' 被显式设为不支持推理，路由默认写思考档位会让它每次请求都失败'
      }
    }
    return { level: null, mode: 'none', declare: [], note: level === 'off' ? '该路由没有可推理的模型，无需设置' : '该路由没有支持思考的模型，保持不写入' }
  }
  const best = nearestLevel(candidates, level)
  return { level: best, mode: 'fallback', declare: [], note: '本路由不支持 ' + level + '，就近用 ' + best }
}

/** Exposed for `test/unit.mjs`; not part of any runtime contract. */
export const _internal = {
  NS,
  NS_DEFAULT,
  RPC_CHANNEL,
  LEVELS,
  DECLARE_LEVELS,
  GATES,
  orNull,
  plain,
  tidy,
  validateEfforts,
  patchEntry,
  gateOf,
  sharedEfforts,
  routeCapability,
  declareDict,
  declareOps,
  nearestLevel,
  adaptLevel,
}

export function apply(ctx) {
  const settings = ctx.settings
  const llm = ctx.llm

  /** 一次读全量：provider 路由 → 模型条目（配置层 + 生效层）。 */
  async function snapshot() {
    const descriptor = descriptorOf(settings)
    if (descriptor === undefined) return fail(`settings 未注册命名空间 "${NS}"（llm-pi-ai 适配器未挂载）`)
    const value = plain(descriptor.value) || {}
    const user = plain(descriptor.user) || {}
    const configProviders = isObj(value.providers) ? value.providers : {}
    const userProviders = isObj(user.providers) ? user.providers : {}

    const live = new Set(llm.listProviders().map((item) => item.id))
    const directory = llm.listConfigurableProviders().filter((entry) => entry.settingsNs === NS)

    let defaultSelection = null
    const defaults = ctx.get('agentDefaultModel')
    if (defaults !== undefined) {
      try {
        const picked = defaults.currentSelection()
        if (isObj(picked)) {
          defaultSelection = {
            provider: typeof picked.provider === 'string' ? picked.provider : '',
            model: typeof picked.model === 'string' ? picked.model : '',
            reasoningEffort: typeof picked.reasoningEffort === 'string' ? picked.reasoningEffort : ''
          }
        }
      } catch (error) {
        console.error('[model-reasoning] agentDefaultModel 读取失败', error)
      }
    }

    const providers = []
    for (const entry of directory) {
      const provider = entry.provider
      const profile = isObj(configProviders[provider]) ? configProviders[provider] : {}
      const userProfile = isObj(userProviders[provider]) ? userProviders[provider] : {}
      const api = typeof profile.api === 'string' ? profile.api : ''
      const userModelList = Array.isArray(userProfile.models) ? userProfile.models : undefined
      const configModelList = Array.isArray(profile.models) ? profile.models : undefined
      // models 列表存在时，能力必须写在条目上；否则（catalog 路由）写 modelOverrides。
      const target = userModelList !== undefined || configModelList !== undefined ? 'models' : 'overrides'
      const list = userModelList !== undefined ? userModelList : configModelList

      let rows = []
      if (list !== undefined) {
        rows = list.filter((item) => isObj(item) && typeof item.id === 'string').map((item) => ({ id: item.id, name: item.name }))
      } else {
        try {
          const listed = await llm.listModels(provider)
          rows = listed.map((item) => ({ id: item.id, name: item.name }))
        } catch (error) {
          rows = []
        }
      }

      const models = []
      for (const row of rows) {
        const userEntry = list !== undefined ? list.find((item) => isObj(item) && item.id === row.id) : (
          isObj(userProfile.modelOverrides) && isObj(userProfile.modelOverrides[row.id]) ? userProfile.modelOverrides[row.id] : undefined
        )
        const configEntry = list !== undefined ? configModelList.find((item) => isObj(item) && item.id === row.id) : (
          isObj(profile.modelOverrides) && isObj(profile.modelOverrides[row.id]) ? profile.modelOverrides[row.id] : undefined
        )
        let effective
        try {
          const info = await llm.resolveModelInfo(provider, row.id)
          effective = {
            efforts: info.reasoning === undefined ? [] : info.reasoning.efforts.map((item) => item.id),
            defaultEffort: info.reasoning === undefined || info.reasoning.defaultEffort === undefined ? '' : String(info.reasoning.defaultEffort),
            input: info.inputModalities === undefined ? [] : [...info.inputModalities],
            contextWindow: info.context === undefined ? null : orNull(info.context.contextWindow),
            maxTokens: orNull(info.defaultMaxTokens),
            error: ''
          }
        } catch (error) {
          // 解析失败与「解析成功但没有推理元数据」是两件事：前者不能当成后者去自动
          // 声明能力，界面也得说清楚为什么这一行的能力是空的。
          effective = {
            efforts: [],
            defaultEffort: '',
            input: [],
            contextWindow: null,
            maxTokens: null,
            error: error instanceof Error ? error.message : String(error)
          }
        }
        models.push({
          id: row.id,
          name: row.name === undefined || row.name === '' ? row.id : row.name,
          target,
          // 能力来源分类：界面据此说明「为什么这条路由现在写不了思考档位」。
          // undeclared = 条目上没有 reasoningEfforts，pi-ai 因此只认 off，补上声明即可用。
          capability: isObj(userEntry) && has(userEntry, 'reasoningEfforts')
            ? (userEntry.reasoningEfforts === false ? 'off' : 'declared')
            : effective.efforts.length > 0 ? 'catalog' : effective.error === '' ? 'undeclared' : 'unknown',
          // plain() 顺带把 schemastery 层里可能的 undefined 叶子整体抹掉。
          userEntry: userEntry === undefined ? null : plain(tidy(userEntry)),
          configEntry: configEntry === undefined ? null : plain(tidy(configEntry)),
          effective
        })
      }

      // 全局滑块的适配表：每个档位落到这条路由上实际会写成什么。
      const cap = routeCapability(models)
      const shared = cap.shared
      const adaptsTo = {}
      for (const level of LEVELS) adaptsTo[level] = adaptLevel(level, shared, cap)

      providers.push({
        provider,
        displayName: entry.displayName === undefined || entry.displayName === '' ? provider : entry.displayName,
        declared: entry.declared === true,
        live: live.has(provider),
        configured: isObj(userProviders[provider]) || isObj(configProviders[provider]),
        api,
        gateFields: gateOf(api),
        defaultReasoning: typeof profile.reasoning === 'string' ? profile.reasoning : '',
        configuredDefaultReasoning: typeof userProfile.reasoning === 'string' ? userProfile.reasoning : '',
        sharedEfforts: shared,
        potentialEfforts: cap.potential,
        undeclared: cap.undeclared,
        offDeclared: cap.offDeclared,
        unresolved: cap.unresolved.map((item) => item.id),
        adaptsTo,
        baseURL: typeof profile.baseURL === 'string' ? profile.baseURL : '',
        models
      })
    }

    // 全局滑块的当前值：所有已配置路由的默认等级完全一致才算「已统一」。
    const routeDefaults = providers.filter((row) => row.configured).map((row) => row.configuredDefaultReasoning)
    const globalDefault = routeDefaults.length > 0 && routeDefaults.every((item) => item === routeDefaults[0]) ? routeDefaults[0] : ''

    return {
      ok: true,
      revision: descriptor.revision,
      applies: descriptor.applies,
      documentPath: orNull(settings.documentPath),
      writable: settings.writable,
      levels: LEVELS,
      globalDefault,
      globalMixed: routeDefaults.length > 0 && routeDefaults.some((item) => item !== routeDefaults[0]),
      defaultSelectionEffort: defaultSelection === null ? '' : defaultSelection.reasoningEffort,
      meta: {
        levels: LEVELS,
        modalities: MODALITIES,
        thinkingFormats: THINKING_FORMATS,
        maxTokensFields: MAX_TOKENS_FIELDS,
        cacheControlFormats: CACHE_CONTROL_FORMATS
      },
      defaultSelection,
      providers
    }
  }

  /** 一次写：provider 默认推理强度 + 单模型能力 patch。 */
  async function save(args) {
    if (!isObj(args)) return fail('缺少参数')
    const provider = typeof args.provider === 'string' ? args.provider : ''
    if (provider.length === 0) return fail('缺少 provider')
    const descriptor = descriptorOf(settings)
    if (descriptor === undefined) return fail(`settings 未注册命名空间 "${NS}"`)
    const value = plain(descriptor.value) || {}
    const user = plain(descriptor.user) || {}
    const configProviders = isObj(value.providers) ? value.providers : {}
    const userProviders = isObj(user.providers) ? user.providers : {}
    if (!isObj(configProviders[provider]) && !isObj(userProviders[provider])) return fail(`Provider "${provider}" 尚未配置`)
    const profile = isObj(configProviders[provider]) ? configProviders[provider] : {}
    const userProfile = isObj(userProviders[provider]) ? userProviders[provider] : {}

    const ops = []

    if (has(args, 'providerReasoning')) {
      const level = args.providerReasoning
      if (level === null || level === '' || level === 'inherit') {
        ops.push({ op: 'unset', path: ['providers', provider, 'reasoning'] })
      } else {
        if (LEVELS.indexOf(level) < 0) return fail(`未知默认推理强度 "${String(level)}"`)
        ops.push({ op: 'set', path: ['providers', provider, 'reasoning'], value: level })
      }
    }

    const model = typeof args.model === 'string' ? args.model : ''
    const patch = isObj(args.modelPatch) ? args.modelPatch : undefined
    if (patch !== undefined) {
      if (model.length === 0) return fail('缺少 model')
      if (has(patch, 'reasoningEfforts')) {
        const error = validateEfforts(patch.reasoningEfforts)
        if (error !== undefined) return fail(error)
      }
      for (const key of ['contextWindow', 'maxTokens']) {
        const candidate = patch[key]
        if (has(patch, key) && candidate !== null) {
          if (typeof candidate !== 'number' || !Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate < 1) {
            return fail(`${key} 必须是正整数`)
          }
        }
      }
      const userModelList = Array.isArray(userProfile.models) ? userProfile.models : undefined
      const configModelList = Array.isArray(profile.models) ? profile.models : undefined
      if (userModelList !== undefined || configModelList !== undefined) {
        const list = userModelList !== undefined ? userModelList : configModelList
        let index = -1
        for (let i = 0; i < list.length; i += 1) {
          if (isObj(list[i]) && list[i].id === model) {
            index = i
            break
          }
        }
        if (index < 0) return fail(`模型 "${model}" 不在 Provider "${provider}" 的 models 列表中`)
        const next = list.slice()
        next[index] = patchEntry(list[index], patch)
        ops.push({ op: 'set', path: ['providers', provider, 'models'], value: next })
      } else {
        // catalog 路由：modelOverrides 按字段寻址，其余目录条目原样服务。
        if (has(patch, 'reasoningEfforts')) {
          const candidate = patch.reasoningEfforts
          if (candidate === null) ops.push({ op: 'unset', path: ['providers', provider, 'modelOverrides', model, 'reasoningEfforts'] })
          else ops.push({ op: 'set', path: ['providers', provider, 'modelOverrides', model, 'reasoningEfforts'], value: candidate })
        }
        for (const key of ['input', 'contextWindow', 'maxTokens', 'name']) {
          if (!has(patch, key)) continue
          const candidate = patch[key]
          const path = ['providers', provider, 'modelOverrides', model, key]
          if (candidate === null || candidate === '' || (Array.isArray(candidate) && candidate.length === 0)) ops.push({ op: 'unset', path })
          else ops.push({ op: 'set', path, value: candidate })
        }
        if (has(patch, 'compat') && isObj(patch.compat)) {
          for (const key of Object.keys(patch.compat)) {
            const candidate = patch.compat[key]
            const path = ['providers', provider, 'modelOverrides', model, 'compat', key]
            if (candidate === null || candidate === undefined) ops.push({ op: 'unset', path })
            else ops.push({ op: 'set', path, value: candidate })
          }
        }
      }
    }

    if (ops.length === 0) return { ok: true, noop: true, revision: descriptor.revision }
    const expected = typeof args.expectedRevision === 'number' ? args.expectedRevision : descriptor.revision
    try {
      await settings.mutate(NS, ops, expected)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
    const next = descriptorOf(settings)
    return { ok: true, revision: next === undefined ? null : orNull(next.revision), ops: ops.length }
  }

  /**
   * 全局默认推理强度：把滑动条选定的档位**按路由能力适配**后一次原子写入所有
   * 勾选的路由（`providers.<route>.reasoning`），可选同时写进
   * `agent-default-model.reasoningEffort`（DSH 原生的全局默认模型选择）。
   *
   * 适配是必须的：请求路径对不支持的等级直接报错，不会降级。
   *
   * `declare: true` 时，能力还没声明的模型会**先补上 `reasoningEfforts`**（和路由
   * 默认同一个 `mutate`，一起成功或一起失败），这样「模型其实会思考、只是没配」
   * 的路由也能一键可用。
   */
  async function applyGlobal(args) {
    if (!isObj(args)) return fail('缺少参数')
    const level = typeof args.level === 'string' ? args.level : ''
    if (LEVELS.indexOf(level) < 0) return fail(`未知推理强度 "${String(level)}"`)
    const requested = Array.isArray(args.providers) ? args.providers.filter((item) => typeof item === 'string') : []
    if (requested.length === 0) return fail('没有要应用的路由')
    const descriptor = descriptorOf(settings)
    if (descriptor === undefined) return fail(`settings 未注册命名空间 "${NS}"`)
    const declare = args.declare === true

    // 复用 snapshot 的生效能力，保证「界面预览」和「实际写入」用同一份判定。
    const snap = await snapshot()
    if (!snap.ok) return snap
    const rows = {}
    for (const row of snap.providers) rows[row.provider] = row

    const configValue = plain(descriptor.value) || {}
    const userValue = plain(descriptor.user) || {}
    const configProviders = isObj(configValue.providers) ? configValue.providers : {}
    const userProviders = isObj(userValue.providers) ? userValue.providers : {}
    const ops = []
    const plan = []
    let changed = 0
    let declared = 0
    for (const provider of requested) {
      const row = rows[provider]
      if (row === undefined || row.configured !== true) {
        plan.push({ provider, written: null, mode: 'skip', note: '该路由尚未配置' })
        continue
      }
      const adaptation = row.adaptsTo[level] === undefined ? adaptLevel(level, row.sharedEfforts, row) : row.adaptsTo[level]
      if (adaptation.mode === 'none') {
        plan.push({ provider, written: null, mode: 'none', note: adaptation.note })
        continue
      }
      if (adaptation.mode === 'declare' && !declare) {
        plan.push({ provider, written: null, mode: 'declare', note: '未勾选「顺带声明能力」：' + adaptation.note })
        continue
      }
      if (adaptation.mode === 'declare') {
        const profile = isObj(configProviders[provider]) ? configProviders[provider] : {}
        const userProfile = isObj(userProviders[provider]) ? userProviders[provider] : {}
        const built = declareOps(provider, profile, userProfile, adaptation.declare, declareDict(adaptation.level))
        if (built.error !== undefined) {
          plan.push({ provider, written: null, mode: 'none', note: built.error })
          continue
        }
        for (const op of built.ops) ops.push(op)
        declared += built.entries
      }
      if (row.configuredDefaultReasoning === adaptation.level) {
        plan.push({
          provider,
          written: adaptation.level,
          mode: adaptation.mode,
          note: adaptation.mode === 'declare' ? '路由默认已是该值，只补能力声明' : '已是该值'
        })
        continue
      }
      ops.push({ op: 'set', path: ['providers', provider, 'reasoning'], value: adaptation.level })
      changed += 1
      plan.push({ provider, written: adaptation.level, mode: adaptation.mode, note: adaptation.note })
    }

    let revision = descriptor.revision
    if (ops.length > 0) {
      const expected = typeof args.expectedRevision === 'number' ? args.expectedRevision : descriptor.revision
      try {
        await settings.mutate(NS, ops, expected)
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error))
      }
      const next = descriptorOf(settings)
      revision = next === undefined ? null : orNull(next.revision)
    }

    let defaultWritten = false
    if (args.alsoDefault === true) {
      const defaults = settings.describe({ redactSecrets: true }).find((item) => item.ns === NS_DEFAULT)
      if (defaults === undefined) {
        return { ok: true, plan, revision, defaultWritten: false, declared, changed, defaultNote: '未注册 agent-default-model 命名空间，已跳过' }
      }
      try {
        await settings.mutate(NS_DEFAULT, [{ op: 'set', path: ['reasoningEffort'], value: level }], defaults.revision)
        defaultWritten = true
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error))
      }
    }

    return { ok: true, plan, revision, defaultWritten, declared, changed }
  }

  /** 用一次极小请求验证「这个模型 + 这个推理强度」真的能推理。 */
  async function test(args) {
    if (!isObj(args)) return fail('缺少参数')
    const provider = typeof args.provider === 'string' ? args.provider : ''
    const model = typeof args.model === 'string' ? args.model : ''
    if (provider.length === 0 || model.length === 0) return fail('缺少 provider / model')
    const effort = typeof args.effort === 'string' && args.effort.length > 0 ? args.effort : undefined
    const message = {
      id: 'model-reasoning-probe',
      role: 'user',
      content: [{ type: 'text', text: '只回复两个字母：OK' }],
      source: { kind: 'plugin', plugin: 'dsh-model-reasoning' }
    }
    let reasoningChars = 0
    let text = ''
    let finish = ''
    let error = ''
    const run = (async () => {
      const stream = llm.stream({
        provider,
        model,
        ...(effort === undefined ? {} : { reasoningEffort: effort }),
        messages: [message],
        maxTokens: 64
      })
      for await (const chunk of stream) {
        if (chunk.type === 'reasoning-delta') reasoningChars += chunk.text.length
        else if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'finish') {
          finish = chunk.reason.kind
          if (chunk.reason.failure !== undefined) error = chunk.reason.failure.message
        }
        if (text.length + reasoningChars > 4000) break
      }
    })()
    const timer = ctx.get('timer')
    try {
      if (timer === undefined) await run
      else {
        const guard = timer.timeout(45000).then(() => {
          throw new Error('测试超时（45s）：端点没有在该时间内返回')
        })
        await Promise.race([run, guard])
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }
    if (finish === 'error' || finish === 'aborted') return fail(error === '' ? `请求失败（${finish}）` : error)
    return {
      ok: true,
      effort: effort === undefined ? '(默认)' : effort,
      reasoningChars,
      reasoning: reasoningChars > 0,
      text: text.slice(0, 120),
      finish
    }
  }

  // ---------- settings-page RPC (loopback-only) ----------

  function rpcOk(value) {
    return { ok: true, value }
  }
  function rpcError(message) {
    return { ok: false, error: { message: String(message) } }
  }

  ctx.effect(() => ctx.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload) => {
    try {
      const args = payload !== undefined && payload !== null && typeof payload === 'object' ? payload : {}
      // 每个 handler 自己返回 { ok, … }，UI 直接看 value，传输层错误才走 rpcError。
      if (endpoint === 'snapshot') return rpcOk(await snapshot())
      if (endpoint === 'save') return rpcOk(await save(args))
      if (endpoint === 'applyGlobal') return rpcOk(await applyGlobal(args))
      if (endpoint === 'test') return rpcOk(await test(args))
      return rpcError('unknown model-reasoning endpoint: ' + String(endpoint))
    } catch (error) {
      return rpcError(error instanceof Error ? error.message : String(error))
    }
  }, { authority: 'loopback' }), 'model-reasoning: rpc')

  console.log('[model-reasoning] active (rpc channel ' + RPC_CHANNEL + ', namespace ' + NS + ')')
}
