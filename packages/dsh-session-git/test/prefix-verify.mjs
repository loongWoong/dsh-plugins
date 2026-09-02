/**
 * dsh-session-git prefix-read verifier — offline diagnostic for saved session
 * files (the JSON documents written by `session_git_save`).
 *
 * Usage: node test/prefix-verify.mjs <session-file.json> [more.json ...]
 *
 * Decodes the file's head exactly like the plugin's prefix reader and prints
 * the extracted metadata, so oversized or unusual files can be checked
 * without the DSH host process. Self-contained: `@deepseek-ai/dsh-tools` is
 * stubbed in a temp root, no peer dependencies installed.
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pluginLib = fileURLToPath(new URL('../lib/index.js', import.meta.url))

// ---------- temp root with a dsh-tools stub ----------
const root = mkdtempSync(join(tmpdir(), 'session-git-verify-'))
const stubDir = join(root, 'node_modules', '@deepseek-ai', 'dsh-tools')
mkdirSync(stubDir, { recursive: true })
writeFileSync(join(stubDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', type: 'module', main: 'index.js' }))
writeFileSync(join(stubDir, 'index.js'), 'export function defineTool(def) { return def }\n')
const pluginCopy = join(root, 'index.js')
writeFileSync(pluginCopy, readFileSync(pluginLib, 'utf8'))
process.on('exit', () => { try { rmSync(root, { recursive: true, force: true }) } catch {} })

const { _internal } = await import(pathToFileURL(pluginCopy).href)

const files = process.argv.slice(2)
if (files.length === 0) {
  console.log('usage: node test/prefix-verify.mjs <session-file.json> [more.json ...]')
  process.exit(2)
}

let failed = false
for (const file of files) {
  try {
    const raw = readFileSync(file)
    // Simulate readPrefixText: decode chars incrementally, stop at PREFIX_CHARS.
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let text = ''
    let offset = 0
    const CHUNK = 65536
    while (text.length < 262144 && offset < raw.length) {
      text += decoder.decode(raw.subarray(offset, offset + CHUNK), { stream: true })
      offset += CHUNK
    }
    text += decoder.decode()
    const meta = _internal.extractPrefixMeta(text)
    const ok = meta.format === 'dsh-session-git/v1'
      && typeof meta.title === 'string' && meta.title.length > 0
      && typeof meta.sessionId === 'string' && meta.sessionId.startsWith('session-')
      && typeof meta.createdAt === 'number' && meta.createdAt > 0
      && typeof meta.eventCount === 'number' && meta.eventCount > 0
    console.log((ok ? 'ok' : 'FAIL') + ': ' + file.split(/[\\/]/).pop())
    console.log('  size=' + raw.length + ' prefixChars=' + text.length)
    console.log('  title=' + meta.title + ' | sessionId=' + meta.sessionId + ' | events=' + meta.eventCount + ' | cwd=' + meta.cwd + ' | savedAt=' + meta.savedAt)
    if (!ok) failed = true
  } catch (err) {
    failed = true
    console.log('FAIL: ' + file)
    console.log('  ' + (err && err.message ? err.message : err))
  }
}
process.exit(failed ? 1 : 0)
