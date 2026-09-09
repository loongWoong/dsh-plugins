/**
 * dsh-model-reasoning unit tests.
 *
 * Run: node test/unit.mjs
 *
 * Self-contained: the Host half has no imports at all, and the Client half is
 * loaded through a stubbed `window.__ModuleLoader__` with a stub React inside a
 * `node:vm` realm. No DSH host process, no installed peer dependencies.
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { apply, inject, name, _internal as t } from '../lib/index.js'

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL: ' + msg)
    process.exitCode = 1
  } else console.log('ok: ' + msg)
}

// ---------- package shape ----------

assert(name === 'model-reasoning', 'exported name is model-reasoning')
assert(inject.includes('settings') && inject.includes('llm') && inject.includes('connection'), 'inject declares settings, llm, connection')
assert(t.NS === 'llm-pi-ai', 'writes into the llm-pi-ai namespace')
assert(t.RPC_CHANNEL === '/model-reasoning', 'rpc channel is /model-reasoning')

// ---------- validateEfforts (mirrors the adapter's own rules) ----------

assert(t.validateEfforts(false) === undefined, 'false = model does not reason, accepted')
assert(t.validateEfforts(null) === undefined, 'null = back to inherited, accepted')
assert(typeof t.validateEfforts({}) === 'string', 'empty dictionary rejected')
assert(typeof t.validateEfforts({ off: null }) === 'string', 'off alone rejected — still no reasoning')
assert(t.validateEfforts({ off: null, high: 'high' }) === undefined, 'off + one level accepted')
assert(t.validateEfforts({ off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' }) === undefined, 'the usual five levels accepted')
assert(typeof t.validateEfforts({ high: null }) === 'string', 'only off may map to null')
assert(typeof t.validateEfforts({ off: '', high: 'high' }) === 'string', 'empty off wire is treated as a value and rejected')
assert(typeof t.validateEfforts({ off: null, turbo: 'turbo' }) === 'string', 'unknown level rejected')
assert(typeof t.validateEfforts({ off: null, high: '' }) === 'string', 'non-off wire value may not be empty')
assert(typeof t.validateEfforts('nope') === 'string', 'non-object rejected')

// ---------- tidy / patchEntry ----------

const raw = { id: 'm', name: 'M', reasoningEfforts: { off: null }, input: [], compat: {}, vendorId: 'keep-me' }
const cleaned = t.tidy(raw)
assert(cleaned.input === undefined && cleaned.compat === undefined, 'tidy drops materialized empty input/compat')
assert(cleaned.vendorId === 'keep-me', 'tidy keeps fields this package does not know')

const patched = t.patchEntry(raw, {
  reasoningEfforts: { off: null, low: 'low', high: 'high' },
  input: ['text', 'image'],
  contextWindow: 512000,
  maxTokens: 32768,
  compat: { thinkingFormat: 'deepseek', supportsStore: false }
})
assert(patched.vendorId === 'keep-me' && patched.id === 'm' && patched.name === 'M', 'patchEntry preserves unknown and identity fields')
assert(patched.reasoningEfforts.high === 'high', 'reasoningEfforts written')
assert(patched.input.length === 2 && patched.compat.thinkingFormat === 'deepseek', 'input and compat written')
const reverted = t.patchEntry(patched, { reasoningEfforts: null, input: null, contextWindow: null, maxTokens: null, compat: { thinkingFormat: null, supportsStore: null } })
assert(reverted.reasoningEfforts === undefined && reverted.input === undefined && reverted.compat === undefined
  && reverted.contextWindow === undefined && reverted.maxTokens === undefined, 'null deletes each field, so the model inherits again')
assert(reverted.vendorId === 'keep-me', 'reverting capabilities still keeps unknown fields')

// ---------- per-protocol compat gates ----------

assert(t.gateOf('anthropic-messages').length === 7, 'anthropic-messages offers its 7 compat gates')
assert(t.gateOf('openai-completions').length === 13, 'openai-completions offers its 13 compat gates')
assert(t.gateOf('openai-responses') === t.gateOf('openai-responses') && t.gateOf('weird-api') === t.gateOf('openai-completions'), 'unknown protocol falls back to openai-completions')
assert(t.gateOf('anthropic-messages').every((f) => f.key !== 'thinkingFormat'), 'thinkingFormat is not offered on anthropic-messages')

// ---------- Host RPC against stubbed services ----------

/** Client RPC accepts lossless JSON only — undefined anywhere is a bug. */
function assertLossless(value, path) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number at ' + path)
    return true
  }
  if (value === undefined) throw new Error('undefined at ' + path)
  if (typeof value !== 'object') throw new Error(typeof value + ' at ' + path)
  if (Object.prototype.toString.call(value) !== '[object Object]' && !Array.isArray(value)) {
    throw new Error(Object.prototype.toString.call(value) + ' at ' + path)
  }
  for (const key of Object.keys(value)) assertLossless(value[key], path + '.' + key)
  return true
}

const settingsValue = {
  providers: {
    a217: {
      displayName: 'a217',
      api: 'openai-completions',
      baseURL: 'http://192.168.22.217:8000/v1',
      apiKeyEnv: 'A217_KEY',
      models: [
        { id: 'qwen3.8-flash-next', name: 'qwen3.8flash', contextWindow: 1048576, input: [], compat: {} },
        { id: 'deepseek-v4-flash', name: 'deepseek', reasoningEfforts: { off: null, high: 'high' } }
      ]
    },
    deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
    // 两个模型都只支持 off/low/medium/high：全局档位必须能落到这个交集里
    a174: {
      displayName: 'a174',
      api: 'openai-completions',
      models: [{ id: 'm-a', name: 'A' }, { id: 'm-b', name: 'B' }]
    },
    // 条目上没写 reasoningEfforts：能力待声明（可以修），不是模型不会思考
    a199: {
      displayName: 'a199',
      api: 'openai-completions',
      models: [{ id: 'plain-model', name: 'Plain', vendorId: 'keep-me' }]
    },
    // 显式写了 reasoningEfforts: false：本包不擅自改，它会挡住思考档位
    a000: {
      displayName: 'a000',
      api: 'openai-completions',
      models: [{ id: 'nothink', name: 'Nothink', reasoningEfforts: false }]
    }
  }
}
const defaultSelectionValue = { provider: 'a217', model: 'qwen3.8-flash-next' }
let revision = 7
let defaultRevision = 3
let mutation = null
const mutations = []
const settings = {
  documentPath: 'C:/home/.dsh/settings.yaml',
  writable: true,
  describe() {
    return [
      { ns: 'llm-pi-ai', value: settingsValue, user: settingsValue, revision, applies: 'live' },
      { ns: 'agent-default-model', value: defaultSelectionValue, user: defaultSelectionValue, revision: defaultRevision, applies: 'live' }
    ]
  },
  async mutate(ns, ops, expected) {
    const current = ns === 'agent-default-model' ? defaultRevision : revision
    if (typeof expected === 'number' && expected !== current) throw new Error('settings revision moved: expected ' + expected + ', now ' + current)
    // 真的落到 stub 文档上，后续快照才能看到上一次写入的结果
    const root = ns === 'agent-default-model' ? defaultSelectionValue : settingsValue
    for (const one of ops) {
      let node = root
      for (let i = 0; i < one.path.length - 1; i += 1) {
        if (typeof node[one.path[i]] !== 'object' || node[one.path[i]] === null) node[one.path[i]] = {}
        node = node[one.path[i]]
      }
      if (one.op === 'unset') delete node[one.path[one.path.length - 1]]
      else node[one.path[one.path.length - 1]] = one.value
    }
    if (ns === 'agent-default-model') defaultRevision += 1
    else revision += 1
    mutation = { ns, ops, expected }
    mutations.push({ ns, ops, expected })
    return current + 1
  }
}
const llm = {
  listProviders: () => [{ id: 'a217', name: 'a217' }],
  listConfigurableProviders: () => [
    { provider: 'a217', displayName: 'a217', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'a217'], declared: true },
    { provider: 'a174', displayName: 'a174', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'a174'], declared: true },
    { provider: 'deepseek', displayName: 'deepseek', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'deepseek'] },
    { provider: 'a199', displayName: 'a199', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'a199'], declared: true },
    { provider: 'a000', displayName: 'a000', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'a000'], declared: true }
  ],
  async listModels(provider) {
    if (provider !== 'deepseek') throw new Error('NO_ADAPTER')
    return [{ id: 'deepseek-chat', name: 'DeepSeek Chat', inputModalities: ['text'] }]
  },
  async resolveModelInfo(provider, model) {
    if (model === 'deepseek-v4-flash') {
      return {
        provider, id: model, name: model, inputModalities: ['text'], defaultMaxTokens: 65536,
        reasoning: { efforts: [{ id: 'off', name: 'off' }, { id: 'high', name: 'high' }], defaultEffort: 'high' }
      }
    }
    if (model === 'm-a' || model === 'm-b') {
      return {
        provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 262144 },
        reasoning: { efforts: ['off', 'low', 'medium', 'high'].map((id) => ({ id, name: id })), defaultEffort: 'medium' }
      }
    }
    return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 1048576 } }
  }
}

let rpcHandler = null
let rpcOptions = null
const hostCtx = {
  settings,
  llm,
  connection: {
    rpc: {
      handle(channel, handler, options) {
        rpcHandler = handler
        rpcOptions = options
        return () => { rpcHandler = null }
      }
    }
  },
  get(service) {
    if (service === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'a217', model: 'qwen3.8-flash-next' }) }
    return undefined
  },
  effect(fn) {
    fn()
    return () => {}
  }
}
apply(hostCtx)
assert(typeof rpcHandler === 'function', 'apply registers the rpc handler')
assert(rpcOptions !== null && rpcOptions.authority === 'loopback', 'rpc channel is loopback-only')

const call = async (endpoint, payload) => await rpcHandler(endpoint, payload)

const snap = await call('snapshot')
assert(snap.ok === true && snap.value.ok === true, 'snapshot answers through the rpc envelope')
assertLossless(snap.value, 'snapshot')
console.log('ok: snapshot is lossless JSON (no undefined, no class instances)')
const a217 = snap.value.providers.find((row) => row.provider === 'a217')
const deepseek = snap.value.providers.find((row) => row.provider === 'deepseek')
assert(snap.value.revision === 7 && snap.value.writable === true, 'snapshot carries revision and writability')
assert(a217.live === true && a217.declared === true && a217.gateFields.length === 13, 'a217 is live, declared, with its 13 compat gates')
assert(a217.models.every((m) => m.target === 'models'), 'a route with a models list edits entries in that list')
assert(deepseek.models[0].target === 'overrides', 'a catalog route edits modelOverrides instead')
assert(deepseek.models.length === 1 && deepseek.models[0].id === 'deepseek-chat', 'catalog route rows come from llm.listModels')
assert(a217.models[1].effective.efforts.join(',') === 'off,high', 'effective efforts come from resolveModelInfo')
assert(a217.models[0].effective.maxTokens === null, 'absent defaultMaxTokens is normalized to null, never undefined')
assert(a217.models[0].userEntry.input === undefined && a217.models[0].userEntry.compat === undefined, 'userEntry is tidied before the UI sees it')
assert(snap.value.defaultSelection.model === 'qwen3.8-flash-next', 'default selection is reported for the 默认模型 badge')
assert(snap.value.documentPath.endsWith('settings.yaml'), 'snapshot reports the settings document path')

// ---------- 全局默认档位如何按路由适配 ----------

const a174 = snap.value.providers.find((row) => row.provider === 'a174')
assert(a174.sharedEfforts.join(',') === 'off,low,medium,high', 'a route adapts to the levels every one of its models offers')
assert(a217.sharedEfforts.length === 0, 'a route mixing a non-reasoning model shares no level, so a route default would break that model')
assert(a174.adaptsTo.medium.mode === 'exact' && a174.adaptsTo.medium.level === 'medium', 'a supported level is written as-is')
assert(a174.adaptsTo.xhigh.mode === 'fallback' && a174.adaptsTo.xhigh.level === 'high', 'xhigh falls back to the nearest supported level')
assert(a174.adaptsTo.minimal.mode === 'fallback' && a174.adaptsTo.minimal.level === 'low', 'a level below the supported range climbs up instead of dropping to off')
assert(a217.adaptsTo.high.mode === 'declare' && a217.adaptsTo.high.level === 'high', 'a route whose only gap is an undeclared model is fixable, not hopeless')
assert(a217.adaptsTo.high.declare.join(',') === 'qwen3.8-flash-next', 'the declaration targets exactly the models missing reasoningEfforts')
assert(a217.adaptsTo.medium.mode === 'declare' && a217.adaptsTo.medium.level === 'high' && a217.adaptsTo.medium.note.includes('就近'), 'declaring does not invent a level the declared models cannot serve')
assert(a217.adaptsTo.off.mode === 'exact' && a217.adaptsTo.off.declare.length === 0, 'off needs no declaration: pi-ai always accepts it')
const a199 = snap.value.providers.find((row) => row.provider === 'a199')
const a000 = snap.value.providers.find((row) => row.provider === 'a000')
assert(a199.models[0].capability === 'undeclared' && a199.undeclared.join(',') === 'plain-model', 'no reasoningEfforts on the entry reads as awaiting a declaration')
assert(a199.potentialEfforts.join(',') === t.LEVELS.join(','), 'with nothing declared yet every level can be declared')
assert(a199.adaptsTo.max.mode === 'declare' && a199.adaptsTo.max.level === 'max', 'a level outside the standard table is declared too')
assert(a000.offDeclared.join(',') === 'nothink' && a000.potentialEfforts.join(',') === 'off', 'an explicit reasoningEfforts: false only ever supports off')
assert(a000.adaptsTo.high.mode === 'none' && a000.adaptsTo.high.note.includes('nothink'), 'a model the user switched off is named and never silently re-declared')
assert(snap.value.globalDefault === '' && snap.value.globalMixed === false, 'nothing is unified before the first apply')
assert(t.adaptLevel('high', ['off', 'high']).mode === 'exact', 'adaptLevel keeps an offered level')
assert(t.adaptLevel('low', ['off', 'high']).level === 'high', 'adaptLevel prefers the only thinking level over turning reasoning off')
assert(t.adaptLevel('off', ['off', 'high']).level === 'off', 'adaptLevel honours off when it is shared')
assert(t.adaptLevel('low', []).mode === 'none', 'nothing shared means nothing written')
assert(t.sharedEfforts([{ effective: { efforts: ['off', 'high'] } }, { effective: { efforts: ['off'] } }]).join(',') === 'off', 'sharedEfforts intersects per-model capability')
const capGap = { potential: ['off', 'high'], undeclared: ['x'], offDeclared: [], unresolved: [] }
assert(t.adaptLevel('medium', [], capGap).mode === 'declare', 'an undeclared model turns the answer into declare, not give up')
const capUnknown = { potential: [], undeclared: [], offDeclared: [], unresolved: [{ id: 'z', error: 'NO_ADAPTER' }] }
assert(t.adaptLevel('high', [], capUnknown).mode === 'none', 'a model whose capability cannot be read is neither written nor declared')
assert(t.declareDict('high').off === null && t.declareDict('high').xhigh === undefined
  && Object.keys(t.declareDict('high')).length === 5, 'the standard declaration is off plus the five common levels')
assert(t.declareDict('max').max === 'max', 'the requested level is always included in its own declaration')
const builtList = t.declareOps('a199', { models: [{ id: 'plain-model', vendorId: 'keep-me' }] }, {}, ['plain-model'], t.declareDict('high'))
assert(builtList.ops.length === 1 && builtList.ops[0].path.join('.') === 'providers.a199.models'
  && builtList.ops[0].value[0].reasoningEfforts.medium === 'medium' && builtList.ops[0].value[0].vendorId === 'keep-me',
'declaring keeps unknown fields and rewrites only the whole models array')
const builtLeaf = t.declareOps('deepseek', {}, {}, ['deepseek-chat'], t.declareDict('high'))
assert(builtLeaf.ops[0].path.join('.') === 'providers.deepseek.modelOverrides.deepseek-chat.reasoningEfforts', 'a catalog route declares one leaf')
assert(t.declareOps('a199', { models: [{ id: 'other' }] }, {}, ['missing'], t.declareDict('high')).error !== undefined, 'a model that is not in the list is refused rather than invented')

const saved = await call('save', {
  provider: 'a217',
  model: 'qwen3.8-flash-next',
  expectedRevision: 7,
  modelPatch: {
    reasoningEfforts: { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' },
    input: ['text', 'image'],
    contextWindow: 512000,
    maxTokens: 32768,
    compat: { thinkingFormat: 'deepseek', supportsDeveloperRole: false, supportsStore: null }
  }
})
assert(saved.value.ok === true && saved.value.ops === 1, 'one op per model write')
assert(saved.value.revision === 8, 'save returns the new revision')
const op = mutation.ops[0]
assert(op.op === 'set' && op.path.join('.') === 'providers.a217.models', 'models route writes the whole models array (indices are not addressable)')
const written = op.value.find((m) => m.id === 'qwen3.8-flash-next')
assert(written.contextWindow === 512000 && written.maxTokens === 32768 && written.input.length === 2, 'capabilities written onto the entry')
assert(written.compat.supportsDeveloperRole === false && written.compat.supportsStore === undefined, 'compat merge keeps explicit false, drops null')
assert(op.value.find((m) => m.id === 'deepseek-v4-flash').reasoningEfforts.high === 'high', 'sibling entries are carried over untouched')
assert(mutation.ops.every((o) => o.path.join('.') !== 'providers.a217'), 'the provider profile itself is never replaced')

await call('save', { provider: 'a217', providerReasoning: 'high', expectedRevision: 8 })
assert(mutation.ops[0].op === 'set' && mutation.ops[0].path.join('.') === 'providers.a217.reasoning', 'default reasoning is a single path op')
await call('save', { provider: 'a217', providerReasoning: '', expectedRevision: 9 })
assert(mutation.ops[0].op === 'unset', 'choosing "— 默认 —" unsets the route default')

await call('save', {
  provider: 'deepseek',
  model: 'deepseek-chat',
  modelPatch: { reasoningEfforts: { off: null, high: 'high' }, input: null, contextWindow: null, maxTokens: null, compat: {} }
})
assert(mutation.ops[0].path.join('.') === 'providers.deepseek.modelOverrides.deepseek-chat.reasoningEfforts', 'catalog route writes one modelOverrides leaf')
assert(mutation.ops.every((o) => o.op === 'unset' || o.path.join('.').startsWith('providers.deepseek.modelOverrides.')), 'catalog route never rewrites the whole profile')

const bad = await call('save', { provider: 'a217', model: 'qwen3.8-flash-next', modelPatch: { reasoningEfforts: { off: null } } })
assert(bad.value.ok === false && bad.value.error.includes('off'), 'invalid level table is refused before any write')
const missing = await call('save', { provider: 'a217', model: 'nope', modelPatch: { reasoningEfforts: false } })
assert(missing.value.ok === false && missing.value.error.includes('nope'), 'unknown model is refused')
const stale = await call('save', { provider: 'a217', providerReasoning: 'low', expectedRevision: 1 })
assert(stale.value.ok === false && stale.value.error.includes('revision'), 'stale expectedRevision surfaces the settings conflict')

// ---------- 全局默认档位：一次应用到所有路由 ----------

const before = mutations.length
const applied = await call('applyGlobal', { level: 'xhigh', providers: ['a174', 'a217', 'deepseek', 'ghost'], alsoDefault: true })
assert(applied.value.ok === true && applied.value.changed === 1, 'applyGlobal writes only the routes that can serve the level')
assertLossless(applied.value, 'applyGlobal')
const byRoute = {}
for (const item of applied.value.plan) byRoute[item.provider] = item
assert(byRoute.a174.written === 'high' && byRoute.a174.mode === 'fallback', 'a174 gets the adapted level')
assert(byRoute.a217.written === null && byRoute.a217.mode === 'none', 'a217 is skipped instead of handed a level it cannot serve')
assert(byRoute.ghost.written === null && byRoute.ghost.mode === 'skip', 'a route that is not configured is skipped')
const routeWrite = mutations[before]
assert(routeWrite.ns === 'llm-pi-ai' && routeWrite.ops.length === 1
  && routeWrite.ops[0].path.join('.') === 'providers.a174.reasoning' && routeWrite.ops[0].value === 'high', 'the route write is one path op, not a profile replace')
const defaultWrite = mutations[mutations.length - 1]
assert(defaultWrite.ns === 'agent-default-model' && defaultWrite.ops[0].op === 'set'
  && defaultWrite.ops[0].path.join('.') === 'reasoningEffort' && defaultWrite.ops[0].value === 'xhigh', 'the DSH-native default selection keeps the raw slider level')
assert(defaultSelectionValue.provider === 'a217' && defaultSelectionValue.model === 'qwen3.8-flash-next', 'writing the effort leaves the default provider/model alone')
assert(applied.value.defaultWritten === true, 'applyGlobal reports the default-selection write')
const again = await call('applyGlobal', { level: 'xhigh', providers: ['a174'] })
assert(again.value.changed === 0 && again.value.plan[0].note === '已是该值', 're-applying the same level is a no-op')
const badLevel = await call('applyGlobal', { level: 'turbo', providers: ['a174'] })
assert(badLevel.value.ok === false, 'an unknown global level is refused')
const empty = await call('applyGlobal', { level: 'high', providers: [] })
assert(empty.value.ok === false, 'an empty route list is refused')
const unknown = await call('nope')
assert(unknown.ok === false && unknown.error.message.includes('unknown'), 'unknown endpoint errors')

// ---------- 顺带声明能力：模型会思考、只是没配 ----------

const untouched = await call('applyGlobal', { level: 'high', providers: ['a199'] })
assert(untouched.value.plan[0].written === null && untouched.value.plan[0].mode === 'declare'
  && untouched.value.plan[0].note.indexOf('未勾选') === 0, 'without declare the route is left alone rather than handed a level that would fail every request')
const blockedByUser = await call('applyGlobal', { level: 'high', providers: ['a000'], declare: true })
assert(blockedByUser.value.plan[0].written === null && blockedByUser.value.plan[0].note.includes('nothink'), 'an explicitly non-reasoning model is never auto-declared')
const declaredApply = await call('applyGlobal', { level: 'high', providers: ['a199'], declare: true })
assert(declaredApply.value.ok === true && declaredApply.value.changed === 1 && declaredApply.value.declared === 1, 'declare reports both the capability write and the route default')
const declareWrite = mutations[mutations.length - 1]
assert(declareWrite.ops.length === 2
  && declareWrite.ops[0].path.join('.') === 'providers.a199.models'
  && declareWrite.ops[1].path.join('.') === 'providers.a199.reasoning' && declareWrite.ops[1].value === 'high',
'capability and route default land in one atomic mutate')
assert(declareWrite.ops[0].value[0].reasoningEfforts.medium === 'medium' && declareWrite.ops[0].value[0].reasoningEfforts.off === null
  && declareWrite.ops[0].value[0].vendorId === 'keep-me', 'the declaration is the standard table and keeps unknown fields')
assertLossless(declaredApply.value, 'applyGlobal.declare')

// ---------- Client half through a stubbed module loader ----------

const nodes = []
const h = (type, props, ...children) => {
  const node = { type, props: props || {}, children: children.flat(4).filter((c) => c !== null && c !== undefined && c !== false) }
  nodes.push(node)
  return node
}
let hookValues = []
let hookIndex = 0
const react = {
  createElement: h,
  useState(init) {
    const index = hookIndex++
    const value = hookValues.length > index && hookValues[index] !== undefined ? hookValues[index] : (typeof init === 'function' ? init() : init)
    return [value, (next) => {
      hookValues[index] = typeof next === 'function' ? next(hookValues[index]) : next
    }]
  },
  useEffect() {},
  useCallback: (fn) => fn,
  // 席位组件用它读 ModelDirectory.store；测试里直接同步取快照。
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot()
}
const walk = (predicate, node, out = []) => {
  if (predicate(node)) out.push(node)
  for (const child of node.children || []) {
    if (child && typeof child === 'object' && child.type) walk(predicate, child, out)
  }
  return out
}
const className = (node) => String((node.props || {}).className || '')

let definition = null
const styles = []
const clientWindow = { __ModuleLoader__: { load(def) { definition = def } } }
const clientDocument = {
  head: { appendChild(node) { styles.push(node) } },
  createElement(tag) {
    return { tag, attributes: {}, textContent: '', setAttribute(k, v) { this.attributes[k] = v }, remove() {} }
  }
}
const clientSrc = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
new vm.Script(clientSrc, { filename: 'client.js' }).runInContext(vm.createContext({
  window: clientWindow, document: clientDocument, console, process, React: react
}))
assert(definition !== null && definition.id === 'dsh-model-reasoning', 'client registers itself with __ModuleLoader__')
const clientApi = definition.factory((id) => {
  if (id !== 'react') throw new Error('unexpected require: ' + id)
  return react
})
assert(typeof clientApi.apply === 'function' && clientApi.inject.join(',') === 'slots,connection', 'client exports apply and inject')

const registrations = []
const slots = {
  inject: (_key, factory) => {
    factory()
    return () => {}
  },
  register: (options, component) => {
    registrations.push({ options, component })
    return () => {}
  }
}
const rpcCalls = []
// 模型席位的状态源：与模型下拉同一个 store 形状（subscribe + getSnapshot）。
const seatState = {
  status: 'ready',
  error: null,
  routable: true,
  current: { provider: 'a174', model: 'm-a', reasoningEffort: 'medium' },
  groups: [{
    id: 'a174',
    name: 'A174',
    models: [{
      id: 'm-a',
      name: 'M A',
      reasoning: {
        efforts: [{ id: 'off', name: '关闭' }, { id: 'low', name: '低' }, { id: 'medium', name: '中' }, { id: 'high', name: '高' }],
        defaultEffort: 'low'
      }
    }, { id: 'plain', name: 'Plain' }]
  }]
}
const seatSelects = []
const seatLoads = { count: 0 }
const seatStore = { subscribe: () => () => {}, getSnapshot: () => seatState }
const seatDirectory = {
  store: seatStore,
  load: async () => {
    seatLoads.count += 1
    return seatState
  },
  select: async (selection) => {
    seatSelects.push(selection)
  }
}
const clientCtx = {
  get: (service) => (service === 'connection' ? {
    rpc: {
      async call(channel, endpoint, payload) {
        rpcCalls.push({ channel, endpoint, payload })
        return { ok: true, value: endpoint === 'snapshot' ? snap.value : { ok: true, revision: 9, ops: 1 } }
      }
    }
  } : service === 'slots' ? slots : service === 'modelDirectories' ? {
    directoryFor: () => seatDirectory
  } : service === 'sessions' ? { subagentAddress: () => undefined } : undefined),
  slots,
  inject: (deps, fn) => {
    const scope = { get: (service) => clientCtx.get(service) }
    for (const dep of deps) scope[dep] = clientCtx.get(dep)
    fn(scope)
    return () => {}
  },
  effect: (fn) => {
    fn()
    return () => {}
  }
}
clientApi.apply(clientCtx)
const registered = registrations.find((item) => item.options.name === 'settings.section')
const seat = registrations.find((item) => item.options.name === 'conversation.input.left')
assert(registered !== undefined && registered.options.id === 'model-reasoning', 'client registers the settings.section')
assert(registered.options.label === '推理能力', 'section is labelled 推理能力')
assert(styles.length === 1 && styles[0].attributes['data-model-reasoning'] === '', 'styles are injected once and tagged for cleanup')

hookValues = [snap.value, '', '', 'ok', 'a217', '', false, false, '', false, '']
hookIndex = 0
const page = registered.component().type({
  callHost: async () => snap.value
})
// 三段式：② 路由概览表取代了原来的胶囊 tab（tab 与概览列表信息重复）。
assert(walk((n) => className(n).indexOf('mrsn-routes mrsn-click') >= 0, page).length === 5, 'one overview row per provider')
assert(walk((n) => className(n).indexOf('mrsn-tab') >= 0, page).length === 0, 'the duplicated provider tab strip is gone')
assert(walk((n) => className(n).indexOf('mrsn-panel') >= 0, page).length >= 3, 'the page is stacked into three panels')
assert(walk((n) => n.props !== undefined && n.props.placeholder === '搜索路由 / 模型…', page).length === 1, 'one search box narrows routes and models')
const routeSelect = walk((n) => n.props !== undefined && n.props['aria-label'] === '选择路由', page)[0]
assert(routeSelect !== undefined && walk((n) => n.type === 'option', routeSelect).length === 5, 'the model panel carries a provider picker')

// ---------- 全局默认区块 ----------

const globalNode = walk((n) => typeof n.type === 'function' && n.type.name === 'GlobalBlock', page)[0]
assert(globalNode !== undefined, 'the global default block renders above the routes')
hookValues = ['medium', false, true, false, null]
hookIndex = 0
const globalPage = globalNode.type({
  snapshot: snap.value,
  callHost: async () => ({ ok: true, changed: 1, declared: 1, plan: [], defaultWritten: true }),
  onReload: async () => {},
  onNotice: () => {}
})
assert(walk((n) => n.props !== undefined && n.props.type === 'range', globalPage).length === 1, 'the global default is a slider')
assert(walk((n) => (className(n).split(' ')[0] || '') === 'mrsn-tick', globalPage).length === 7, 'the slider exposes all seven levels')
assert(walk((n) => className(n).split(' ')[0] === 'mrsn-planrow', globalPage).length === 6, 'the preview table has a header plus one row per configured route')
assert(walk((n) => className(n).indexOf('mrsn-planhead') >= 0, globalPage).length === 1, 'the preview table labels its columns instead of prose')
assert(walk((n) => typeof n.children[0] === 'string' && n.children[0].indexOf('顺带声明') === 0, globalPage).length === 1, 'the declare-capability checkbox is offered')
const cards = walk((n) => typeof n.type === 'function' && n.type.name === 'ModelCard', page)
assert(cards.length === 2, 'one card per model')

// 第一张卡没存过等级表 → 继承模式；ctx 列走 1024 进制缩写
hookValues = [true, undefined, null, false, '', null, false, false]
hookIndex = 0
const inheritTree = cards[0].type(Object.assign({}, cards[0].props, { callHost: async () => ({ ok: true, revision: 9 }) }))
assert(walk((n) => typeof n.type === 'function' && n.type.name === 'LevelTable', inheritTree).length === 0, 'a model with no stored level table stays in inherit mode')
const numCells = (node) => walk((n) => className(n) === 'mrsn-num', node).map((n) => String(n.children[0]))
assert(numCells(inheritTree).filter((text) => text === '1M').length === 1, 'the ctx column abbreviates 1048576 as 1M')
assert(walk((n) => n.type === 'button' && n.children[0] === '声明能力', inheritTree).length === 1, 'an undeclared model offers a one-click declaration in its own row')

// 第二张卡存过等级表 → 自定义模式 + 等级表；生效 ctx 为 null → 缩写列没有值
hookValues = [true, undefined, null, false, '', null, false, false]
hookIndex = 0
const cardTree = cards[1].type(Object.assign({}, cards[1].props, { callHost: async () => ({ ok: true, revision: 9 }) }))
const levelNode = walk((n) => typeof n.type === 'function' && n.type.name === 'LevelTable', cardTree)
const compatNode = walk((n) => typeof n.type === 'function' && n.type.name === 'CompatBlock', cardTree)
assert(levelNode.length === 1, 'a model with a stored level table opens in custom mode and shows the table')
assert(numCells(cardTree).filter((text) => text === '1M').length === 0, 'no ctx value renders when the effective context window is null')
hookValues = [levelNode[0].props.draft, () => {}]
hookIndex = 0
const tableTree = levelNode[0].type(levelNode[0].props)
assert(walk((n) => className(n).indexOf('mrsn-levelname') >= 0, tableTree).length === 7, 'level table lists all seven levels')
const wire = walk((n) => n.type === 'input' && className(n).indexOf('mrsn-mono') >= 0, tableTree).map((n) => n.props.value)
assert(wire.join(',') === ',high', 'only the declared levels are checked, prefilled with their stored wire values')
hookValues = [compatNode[0].props.draft, () => {}]
hookIndex = 0
const compatTree = compatNode[0].type(compatNode[0].props)
assert(walk((n) => n.type === 'select', compatTree).length === 3, 'three enum compat selects (thinkingFormat, maxTokensField, cacheControlFormat)')
assert(walk((n) => className(n).indexOf('mrsn-segbtn') >= 0, compatTree).length === 30, 'ten boolean compat gates with three states each')

// ---------- 行内「声明能力」：配置缺口不必先进编辑器 ----------

const saves = []
hookValues = [true, undefined, null, false, '', null, false, false]
hookIndex = 0
const declareTree = cards[0].type(Object.assign({}, cards[0].props, {
  callHost: async (endpoint, payload) => {
    saves.push({ endpoint, payload })
    return { ok: true, revision: 9 }
  },
  onReload: async () => {},
  onNotice: () => {}
}))
const declareBtn = walk((n) => n.type === 'button' && n.children[0] === '声明能力', declareTree)[0]
assert(declareBtn !== undefined, 'the undeclared row carries its own declare action')
if (declareBtn !== undefined) await declareBtn.props.onClick({ stopPropagation() {} })
assert(saves.length === 1 && saves[0].endpoint === 'save'
  && Object.keys(saves[0].payload.modelPatch).join(',') === 'reasoningEfforts'
  && saves[0].payload.modelPatch.reasoningEfforts.off === null
  && saves[0].payload.modelPatch.reasoningEfforts.medium === 'medium',
'the row action writes only reasoningEfforts, so ctx / input / compat stay untouched')

// ---------- 写入结果要有明确回执 ----------

hookValues = [snap.value, '', '已写入 1 个路由默认', 'ok', 'a217', '', false, false, '', false, '']
hookIndex = 0
const toastPage = registered.component().type({
  callHost: async () => snap.value
})
assert(walk((n) => className(n) === 'mrsn-toast', toastPage).length === 1, 'a write result surfaces as a toast')

// ---------- 输入框席位：模型下拉左侧的推理强度滑杆 ----------

assert(seat !== undefined, 'a composer seat is registered beside the model dropdown')
assert(seat.options.id === 'model-reasoning-effort' && seat.options.order === 20, 'the composer seat carries its own seat id and order')
const seatFace = seat.options.inject('s-1')
assert(seatFace.available === true && seatFace.directory === seatStore, 'the seat reads the same model-directory store the dropdown does')
await seatFace.load()
assert(seatLoads.count === 1, 'mounting the seat warms the shared catalog once')
await seatFace.select({ provider: 'a174', model: 'm-a', reasoningEffort: 'high' })
assert(seatSelects.length === 1 && seatSelects[0].reasoningEffort === 'high', 'the seat writes through directory.select')

const rangeOf = (node) => walk((n) => n.props !== undefined && n.props.type === 'range', node)[0]
const readout = (node) => walk((n) => className(n) === 'mrsn-cs-value', node)[0]
const seatHooks = [null, '']
hookValues = seatHooks
hookIndex = 0
const seatTree = seat.component(seatFace)
const range = rangeOf(seatTree)
assert(range !== undefined, 'the composer seat renders a slider')
assert(range.props.max === 4, 'the slider offers 默认 plus the four levels this model declares')
assert(range.props.value === 3 && range.props.disabled === false, 'the slider sits on the session override')
assert(readout(seatTree) !== undefined && String(readout(seatTree).children[0]) === '中', 'the readout shows the effective level')
range.props.onChange({ target: { value: '0' } })
hookValues = seatHooks
hookIndex = 0
const dragged = seat.component(seatFace)
assert(rangeOf(dragged).props.value === 0 && seatSelects.length === 1, 'dragging only previews, it does not write per step')
rangeOf(dragged).props.onPointerUp()
assert(seatSelects.length === 2 && !('reasoningEffort' in seatSelects[1]), 'releasing on 默认 writes no effort, so the route default wins again')
seatState.current = { provider: 'a174', model: 'plain' }
hookValues = [null, '']
hookIndex = 0
assert(seat.component(seatFace) === null, 'a model with no reasoning metadata shows no slider')
seatState.current = { provider: 'a174', model: 'm-a', reasoningEffort: 'medium' }
hookValues = [null, '']
hookIndex = 0
assert(seat.component(Object.assign({}, seatFace, { available: false })) === null, 'an addressed subagent session gets no slider')

console.log(process.exitCode ? '\nFAILED' : '\nall dsh-model-reasoning tests passed')
