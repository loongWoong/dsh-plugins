/**
 * dsh-memarc behavior test — exercises the archive management additions
 * (arc/unarchive + arc/delete) against a mocked host context and a real
 * temporary session-artifact layout.
 *
 * Run: node test/behavior.mjs
 *
 * The plugin source is copied into a temp root with a stub
 * `@deepseek-ai/dsh-tools`, so the test runs without the DSH host process.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const pluginLib = join(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'lib', 'index.js')

// ---------- temp root with a dsh-tools stub ----------
const root = mkdtempSync(join(tmpdir(), 'memarc-test-'))
const stubDir = join(root, 'node_modules', '@deepseek-ai', 'dsh-tools')
mkdirSync(stubDir, { recursive: true })
writeFileSync(join(stubDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', type: 'module', main: 'index.js' }))
writeFileSync(join(stubDir, 'index.js'), 'export function defineTool(def) { return def }\n')
const pluginCopy = join(root, 'index.js')
writeFileSync(pluginCopy, readFileSync(pluginLib, 'utf8'))

// ---------- fake session-artifact layout: <root>/<project>/<sessionId>/session.jsonl.zstd ----------
const sessionsRoot = mkdtempSync(join(tmpdir(), 'memarc-sessions-'))
const projectDir = join(sessionsRoot, '--test-project--')
const sessionADir = join(projectDir, 'session-a')
mkdirSync(sessionADir, { recursive: true })
writeFileSync(join(sessionADir, 'session.jsonl.zstd'), 'fake-log-bytes')

// ---------- mocked host context ----------
const holder = {
  state: {
    initialized: true,
    workspaceIds: ['ws1'],
    archivedSessionIds: ['session-a', 'session-b', 'session-c', 'session-e'],
  },
}
const detached = []
const registry = {
  get archivedSessionIds() { return holder.state.archivedSessionIds },
  requireState() { return holder.state },
  async setState(next) { holder.state = next },
  enqueueOperation(op) { return op() },
  list() {
    return [{ detachSession: async (id) => { detached.push(id) } }]
  },
  headers: new Map([['session-a', { id: 'session-a', cwd: 'F:\\x' }]]),
  sessionPaths: new Map([['session-a', 'F:\\x']]),
  invalidSessionPaths: new Map(),
}
const persistence = {
  locate(header) {
    if (header !== undefined && header.id === 'session-a') return { kind: 'jsonl', path: join(sessionADir, 'session.jsonl.zstd') }
    return undefined
  },
  async list() { return [{ id: 'session-a', cwd: 'F:\\x' }] },
}
const sessionQuery = {
  async listSessions() {
    return [
      { header: { id: 'session-a', cwd: 'F:\\x' }, live: false, persisted: true },
      { header: { id: 'session-b', cwd: 'F:\\x' }, live: true, persisted: true },
    ]
  },
}
let rpcHandler = null
let rpcOptions = null
const registeredTools = []
const ctx = {
  effect(fn) { return fn() },
  fs: {},
  sandboxPolicy: { workspaceRoot: 'F:\\x', resolve: () => ({}) },
  workspaceRegistry: registry,
  sessionPersistence: persistence,
  sessionQuery,
  sessions: { list: () => [], get: () => undefined },
  connection: { rpc: { handle(channel, handler, options) { rpcHandler = handler; rpcOptions = options } } },
  tools: { register(tool) { registeredTools.push(tool) } },
}

const mod = await import(pathToFileURL(pluginCopy).href)
mod.apply(ctx)

let failures = 0
function check(name, condition, detail) {
  if (condition) {
    console.log('PASS  ' + name)
  } else {
    failures += 1
    console.log('FAIL  ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''))
  }
}

// ---------- RPC registration ----------
check('rpc handler registered on /memarc', rpcHandler !== null)
check('rpc authority is loopback', rpcOptions !== null && rpcOptions.authority === 'loopback', rpcOptions)
check('session_unarchive tool registered', registeredTools.some((t) => t.name === 'session_unarchive'))

// ---------- arc/unarchive ----------
{
  const res = await rpcHandler('arc/unarchive', { sessionIds: ['session-e'] })
  check('unarchive envelope ok', res && res.ok === true)
  check('unarchive removed 1', res.value.unarchived === 1, res.value)
  check('unarchive updates set', JSON.stringify(res.value.archivedSessionIds) === JSON.stringify(['session-a', 'session-b', 'session-c']), res.value.archivedSessionIds)
  const res2 = await rpcHandler('arc/unarchive', { sessionIds: ['session-e'] })
  check('unarchive idempotent', res2.value.unarchived === 0, res2.value)
  const res3 = await rpcHandler('arc/unarchive', { sessionIds: [] }).catch((e) => ({ error: String(e) }))
  check('unarchive rejects empty ids', res3.ok === false, res3)
}

// ---------- arc/delete ----------
{
  const res = await rpcHandler('arc/delete', { sessionIds: ['session-a', 'session-b', 'session-c', 'session-d'] })
  check('delete envelope ok', res && res.ok === true)
  const byId = new Map(res.value.results.map((r) => [r.sessionId, r]))
  check('persisted session deleted', byId.get('session-a').ok === true && byId.get('session-a').reason === 'deleted', byId.get('session-a'))
  check('artifact directory removed from disk', !existsSync(sessionADir))
  check('live session refused', byId.get('session-b').ok === false && byId.get('session-b').reason === 'live', byId.get('session-b'))
  check('ghost session cleaned', byId.get('session-c').ok === true && byId.get('session-c').reason === 'missing', byId.get('session-c'))
  check('non-archived session refused', byId.get('session-d').ok === false && byId.get('session-d').reason === 'not-archived', byId.get('session-d'))
  check('deleted count', res.value.deleted === 2, res.value)
  check('archive set pruned', JSON.stringify(res.value.archivedSessionIds) === JSON.stringify(['session-b']), res.value.archivedSessionIds)
  check('workspace accounting detached', JSON.stringify(detached.sort()) === JSON.stringify(['session-a', 'session-c']), detached)
  check('registry header cache cleared', !registry.headers.has('session-a') && !registry.sessionPaths.has('session-a'))
}

// ---------- session_unarchive tool ----------
{
  const tool = registeredTools.find((t) => t.name === 'session_unarchive')
  const value = await tool.execute({ sessionId: 'session-b' }, { signal: undefined })
  check('tool unarchives one session', value.unarchived === 1 && value.requested === 1 && value.total === 0, value)
}

// ---------- cleanup ----------
rmSync(root, { recursive: true, force: true })
rmSync(sessionsRoot, { recursive: true, force: true })

if (failures > 0) {
  console.log('\n' + failures + ' check(s) FAILED')
  process.exit(1)
}
console.log('\nall checks passed')
