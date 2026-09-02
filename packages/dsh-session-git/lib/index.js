/**
 * dsh-session-git — Host half.
 *
 * Session Git: treat DSH sessions as versionable project assets.
 *
 * Model tools:
 *  - `session_git_save`     export one session (default: the current one) or
 *                           every session of the workspace as a JSON file under
 *                           `<project>/.dsh-sessions/`, ready to `git commit`;
 *  - `session_git_sessions` list the DSH sessions that belong to a workspace
 *                           (candidates for saving);
 *  - `session_git_list`     list the session files saved under a project path
 *                           (reads only the file header for large logs);
 *  - `session_git_show`     preview one saved session without importing it;
 *  - `session_git_load`     import one saved file as a NEW session into the
 *                           durable store — it appears in the session sidebar
 *                           and can be opened and continued natively, fully
 *                           reproducing the original collaboration scene.
 *
 * Settings-page RPC channel `/session-git` (loopback-only) exposes the same
 * operations to the interactive UI: session/list, git/list, git/show,
 * git/save (batch), git/load.
 *
 * The exported document carries the complete raw session log (user messages,
 * assistant output, every tool call and result, compaction history, titles,
 * todos, goals) plus the session header. Binary image attachments live in the
 * attachment store and do not travel with the file.
 *
 * Consumes host services only (fs, sandboxPolicy, sessionQuery, sessions,
 * connection, tools); publishes none, so it needs no isolate realm.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'session-git'

export const inject = [
  'fs',
  'sandboxPolicy',
  'sessionQuery',
  'sessions',
  'connection',
  'tools',
]

const STORE_DIR = '.dsh-sessions'
const RPC_CHANNEL = '/session-git'
const FORMAT = 'dsh-session-git/v1'
// Head budget for listing large saved files, in DECODED CHARS (metadata sits at
// the head of the document; the events array comes last). Applied via
// readPrefixText (streamText + early break) because fs.readBytes rejects any
// file larger than its cap instead of returning a prefix.
const PREFIX_BYTES = 262144
const PREFIX_CHARS = 262144
const LIST_FILE_CAP = 200
const SAVE_ALL_CAP = 20
const SHOW_TEXT_CAP = 800

// ---------- pure helpers (also exercised by unit tests via _internal) ----------

/** File-name slug from a title. */
function slugify(title) {
  const base = String(title === undefined || title === null ? '' : title)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return base.length > 0 ? base : 'session'
}

/** Suggest a deterministic, collision-resistant file name for one session. */
function fileNameFor(title, sessionId) {
  const idTail = String(sessionId).replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'unknown'
  return 'session-' + slugify(title) + '-' + idTail + '.json'
}

/** Compare two workspace paths the way Windows/POSIX users write them. */
function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** Compact per-type counters used in `stats` and previews. */
function sessionStats(events) {
  const stats = { events: events.length, userMessages: 0, assistantMessages: 0, toolCalls: 0, turns: 0 }
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue
    if (event.type === 'user/message') stats.userMessages += 1
    else if (event.type === 'assistant/message') stats.assistantMessages += 1
    else if (event.type === 'tool/call') stats.toolCalls += 1
    else if (event.type === 'turn/start') stats.turns += 1
  }
  return stats
}

/** Join the text blocks of one user message into preview text. */
function userMessageText(data) {
  if (data === null || typeof data !== 'object') return ''
  const content = Array.isArray(data.content) ? data.content : []
  const parts = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

/** Extract metadata from the head of a saved document without parsing events. */
function extractPrefixMeta(prefixText) {
  function firstString(re) {
    const m = re.exec(prefixText)
    if (m === null) return undefined
    try { return JSON.parse('"' + m[1] + '"') } catch (ignored) { return m[1] }
  }
  function firstNumber(re) {
    const m = re.exec(prefixText)
    return m !== null && Number.isFinite(Number(m[1])) ? Number(m[1]) : undefined
  }
  const strField = '(?:[^"\\\\]|\\\\.)*'
  return {
    format: firstString(new RegExp('"format":"(' + strField + ')"')),
    savedAt: firstNumber(/"savedAt":(\d+)/),
    title: firstString(new RegExp('"title":"(' + strField + ')"')),
    sessionId: firstString(new RegExp('"session":\\{"version":\\d+,"id":"(' + strField + ')"')),
    createdAt: firstNumber(/"createdAt":(\d+)/),
    cwd: firstString(new RegExp('"cwd":"(' + strField + ')"')),
    agentPreset: firstString(new RegExp('"agentPreset":"(' + strField + ')"')),
    eventCount: firstNumber(/"eventCount":(\d+)/),
  }
}

/** Validate a parsed document; returns { session, events } or throws. */
function validateDoc(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('not a session file: root is not an object')
  }
  if (doc.format !== FORMAT) {
    throw new Error('unsupported session file format ' + JSON.stringify(doc.format) + ' (expected ' + FORMAT + ')')
  }
  const session = doc.session
  if (session === null || typeof session !== 'object' || typeof session.createdAt !== 'number') {
    throw new Error('session file lacks a valid session header')
  }
  const events = doc.events
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('session file carries no events')
  }
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]
    if (event === null || typeof event !== 'object' || event.seq !== i) {
      throw new Error('session file events are not contiguous from seq 0 (broken at index ' + i + ')')
    }
  }
  return { session, events }
}

/** Fresh session id in the product's own shape. */
function newSessionId() {
  function hex(n) {
    let out = ''
    for (let i = 0; i < n; i += 1) out += Math.floor(Math.random() * 16).toString(16)
    return out
  }
  return 'session-' + hex(8) + '-' + hex(4) + '-' + hex(4) + '-' + hex(4) + '-' + hex(12)
}

/** Strip any directory prefix a caller added to a file name. */
function baseFileName(file) {
  return String(file === undefined || file === null ? '' : file)
    .replace(/^\.dsh-sessions\//, '')
    .replace(/^.*[\\/]/, '')
}

export const _internal = {
  slugify,
  fileNameFor,
  samePath,
  sessionStats,
  userMessageText,
  extractPrefixMeta,
  validateDoc,
  newSessionId,
  baseFileName,
}

// ---------- plugin ----------

export function apply(ctx) {
  const fs = ctx.fs
  const sandboxPolicy = ctx.sandboxPolicy
  const sessionQuery = ctx.sessionQuery
  const sessions = ctx.sessions

  function safeLog(level, message) {
    try { console[level]('session-git: ' + message) } catch (ignored) {}
  }

  /** Newest live session carrying a workspace cwd, or undefined. */
  function newestSessionWithCwd() {
    let best = undefined
    for (const session of sessions.list()) {
      const header = session.header
      if (header === undefined || typeof header.cwd !== 'string' || header.cwd.length === 0) continue
      if (best === undefined || header.createdAt > best.header.createdAt) best = session
    }
    return best
  }

  /** Absolute workspace root for one tool call (agent cwd aware). */
  function resolveRoot(argsPath, exec) {
    if (typeof argsPath === 'string' && argsPath.trim().length > 0) return argsPath.trim()
    const agent = exec !== undefined ? exec.agent : undefined
    const cwd = agent !== undefined && agent.session !== undefined && agent.session.header !== undefined
      ? agent.session.header.cwd
      : undefined
    if (typeof cwd === 'string' && cwd.length > 0) return cwd
    return sandboxPolicy.workspaceRoot
  }

  /** Absolute workspace root for one RPC call (no agent context): explicit path, else newest session cwd, else workspace root. */
  function resolveRpcRoot(argsPath) {
    if (typeof argsPath === 'string' && argsPath.trim().length > 0) return argsPath.trim()
    const newest = newestSessionWithCwd()
    if (newest !== undefined && typeof newest.header.cwd === 'string') return newest.header.cwd
    return sandboxPolicy.workspaceRoot
  }

  function dirTarget(root, signal) {
    return fs.resolve(STORE_DIR, { cwd: root, signal })
  }

  function fileTarget(root, fileName, signal) {
    if (typeof fileName !== 'string' || fileName.length === 0
      || fileName.indexOf('/') !== -1 || fileName.indexOf('\\') !== -1 || fileName.indexOf('..') !== -1) {
      throw new Error('invalid session file name: ' + JSON.stringify(fileName))
    }
    return fs.resolve(STORE_DIR + '/' + fileName, { cwd: root, signal })
  }

  /** Titles for a batch of session ids. */
  async function titlesFor(ids, signal) {
    const map = {}
    if (ids.length === 0) return map
    try {
      const results = await sessionQuery.readTitleSnapshots(ids, signal)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== undefined && result.value.title !== undefined) {
          map[result.sessionId] = result.value.title.title
        }
      }
    } catch (error) {
      safeLog('warn', 'title lookup failed: ' + String(error))
    }
    return map
  }

  /** Serialize one session snapshot into the portable document (meta first, events last). */
  function buildDoc(snap, title, savedBy) {
    return {
      format: FORMAT,
      savedAt: Date.now(),
      savedBy: typeof savedBy === 'string' ? savedBy : '',
      session: snap.session,
      title: typeof title === 'string' && title.length > 0 ? title : '',
      stats: sessionStats(snap.events),
      eventCount: snap.events.length,
      events: snap.events,
    }
  }

  /** Read one saved file fully and validate it. Uses streamText: readText is capped at 256 KiB by the fs service, and saved session logs routinely exceed that. */
  async function readSavedDoc(root, rawFile, signal) {
    const fileName = baseFileName(rawFile)
    const target = await fileTarget(root, fileName, signal)
    const chunks = []
    const stream = await fs.streamText(target, signal)
    for await (const chunk of stream) chunks.push(chunk)
    const text = chunks.join('')
    let doc
    try { doc = JSON.parse(text) } catch (error) {
      throw new Error('saved session file is not valid JSON: ' + fileName)
    }
    return { doc: validateDoc(doc), raw: doc, fileName }
  }

  /**
   * True prefix read: streamText with an early break. fs.readBytes is NOT a
   * prefix read — its maxBytes bounds the COMPLETE content and it rejects any
   * larger file outright (FS_TOO_LARGE), so it cannot sample a big file's head.
   * Breaking the for-await loop closes the underlying read stream. Decoded
   * chars are never more than UTF-8 bytes, so wantChars chars always cover
   * wantChars bytes of the file head.
   */
  async function readPrefixText(target, wantChars, signal) {
    const chunks = []
    let total = 0
    const stream = await fs.streamText(target, signal)
    for await (const chunk of stream) {
      chunks.push(chunk)
      total += chunk.length
      if (total >= wantChars) break
    }
    return chunks.join('')
  }

  // ---------- root-explicit operations (shared by tools and RPC) ----------

  /** Save one session by id into root. Returns the saved-item record. */
  async function saveOne(sessionId, root, savedBy, signal) {
    const snap = await sessionQuery.readSession(sessionId)
    if (snap === undefined || snap.events === undefined || snap.events.length === 0) {
      throw new Error('session "' + sessionId + '" has no events to save')
    }
    const titles = await titlesFor([sessionId], signal)
    const title = titles[sessionId] !== undefined ? titles[sessionId] : ''
    const doc = buildDoc(snap, title, savedBy)
    const fileName = fileNameFor(title, sessionId)
    const target = await fileTarget(root, fileName, signal)
    const serialized = JSON.stringify(doc)
    await fs.writeText(target, serialized, undefined, signal, sandboxPolicy.resolve({}))
    return {
      file: STORE_DIR + '/' + fileName,
      sessionId,
      title,
      events: snap.events.length,
      bytes: serialized.length,
    }
  }

  /** Save explicit session ids (tool single/all and UI batch share this). */
  async function saveSessions(sessionIds, root, savedBy, signal) {
    const saved = []
    const failures = []
    for (const sessionId of sessionIds) {
      try {
        saved.push(await saveOne(sessionId, root, savedBy, signal))
      } catch (error) {
        failures.push({
          sessionId,
          error: String(error !== undefined && error !== null && typeof error.message === 'string' ? error.message : error),
        })
      }
    }
    return { saved, failures }
  }

  /** List the DSH sessions that belong to one workspace root. */
  async function listWorkspaceSessions(root, signal) {
    const records = await sessionQuery.listSessions(signal)
    const mine = records
      .filter((r) => samePath(r.header.cwd, root))
      .sort((a, b) => b.header.createdAt - a.header.createdAt)
      .slice(0, 50)
    const titles = await titlesFor(mine.map((r) => r.header.id), signal)
    const items = mine.map((r) => ({
      sessionId: r.header.id,
      title: titles[r.header.id] !== undefined ? titles[r.header.id] : '',
      createdAt: r.header.createdAt,
      preset: typeof r.header.agentPreset === 'string' ? r.header.agentPreset : '',
      live: r.live,
      persisted: r.persisted,
    }))
    return { root, total: items.length, items }
  }

  /** List the saved session files under one workspace root. */
  async function listSavedFiles(root, signal) {
    const dir = await dirTarget(root, signal)
    const info = await fs.stat(dir, signal)
    if (info === undefined || info.type !== 'directory') {
      return { root, dir: STORE_DIR, total: 0, items: [], note: '该项目还没有 ' + STORE_DIR + '/ 目录' }
    }
    const entries = await fs.listDir(dir, signal)
    const files = entries
      .filter((e) => e.type === 'file' && typeof e.name === 'string' && e.name.endsWith('.json'))
      .slice(0, LIST_FILE_CAP)
    const items = []
    for (const entry of files) {
      try {
        if (typeof entry.size === 'number' && entry.size > PREFIX_BYTES) {
          const target = await fileTarget(root, entry.name, signal)
          const prefixText = await readPrefixText(target, PREFIX_CHARS, signal)
          const meta = extractPrefixMeta(prefixText)
          items.push({
            file: STORE_DIR + '/' + entry.name,
            title: meta.title !== undefined ? meta.title : '',
            sessionId: meta.sessionId !== undefined ? meta.sessionId : '',
            createdAt: meta.createdAt !== undefined ? meta.createdAt : 0,
            savedAt: meta.savedAt !== undefined ? meta.savedAt : 0,
            cwd: meta.cwd !== undefined ? meta.cwd : '',
            preset: meta.agentPreset !== undefined ? meta.agentPreset : '',
            events: meta.eventCount !== undefined ? meta.eventCount : 0,
            bytes: entry.size,
            large: true,
          })
        } else {
          const { raw } = await readSavedDoc(root, entry.name, signal)
          items.push({
            file: STORE_DIR + '/' + entry.name,
            title: typeof raw.title === 'string' ? raw.title : '',
            sessionId: typeof raw.session.id === 'string' ? raw.session.id : '',
            createdAt: raw.session.createdAt,
            savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
            cwd: typeof raw.session.cwd === 'string' ? raw.session.cwd : '',
            preset: typeof raw.session.agentPreset === 'string' ? raw.session.agentPreset : '',
            events: Array.isArray(raw.events) ? raw.events.length : 0,
            bytes: typeof entry.size === 'number' ? entry.size : 0,
            large: false,
          })
        }
      } catch (error) {
        items.push({ file: STORE_DIR + '/' + entry.name, error: String(error !== undefined && error !== null && typeof error.message === 'string' ? error.message : error) })
      }
    }
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    return { root, dir: STORE_DIR, total: items.length, items }
  }

  /** Preview one saved file without importing. */
  async function showSavedFile(root, rawFile, signal) {
    const fileName = baseFileName(rawFile)
    const { raw, doc } = await readSavedDoc(root, fileName, signal)
    let firstUser = ''
    for (const event of doc.events) {
      if (event.type === 'user/message') {
        const text = userMessageText(event.data).trim()
        if (text.length > 0) {
          firstUser = text.length > SHOW_TEXT_CAP ? text.slice(0, SHOW_TEXT_CAP - 1) + '…' : text
          break
        }
      }
    }
    const toolNames = []
    for (const event of doc.events) {
      if (event.type === 'tool/call' && event.data !== undefined && event.data !== null && typeof event.data.name === 'string') {
        if (toolNames.indexOf(event.data.name) === -1) toolNames.push(event.data.name)
        if (toolNames.length >= 30) break
      }
    }
    const last = doc.events[doc.events.length - 1]
    return {
      file: STORE_DIR + '/' + fileName,
      title: typeof raw.title === 'string' ? raw.title : '',
      sessionId: typeof doc.session.id === 'string' ? doc.session.id : '',
      originalCwd: typeof doc.session.cwd === 'string' ? doc.session.cwd : '',
      preset: typeof doc.session.agentPreset === 'string' ? doc.session.agentPreset : '',
      createdAt: doc.session.createdAt,
      savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
      stats: doc.stats,
      lastEventTime: last !== undefined && typeof last.time === 'number' ? last.time : 0,
      firstUserMessage: firstUser,
      toolNames,
    }
  }

  /**
   * Import one saved file as a NEW native session — HOT: the session enters
   * the live SessionStore, whose `announce` fires the `session/created` cordis
   * event; the API proxy forwards it as a `host/session-added` frame and the
   * sidebar upserts the row immediately (no restart). The persistence
   * coordinator listens on the same event (untracked id, no artifact →
   * register meta + persist the seed), and `sessions.flush()` awaits that
   * durability. Writing the persistence backend directly (the previous
   * implementation) skips the store and the event, so the UI only saw the
   * import after a restart.
   */
  async function loadSavedFile(root, rawFile, signal) {
    const fileName = baseFileName(rawFile)
    const { doc } = await readSavedDoc(root, fileName, signal)
    const newId = newSessionId()
    const meta = {
      cwd: root,
      createdAt: doc.session.createdAt,
      seedLength: doc.events.length,
    }
    if (typeof doc.session.agentPreset === 'string' && doc.session.agentPreset.length > 0) {
      meta.agentPreset = doc.session.agentPreset
    }
    if (typeof doc.session.parentSession === 'string' && doc.session.parentSession.length > 0) {
      meta.parentSession = doc.session.parentSession
    }
    let session
    try {
      session = sessions.create(newId, { seed: doc.events, meta })
    } catch (error) {
      throw new Error('import failed while constructing the session: ' + String(error !== undefined && error !== null && typeof error.message === 'string' ? error.message : error))
    }
    try {
      await sessions.flush(session)
    } catch (error) {
      throw new Error('import failed while persisting the log: ' + String(error !== undefined && error !== null && typeof error.message === 'string' ? error.message : error))
    }
    safeLog('info', 'imported ' + fileName + ' as session ' + newId + ' (' + doc.events.length + ' events) into ' + root)
    return {
      imported: newId,
      file: STORE_DIR + '/' + fileName,
      title: typeof doc.title === 'string' ? doc.title : '',
      events: doc.events.length,
      cwd: root,
    }
  }

  // ---------- tool wrappers ----------

  async function opSave(args, exec, signal) {
    const root = resolveRoot(args.path, exec)
    const savedBy = exec !== undefined && exec.agent !== undefined ? exec.agent.id : ''
    if (args.all === true) {
      const records = await sessionQuery.listSessions(signal)
      const mine = records
        .filter((r) => samePath(r.header.cwd, root))
        .sort((a, b) => b.header.createdAt - a.header.createdAt)
        .slice(0, SAVE_ALL_CAP)
      if (mine.length === 0) {
        return { root, saved: [], total: 0, note: '该工作区没有可保存的会话' }
      }
      const { saved, failures } = await saveSessions(mine.map((r) => r.header.id), root, savedBy, signal)
      return { root, saved, total: saved.length, failures, note: '每次最多保存 ' + SAVE_ALL_CAP + ' 个（按创建时间从新到旧）' }
    }
    const sessionId = typeof args.sessionId === 'string' && args.sessionId.length > 0 ? args.sessionId : savedBy
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new Error('no target session: pass sessionId, or call inside a session')
    }
    const { saved, failures } = await saveSessions([sessionId], root, savedBy, signal)
    if (saved.length === 0) {
      throw new Error(failures.length > 0 ? failures[0].error : 'save failed')
    }
    return { root, saved, total: saved.length }
  }

  async function opSessions(args, exec, signal) {
    return await listWorkspaceSessions(resolveRoot(args.path, exec), signal)
  }

  async function opList(args, exec, signal) {
    return await listSavedFiles(resolveRoot(args.path, exec), signal)
  }

  async function opShow(args, exec, signal) {
    return await showSavedFile(resolveRoot(args.path, exec), args.file, signal)
  }

  async function opLoad(args, exec, signal) {
    const root = resolveRoot(args.path, exec)
    const result = await loadSavedFile(root, args.file, signal)
    return {
      ...result,
      note: '已导入为本机原生会话并立即出现在会话列表（热加载，无需重启）。打开它即可完整复现协作现场并继续对话。原文件不受影响，可重复导入（每次生成新会话）。',
    }
  }

  // ---------- settings-page RPC (loopback-only) ----------

  function rpcOk(value) {
    return { ok: true, value }
  }
  function rpcError(message) {
    return { ok: false, error: { message: String(message) } }
  }

  ctx.effect(() => ctx.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload, signal) => {
    try {
      const args = payload !== undefined && payload !== null && typeof payload === 'object' ? payload : {}
      const path = typeof args.path === 'string' ? args.path : ''
      if (endpoint === 'session/list') {
        return rpcOk(await listWorkspaceSessions(resolveRpcRoot(path), signal))
      }
      if (endpoint === 'git/list') {
        return rpcOk(await listSavedFiles(resolveRpcRoot(path), signal))
      }
      if (endpoint === 'git/show') {
        return rpcOk(await showSavedFile(resolveRpcRoot(path), args.file, signal))
      }
      if (endpoint === 'git/save') {
        const ids = Array.isArray(args.sessionIds) ? args.sessionIds.filter((id) => typeof id === 'string' && id.length > 0) : []
        if (ids.length === 0) throw new Error('git/save: sessionIds must be a non-empty array of session ids')
        const root = resolveRpcRoot(path)
        const { saved, failures } = await saveSessions(ids, root, 'settings-ui', signal)
        return rpcOk({ root, saved, failures, total: saved.length })
      }
      if (endpoint === 'git/load') {
        return rpcOk(await loadSavedFile(resolveRpcRoot(path), args.file, signal))
      }
      return rpcError('unknown session-git endpoint: ' + String(endpoint))
    } catch (error) {
      return rpcError(error instanceof Error ? error.message : String(error))
    }
  }, { authority: 'loopback' }), 'session-git: rpc')

  // ---------- tool definitions ----------

  const savedItemSchema = {
    type: 'object',
    properties: {
      file: { type: 'string' },
      sessionId: { type: 'string' },
      title: { type: 'string' },
      events: { type: 'number' },
      bytes: { type: 'number' },
      createdAt: { type: 'number' },
      savedAt: { type: 'number' },
      cwd: { type: 'string' },
      preset: { type: 'string' },
      large: { type: 'boolean' },
      error: { type: 'string' },
    },
    additionalProperties: false,
  }

  const toolDefs = [
    {
      name: 'session_git_save',
      description: '把一个 DSH 会话导出为项目路径下的 JSON 文件（<项目>/.dsh-sessions/），可随代码一起 git 提交。默认保存当前会话；all:true 保存该工作区最近的会话（上限 20）。',
      parameters: {
        sessionId: { type: 'string', description: '要保存的会话 id；省略则保存当前会话' },
        path: { type: 'string', description: '项目根路径；省略则用当前会话的工作目录' },
        all: { type: 'boolean', description: 'true 时保存该工作区最近的所有会话（上限 20），忽略 sessionId' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            root: { type: 'string', required: true },
            total: { type: 'number', required: true },
            saved: { type: 'array', items: savedItemSchema, required: true },
            failures: { type: 'array', items: { type: 'object', properties: { sessionId: { type: 'string' }, error: { type: 'string' } }, additionalProperties: false } },
            note: { type: 'string' },
          },
          additionalProperties: false,
        },
        render: (_args, value) => {
          const lines = ['已保存 ' + value.total + ' 个会话到 ' + value.root + '/' + STORE_DIR + '/：']
          for (const item of value.saved) {
            lines.push('- ' + item.file + '（' + item.events + ' 事件，约 ' + Math.round(item.bytes / 1024) + ' KB）' + (item.title !== '' ? '「' + item.title + '」' : ''))
          }
          if (Array.isArray(value.failures)) {
            for (const failure of value.failures) lines.push('! ' + failure.sessionId + ' 失败：' + failure.error)
          }
          if (value.note !== undefined) lines.push('(' + value.note + ')')
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      execute: async (args, exec) => await opSave(args, exec, exec.signal),
      isConcurrencySafe: () => false,
    },
    {
      name: 'session_git_sessions',
      description: '列出一个工作区（项目路径）下的 DSH 会话（id、标题、创建时间），作为保存候选。',
      parameters: {
        path: { type: 'string', description: '项目根路径；省略则用当前会话的工作目录' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            root: { type: 'string', required: true },
            total: { type: 'number', required: true },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sessionId: { type: 'string' },
                  title: { type: 'string' },
                  createdAt: { type: 'number' },
                  preset: { type: 'string' },
                  live: { type: 'boolean' },
                  persisted: { type: 'boolean' },
                },
                additionalProperties: false,
              },
              required: true,
            },
          },
          additionalProperties: false,
        },
        render: (_args, value) => {
          const lines = ['工作区 ' + value.root + ' 共 ' + value.total + ' 个会话：']
          for (const item of value.items) {
            lines.push('- ' + item.sessionId + ' [' + new Date(item.createdAt).toISOString().slice(0, 16).replace('T', ' ') + '] ' + (item.title !== '' ? item.title : '(无标题)'))
          }
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      execute: async (args, exec) => await opSessions(args, exec, exec.signal),
      isConcurrencySafe: () => true,
    },
    {
      name: 'session_git_list',
      description: '列出项目路径 .dsh-sessions/ 目录下已保存的会话文件（大文件只读头部元数据）。',
      parameters: {
        path: { type: 'string', description: '项目根路径；省略则用当前会话的工作目录' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            root: { type: 'string', required: true },
            dir: { type: 'string', required: true },
            total: { type: 'number', required: true },
            items: { type: 'array', items: savedItemSchema, required: true },
            note: { type: 'string' },
          },
          additionalProperties: false,
        },
        render: (_args, value) => {
          if (value.total === 0) return [{ type: 'text', text: value.note !== undefined ? value.note : '没有已保存的会话文件' }]
          const lines = [value.root + ' 下已保存 ' + value.total + ' 个会话文件：']
          for (const item of value.items) {
            if (item.error !== undefined) { lines.push('! ' + item.file + '（损坏：' + item.error + '）'); continue }
            lines.push('- ' + item.file + ' [' + new Date(item.createdAt || 0).toISOString().slice(0, 16).replace('T', ' ') + '] ' + (item.title !== '' ? item.title : '(无标题)') + '，' + item.events + ' 事件' + (item.large === true ? '，大文件' : ''))
          }
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      execute: async (args, exec) => await opList(args, exec, exec.signal),
      isConcurrencySafe: () => true,
    },
    {
      name: 'session_git_show',
      description: '预览一个已保存的会话文件（标题、统计、第一条用户消息、用过的工具），不导入。',
      parameters: {
        file: { type: 'string', required: true, description: 'session_git_list 返回的文件名（不含目录前缀也可）' },
        path: { type: 'string', description: '项目根路径；省略则用当前会话的工作目录' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            file: { type: 'string', required: true },
            title: { type: 'string' },
            sessionId: { type: 'string' },
            originalCwd: { type: 'string' },
            preset: { type: 'string' },
            createdAt: { type: 'number' },
            savedAt: { type: 'number' },
            stats: { type: 'object', required: true, additionalProperties: true },
            lastEventTime: { type: 'number' },
            firstUserMessage: { type: 'string' },
            toolNames: { type: 'array', items: { type: 'string' }, required: true },
          },
          additionalProperties: false,
        },
        render: (_args, value) => {
          const lines = [
            '「' + (value.title !== '' ? value.title : value.file) + '」',
            '原会话 ' + value.sessionId + '，创建于 ' + new Date(value.createdAt).toISOString().slice(0, 16).replace('T', ' ') + '，原工作目录 ' + (value.originalCwd !== '' ? value.originalCwd : '-') + '，预设 ' + (value.preset !== '' ? value.preset : '-'),
            '规模：' + value.stats.events + ' 事件（用户消息 ' + value.stats.userMessages + '，助手消息 ' + value.stats.assistantMessages + '，工具调用 ' + value.stats.toolCalls + '，轮次 ' + value.stats.turns + '）',
            '工具：' + (value.toolNames.length > 0 ? value.toolNames.join(', ') : '（无）'),
            '',
            '第一条用户消息：',
            value.firstUserMessage !== '' ? value.firstUserMessage : '（无文本消息）',
          ]
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      execute: async (args, exec) => await opShow(args, exec, exec.signal),
      isConcurrencySafe: () => true,
    },
    {
      name: 'session_git_load',
      description: '把项目路径下已保存的会话文件导入为本机新会话（写入持久存储，出现在会话列表，可打开继续对话，完整复现协作现场）。原文件不受影响。',
      parameters: {
        file: { type: 'string', required: true, description: 'session_git_list 返回的文件名（不含目录前缀也可）' },
        path: { type: 'string', description: '项目根路径；省略则用当前会话的工作目录' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            imported: { type: 'string', required: true },
            file: { type: 'string', required: true },
            title: { type: 'string' },
            events: { type: 'number', required: true },
            cwd: { type: 'string', required: true },
            note: { type: 'string' },
          },
          additionalProperties: false,
        },
        render: (_args, value) => {
          return [{ type: 'text', text: '已导入会话 ' + value.imported + '（' + value.events + ' 事件' + (value.title !== '' ? '，「' + value.title + '」' : '') + '）。在会话列表中打开即可继续。\n' + value.note }]
        },
      },
      execute: async (args, exec) => await opLoad(args, exec, exec.signal),
      isConcurrencySafe: () => false,
    },
  ]

  for (const def of toolDefs) {
    ctx.effect(() => ctx.tools.register(defineTool(def)), 'session-git: tool ' + def.name)
  }

  safeLog('log', 'active (' + toolDefs.length + ' tools, rpc channel ' + RPC_CHANNEL + ', store dir ' + STORE_DIR + '/)')
}
