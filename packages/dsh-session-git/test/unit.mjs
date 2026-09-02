/**
 * dsh-session-git unit tests — pure helpers exported on `_internal`.
 *
 * Run: node test/unit.mjs
 *
 * Self-contained: the plugin source is copied into a temp root with a stub
 * `@deepseek-ai/dsh-tools`, so the test runs with plain Node — no DSH host
 * process and no peer dependencies installed.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pluginLib = fileURLToPath(new URL('../lib/index.js', import.meta.url))

// ---------- temp root with a dsh-tools stub ----------
const root = mkdtempSync(join(tmpdir(), 'session-git-test-'))
const stubDir = join(root, 'node_modules', '@deepseek-ai', 'dsh-tools')
mkdirSync(stubDir, { recursive: true })
writeFileSync(join(stubDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', type: 'module', main: 'index.js' }))
writeFileSync(join(stubDir, 'index.js'), 'export function defineTool(def) { return def }\n')
const pluginCopy = join(root, 'index.js')
writeFileSync(pluginCopy, readFileSync(pluginLib, 'utf8'))
process.on('exit', () => { try { rmSync(root, { recursive: true, force: true }) } catch {} })

const { _internal: t } = await import(pathToFileURL(pluginCopy).href)

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1 } else console.log('ok: ' + msg) }

assert(t.slugify('Fix 数据库 Connection Timeout!!!') === 'fix-数据库-connection-timeout', 'slugify keeps CJK and lowercases')
assert(t.slugify('///') === 'session', 'slugify fallback')
const fid = t.fileNameFor('调试 OAuth 流程', 'session-abcd1234-5678-90ef')
assert(fid === 'session-调试-oauth-流程-567890ef.json', 'fileNameFor deterministic: ' + fid)
assert(t.samePath('F:\\proj x\\demo\\', 'f:/proj x/demo'), 'samePath normalizes separators+case')

const stats = t.sessionStats([
  { seq: 0, type: 'turn/start', time: 1, data: {} },
  { seq: 1, type: 'user/message', time: 2, data: { id: 'm1', content: [{ type: 'text', text: '你好' }] } },
  { seq: 2, type: 'assistant/message', time: 3, data: { message: {} } },
  { seq: 3, type: 'tool/call', time: 4, data: { name: 'read' } },
  { seq: 4, type: 'tool/result', time: 5, data: {} },
])
assert(stats.events === 5 && stats.userMessages === 1 && stats.assistantMessages === 1 && stats.toolCalls === 1 && stats.turns === 1, 'sessionStats counts')

assert(t.userMessageText({ content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] }) === 'a\nb', 'userMessageText joins text blocks')

// Round-trip: build a doc exactly like the plugin writer, then prefix-extract.
const events = []
for (let i = 0; i < 5000; i++) events.push({ seq: i, type: 'assistant/chunk', time: i, data: { chunk: { x: 'payload-'.repeat(4) } } })
const doc = {
  format: 'dsh-session-git/v1', savedAt: 1787000000000, savedBy: 'session-saver',
  session: { version: 0, id: 'session-11111111-2222-3333-4444-555555555555', createdAt: 1786999000000, cwd: 'F:\\proj x\\demo', agentPreset: 'cordis' },
  title: '标题 with "quotes" and \\backslash',
  stats: { events: 5000, userMessages: 1, assistantMessages: 1, toolCalls: 0, turns: 1 },
  eventCount: 5000,
  events,
}
const text = JSON.stringify(doc)
const meta = t.extractPrefixMeta(text.slice(0, 262144))
assert(meta.format === 'dsh-session-git/v1', 'prefix meta format')
assert(meta.savedAt === 1787000000000, 'prefix meta savedAt')
assert(meta.title === '标题 with "quotes" and \\backslash', 'prefix meta unescapes title: ' + meta.title)
assert(meta.sessionId === 'session-11111111-2222-3333-4444-555555555555', 'prefix meta sessionId')
assert(meta.createdAt === 1786999000000, 'prefix meta createdAt')
assert(meta.cwd === 'F:\\proj x\\demo', 'prefix meta cwd: ' + meta.cwd)
assert(meta.agentPreset === 'cordis', 'prefix meta preset')
assert(meta.eventCount === 5000, 'prefix meta eventCount')

const ok = t.validateDoc(doc)
assert(ok.events.length === 5000 && ok.session.id === doc.session.id, 'validateDoc happy path')
for (const [bad, why] of [
  [{ format: 'other/v1', session: {}, events: [{ seq: 0 }] }, 'wrong format'],
  [{ format: 'dsh-session-git/v1', session: {}, events: [] }, 'empty events'],
  [{ format: 'dsh-session-git/v1', session: { createdAt: 1 }, events: [{ seq: 1 }] }, 'seq gap'],
  ['nope', 'non-object root'],
]) {
  let threw = false
  try { t.validateDoc(bad) } catch (e) { threw = true }
  assert(threw, 'validateDoc rejects: ' + why)
}

const id = t.newSessionId()
assert(/^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id), 'newSessionId shape: ' + id)
assert(id !== t.newSessionId(), 'newSessionId unique')

console.log(process.exitCode === 1 ? 'TESTS FAILED' : 'ALL TESTS PASSED')
