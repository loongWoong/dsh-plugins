/**
 * dsh-memarc — Host half.
 *
 * Two capabilities, both built on stock DSH services:
 *
 * 1. Memory store: durable JSON entries per workspace at
 *    `<workspace>/.dsh-memory/memory.json`, written through `ctx.fs` under the
 *    session's resolved sandbox policy (workspace-write stays inside the
 *    workspace). Model tools: memory_save / memory_search / memory_list /
 *    memory_delete.
 *
 * 2. Session archive: wraps the registry-global archive set owned by
 *    `ctx.workspaceRegistry` (archiveSession hides a session from every
 *    grouping surface while keeping its log) and adds listing plus full-text
 *    search over archived sessions through `ctx.sessionQuery`. Model tools:
 *    session_archive / session_unarchive / archive_list / archive_search.
 *    Loopback-only management (Settings page): batch unarchive and batch
 *    permanent delete of archived sessions — delete refuses live sessions,
 *    removes the session's persisted artifact directory via the backend's own
 *    `locate`, prunes workspace accounting, and drops the archive-set entry.
 *
 * The Settings page talks to the same operations over one loopback-only
 * `connection.rpc` channel ("/memarc").
 */
import { rm, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'memarc'

export const inject = [
  'fs',
  'sandboxPolicy',
  'workspaceRegistry',
  'sessionPersistence',
  'sessionQuery',
  'sessions',
  'connection',
  'tools',
]

const STORE_DIR = '.dsh-memory'
const STORE_FILE = 'memory.json'
const RPC_CHANNEL = '/memarc'

export function apply(ctx) {
  // ---------- memory store helpers ----------

  /** Newest live session carrying a workspace cwd, or undefined. */
  function newestSessionWithCwd() {
    let best = undefined
    for (const session of ctx.sessions.list()) {
      const header = session.header
      if (header === undefined || typeof header.cwd !== 'string' || header.cwd.length === 0) continue
      if (best === undefined || header.createdAt > best.header.createdAt) best = session
    }
    return best
  }

  /** Resolve a session from a live Session, a session id, or "newest with cwd". */
  function resolveSession(ref) {
    if (ref !== undefined && ref !== null && typeof ref === 'object') return ref
    if (typeof ref === 'string' && ref.length > 0) {
      const found = ctx.sessions.get(ref)
      if (found !== undefined) return found
    }
    return newestSessionWithCwd()
  }

  /** Workspace root the memory store lives under for one session reference. */
  function storeContext(sessionRef) {
    const session = resolveSession(sessionRef)
    const cwd = session !== undefined && session.header !== undefined ? session.header.cwd : undefined
    const root = (typeof cwd === 'string' && cwd.length > 0) ? cwd : ctx.sandboxPolicy.workspaceRoot
    return { session, root }
  }

  function storeTarget(root, signal) {
    return ctx.fs.resolve(STORE_DIR + '/' + STORE_FILE, { cwd: root, signal })
  }

  async function loadStore(root, signal) {
    const target = await storeTarget(root, signal)
    const info = await ctx.fs.stat(target, signal)
    if (info === undefined) return { version: 1, entries: [] }
    const text = await ctx.fs.readText(target, signal)
    try {
      const doc = JSON.parse(text)
      if (doc !== null && typeof doc === 'object' && Array.isArray(doc.entries)) {
        return { version: 1, entries: doc.entries }
      }
    } catch (error) {
      console.error('memarc: memory store unreadable, starting fresh:', String(error))
    }
    return { version: 1, entries: [] }
  }

  async function saveStore(root, doc, session, signal) {
    const target = await storeTarget(root, signal)
    const policy = ctx.sandboxPolicy.resolve(session === undefined ? {} : { session })
    await ctx.fs.writeText(target, JSON.stringify(doc, null, 2), undefined, signal, policy)
    return target.displayPath
  }

  function newId() {
    return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  }

  function normalizeTags(raw) {
    if (!Array.isArray(raw)) return []
    const out = []
    for (const tag of raw) {
      if (typeof tag !== 'string') continue
      const value = tag.trim()
      if (value.length > 0 && out.indexOf(value) === -1) out.push(value)
      if (out.length >= 8) break
    }
    return out
  }

  function sanitizeEntry(entry) {
    const raw = (entry !== null && typeof entry === 'object') ? entry : {}
    return {
      id: typeof raw.id === 'string' ? raw.id : '',
      text: typeof raw.text === 'string' ? raw.text : String(raw.text),
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string') : [],
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : '',
    }
  }

  function sortNewest(entries) {
    return entries.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }

  // ---------- memory operations ----------

  async function memList(sessionRef, tag, limit, signal) {
    const store = storeContext(sessionRef)
    const doc = await loadStore(store.root, signal)
    let entries = sortNewest(doc.entries).map(sanitizeEntry)
    if (typeof tag === 'string' && tag.length > 0) {
      entries = entries.filter((e) => e.tags.indexOf(tag) !== -1)
    }
    const total = entries.length
    if (typeof limit === 'number' && limit > 0) entries = entries.slice(0, limit)
    return { root: store.root, file: STORE_DIR + '/' + STORE_FILE, total, entries }
  }

  async function memAdd(sessionRef, text, tags, signal) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('memory text must be a non-empty string')
    }
    const store = storeContext(sessionRef)
    const doc = await loadStore(store.root, signal)
    const now = Date.now()
    const entry = {
      id: newId(),
      text: text.trim(),
      tags: normalizeTags(tags),
      createdAt: now,
      updatedAt: now,
      sessionId: store.session !== undefined ? store.session.header.id : '',
    }
    doc.entries.push(entry)
    const file = await saveStore(store.root, doc, store.session, signal)
    return { entry: sanitizeEntry(entry), file, total: doc.entries.length }
  }

  async function memDelete(sessionRef, id, signal) {
    if (typeof id !== 'string' || id.length === 0) throw new Error('memory id must be a non-empty string')
    const store = storeContext(sessionRef)
    const doc = await loadStore(store.root, signal)
    const before = doc.entries.length
    doc.entries = doc.entries.filter((e) => e.id !== id)
    if (doc.entries.length === before) return { deleted: false, total: before }
    await saveStore(store.root, doc, store.session, signal)
    return { deleted: true, total: doc.entries.length }
  }

  async function memSearch(sessionRef, text, limit, signal) {
    const store = storeContext(sessionRef)
    const doc = await loadStore(store.root, signal)
    const needle = String(text === undefined || text === null ? '' : text).trim().toLowerCase()
    let entries = sortNewest(doc.entries).map(sanitizeEntry)
    if (needle.length > 0) {
      entries = entries.filter((e) =>
        e.text.toLowerCase().indexOf(needle) !== -1 ||
        e.tags.join(' ').toLowerCase().indexOf(needle) !== -1)
    }
    if (typeof limit === 'number' && limit > 0) entries = entries.slice(0, limit)
    return { root: store.root, total: entries.length, entries }
  }

  // ---------- archive operations ----------

  async function arcArchive(explicitId, fallbackId, signal) {
    const target = (typeof explicitId === 'string' && explicitId.length > 0) ? explicitId : fallbackId
    if (typeof target !== 'string' || target.length === 0) {
      throw new Error('session_archive: no target session id (call it inside a session or pass sessionId)')
    }
    await ctx.workspaceRegistry.archiveSession(target)
    return { archived: target, total: ctx.workspaceRegistry.archivedSessionIds.length }
  }

  async function titlesFor(ids, signal) {
    const map = {}
    if (ids.length === 0) return map
    try {
      const results = await ctx.sessionQuery.readTitleSnapshots(ids, signal)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== undefined && result.value.title !== undefined) {
          map[result.sessionId] = result.value.title.title
        }
      }
    } catch (error) {
      console.error('memarc: title lookup failed:', String(error))
    }
    return map
  }

  async function arcList(limit, signal) {
    const ids = ctx.workspaceRegistry.archivedSessionIds.slice()
    const records = await ctx.sessionQuery.listSessions(signal)
    const byId = new Map()
    for (const record of records) byId.set(record.header.id, record)
    const titles = await titlesFor(ids, signal)
    const items = []
    for (const id of ids) {
      const record = byId.get(id)
      items.push({
        sessionId: id,
        title: titles[id] !== undefined ? titles[id] : '',
        createdAt: record !== undefined ? record.header.createdAt : 0,
        cwd: record !== undefined && typeof record.header.cwd === 'string' ? record.header.cwd : '',
        live: record !== undefined ? record.live : false,
        persisted: record !== undefined ? record.persisted : false,
      })
    }
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    const capped = (typeof limit === 'number' && limit > 0) ? items.slice(0, limit) : items
    return { total: items.length, items: capped }
  }

  async function arcSearch(text, limit, signal) {
    const query = typeof text === 'string' ? text.trim() : ''
    if (query.length === 0) throw new Error('archive_search: query must be a non-empty string')
    const ids = ctx.workspaceRegistry.archivedSessionIds.slice()
    if (ids.length === 0) return { total: 0, items: [] }
    const pageLimit = (typeof limit === 'number' && limit > 0) ? Math.min(limit, 50) : 10
    const page = await ctx.sessionQuery.searchSessions({
      query,
      sessionFilters: [{ kind: 'id', values: ids }],
      limit: pageLimit,
    }, { signal })
    const hitIds = []
    for (const hit of page.items) hitIds.push(hit.header.id)
    const titles = await titlesFor(hitIds, signal)
    const items = []
    for (const hit of page.items) {
      const best = hit.bestMatch
      items.push({
        sessionId: hit.header.id,
        title: titles[hit.header.id] !== undefined ? titles[hit.header.id] : '',
        snippet: best !== undefined ? best.snippet : '',
        seq: best !== undefined ? best.seq : 0,
        time: best !== undefined ? best.time : 0,
      })
    }
    return { total: items.length, items }
  }

  // ---------- archive management: unarchive + delete ----------

  function normalizeIdList(ids) {
    if (!Array.isArray(ids)) return []
    const out = []
    for (const id of ids) {
      if (typeof id !== 'string') continue
      const value = id.trim()
      if (value.length > 0 && out.indexOf(value) === -1) out.push(value)
    }
    return out
  }

  /** Mirror of the JSONL backend's encodeSegment, for fallback directory scans. */
  function encodeSegmentLike(raw) {
    if (raw.length === 0) return ''
    if (raw === '.') return '~002E'
    if (raw === '..') return '~002E~002E'
    let out = ''
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i)
      const ch = String.fromCharCode(code)
      if (ch !== '~' && /[A-Za-z0-9._-]/.test(ch)) out += ch
      else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
    }
    return out
  }

  function isEnoent(error) {
    return error !== null && typeof error === 'object' && error.code === 'ENOENT'
  }

  async function pathExists(path) {
    try {
      await stat(path)
      return true
    } catch (error) {
      if (isEnoent(error)) return false
      throw error
    }
  }

  /**
   * Drop one session's header from the workspace registry's in-memory index so
   * the next accounting mutate prunes it instead of resurrecting the deleted
   * session's membership from a stale cached cwd.
   */
  function forgetSessionHeader(id) {
    const reg = ctx.workspaceRegistry
    try {
      if (reg.headers instanceof Map) reg.headers.delete(id)
      if (reg.sessionPaths instanceof Map) reg.sessionPaths.delete(id)
      if (reg.invalidSessionPaths instanceof Map) reg.invalidSessionPaths.delete(id)
    } catch (error) {
      console.error('memarc: forget session header failed for', id, String(error))
    }
  }

  /** Derive the persistence backend's root from any located artifact: <root>/<project>/<sessionDir>/<file>. */
  async function sessionsRoot(signal) {
    const persistence = ctx.sessionPersistence
    if (persistence === undefined) return undefined
    try {
      const headers = await persistence.list(signal)
      for (const header of headers) {
        try {
          const loc = persistence.locate(header)
          if (loc !== undefined && typeof loc.path === 'string' && loc.path.length > 0) {
            return dirname(dirname(dirname(loc.path)))
          }
        } catch (error) {
          if (!isEnoent(error)) console.error('memarc: locate failed during root derivation:', String(error))
        }
      }
    } catch (error) {
      console.error('memarc: persistence list failed during root derivation:', String(error))
    }
    return undefined
  }

  /**
   * Resolve the on-disk session directories for one id. Primary: the
   * persistence backend's own `locate(header)`. Fallback: scan every project
   * directory for a session directory named after the id (raw or encoded).
   */
  async function artifactDirsFor(header, id, signal) {
    const persistence = ctx.sessionPersistence
    const dirs = []
    if (persistence !== undefined && header !== undefined) {
      try {
        const loc = persistence.locate(header)
        if (loc !== undefined && typeof loc.path === 'string' && loc.path.length > 0) {
          if (await pathExists(loc.path)) dirs.push(dirname(loc.path))
        }
      } catch (error) {
        console.error('memarc: locate failed for', id, String(error))
      }
      if (dirs.length > 0) return dirs
    }
    const root = await sessionsRoot(signal)
    if (root === undefined) return dirs
    const encoded = encodeSegmentLike(id)
    let projects
    try {
      projects = await readdir(root, { withFileTypes: true })
    } catch (error) {
      if (!isEnoent(error)) console.error('memarc: sessions root scan failed:', String(error))
      return dirs
    }
    for (const project of projects) {
      if (!project.isDirectory()) continue
      const projectPath = join(root, project.name)
      let entries
      try {
        entries = await readdir(projectPath, { withFileTypes: true })
      } catch (error) {
        if (!isEnoent(error)) console.error('memarc: project scan failed for', projectPath, String(error))
        continue
      }
      for (const entry of entries) {
        if (entry.isDirectory() && (entry.name === id || entry.name === encoded)) {
          dirs.push(join(projectPath, entry.name))
        }
      }
    }
    return dirs
  }

  /**
   * Remove ids from the registry-global archive set through the registry's own
   * serialized operation queue, so the durable write emits `domain/changed` and
   * every connected page receives `host/archived-sessions-changed`.
   */
  async function dropFromArchiveSet(ids) {
    const reg = ctx.workspaceRegistry
    let removed = 0
    await reg.enqueueOperation(async () => {
      const state = reg.requireState()
      const drop = new Set(ids)
      const next = state.archivedSessionIds.filter((value) => !drop.has(String(value)))
      removed = state.archivedSessionIds.length - next.length
      if (removed > 0) await reg.setState({ ...state, archivedSessionIds: next })
    })
    return removed
  }

  async function arcUnarchive(ids) {
    const wanted = normalizeIdList(ids)
    if (wanted.length === 0) throw new Error('unarchive: no session ids given')
    const removed = await dropFromArchiveSet(wanted)
    return {
      unarchived: removed,
      requested: wanted.length,
      archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds],
    }
  }

  async function arcDelete(ids, signal) {
    const wanted = normalizeIdList(ids)
    if (wanted.length === 0) throw new Error('archive delete: no session ids given')
    const reg = ctx.workspaceRegistry
    const archived = new Set(reg.archivedSessionIds.map(String))

    const results = []
    const records = await ctx.sessionQuery.listSessions(signal)
    const recordById = new Map()
    for (const record of records) recordById.set(String(record.header.id), record)
    for (const id of wanted) {
      if (!archived.has(id)) {
        results.push({ sessionId: id, ok: false, reason: 'not-archived' })
        continue
      }
      const record = recordById.get(id)
      try {
        if (record !== undefined && record.live) {
          results.push({ sessionId: id, ok: false, reason: 'live' })
          continue
        }
        const header = record !== undefined ? record.header : undefined
        const dirs = await artifactDirsFor(header, id, signal)
        if (dirs.length === 0) {
          results.push({ sessionId: id, ok: true, reason: 'missing' })
        } else {
          for (const dir of dirs) await rm(dir, { recursive: true, force: true })
          results.push({ sessionId: id, ok: true, reason: 'deleted' })
        }
      } catch (error) {
        results.push({
          sessionId: id,
          ok: false,
          reason: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const processed = results.filter((entry) => entry.ok).map((entry) => entry.sessionId)
    for (const id of processed) {
      forgetSessionHeader(id)
      for (const workspace of reg.list()) {
        try {
          await workspace.detachSession(id)
        } catch (error) {
          console.error('memarc: detach failed for', id, String(error))
        }
      }
    }
    if (processed.length > 0) await dropFromArchiveSet(processed)

    return {
      results,
      deleted: results.filter((entry) => entry.ok).length,
      archivedSessionIds: [...reg.archivedSessionIds],
    }
  }

  // ---------- loopback RPC for the Settings page ----------

  function rpcOk(value) {
    return { ok: true, value }
  }

  function rpcError(message) {
    return { ok: false, error: { code: 'memarc', message, details: {} } }
  }

  function payloadOf(payload) {
    return (payload !== null && typeof payload === 'object') ? payload : {}
  }

  ctx.effect(() => ctx.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload, signal) => {
    const args = payloadOf(payload)
    try {
      switch (endpoint) {
        case 'status':
          return rpcOk({
            loopback: true,
            storeDir: STORE_DIR,
            storeFile: STORE_FILE,
            archivedTotal: ctx.workspaceRegistry.archivedSessionIds.length,
          })
        case 'mem/list':
          return rpcOk(await memList(args.sessionId, args.tag, args.limit, signal))
        case 'mem/add':
          return rpcOk(await memAdd(args.sessionId, args.text, args.tags, signal))
        case 'mem/delete':
          return rpcOk(await memDelete(args.sessionId, args.id, signal))
        case 'arc/list':
          return rpcOk(await arcList(args.limit, signal))
        case 'arc/archive':
          return rpcOk(await arcArchive(args.sessionId, undefined, signal))
        case 'arc/search':
          return rpcOk(await arcSearch(args.query, args.limit, signal))
        case 'arc/unarchive':
          return rpcOk(await arcUnarchive(args.sessionIds, signal))
        case 'arc/delete':
          return rpcOk(await arcDelete(args.sessionIds, signal))
        default:
          return rpcError(`unknown memarc endpoint: ${String(endpoint)}`)
      }
    } catch (error) {
      if (signal !== undefined && signal.aborted) throw error
      return rpcError(error instanceof Error ? error.message : String(error))
    }
  }, { authority: 'loopback' }), 'memarc: rpc')

  // ---------- model tools ----------

  const entrySchema = {
    type: 'object',
    properties: {
      id: { type: 'string', required: true },
      text: { type: 'string', required: true },
      tags: { type: 'array', items: { type: 'string' }, required: true },
      createdAt: { type: 'number', required: true },
      updatedAt: { type: 'number', required: true },
      sessionId: { type: 'string', required: true },
    },
    additionalProperties: false,
  }
  const arcItemSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string', required: true },
      title: { type: 'string', required: true },
      createdAt: { type: 'number', required: true },
      cwd: { type: 'string', required: true },
      live: { type: 'boolean', required: true },
      persisted: { type: 'boolean', required: true },
    },
    additionalProperties: false,
  }
  const arcHitSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string', required: true },
      title: { type: 'string', required: true },
      snippet: { type: 'string', required: true },
      seq: { type: 'number', required: true },
      time: { type: 'number', required: true },
    },
    additionalProperties: false,
  }

  function callerSession(exec) {
    return exec !== undefined && exec.agent !== undefined ? exec.agent.session : undefined
  }

  const toolDefs = [
    {
      name: 'memory_save',
      description: '保存一条长期记忆（用户偏好、项目约定、重要决策等）到当前工作区的记忆库 .dsh-memory/memory.json。text 应是一条完整、自含的事实。',
      parameters: {
        text: { type: 'string', required: true, description: '记忆正文（非空）' },
        tags: { type: 'array', items: { type: 'string' }, description: '可选标签，最多 8 个' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string', required: true },
            file: { type: 'string', required: true },
            total: { type: 'number', required: true },
          },
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: '已保存记忆 ' + value.id + '（共 ' + value.total + ' 条）→ ' + value.file }],
      },
      execute: async (args, exec) => {
        const result = await memAdd(callerSession(exec), args.text, args.tags, exec.signal)
        return { id: result.entry.id, file: result.file, total: result.total }
      },
      isConcurrencySafe: () => false,
    },
    {
      name: 'memory_search',
      description: '按关键词搜索记忆库（匹配正文与标签，大小写不敏感）。回忆用户偏好、项目约定时先调用此工具。',
      parameters: {
        query: { type: 'string', required: true, description: '关键词' },
        limit: { type: 'number', description: '最多返回条数，默认全部' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            total: { type: 'number', required: true },
            entries: { type: 'array', items: entrySchema, required: true },
          },
          additionalProperties: false,
        },
        render: (_args, value) => {
          const lines = ['命中 ' + value.total + ' 条记忆：']
          for (const e of value.entries) lines.push('- [' + e.id + '] ' + e.text + (e.tags.length > 0 ? ' （标签：' + e.tags.join(', ') + '）' : ''))
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      execute: async (args, exec) => {
        const result = await memSearch(callerSession(exec), args.query, args.limit, exec.signal)
        return { total: result.total, entries: result.entries }
      },
      isConcurrencySafe: () => true,
    },
    {
      name: 'memory_list',
      description: '列出记忆库中的记忆（按时间倒序），可选按标签过滤。',
      parameters: {
        tag: { type: 'string', description: '可选：只列出带此标签的记忆' },
        limit: { type: 'number', description: '最多返回条数' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            total: { type: 'number', required: true },
            entries: { type: 'array', items: entrySchema, required: true },
          },
          additionalProperties: false,
        },
        render: (_args, value) => {
          const lines = ['记忆库共 ' + value.total + ' 条：']
          for (const e of value.entries) lines.push('- [' + e.id + '] ' + e.text)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      execute: async (args, exec) => {
        const result = await memList(callerSession(exec), args.tag, args.limit, exec.signal)
        return { total: result.total, entries: result.entries }
      },
      isConcurrencySafe: () => true,
    },
    {
      name: 'memory_delete',
      description: '按 id 删除记忆库中的一条记忆。',
      parameters: {
        id: { type: 'string', required: true, description: '记忆 id（来自 memory_list / memory_search）' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            deleted: { type: 'boolean', required: true },
            total: { type: 'number', required: true },
          },
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: value.deleted ? '已删除，剩余 ' + value.total + ' 条' : '未找到该记忆（剩余 ' + value.total + ' 条）' }],
      },
      execute: async (args, exec) => {
        return await memDelete(callerSession(exec), args.id, exec.signal)
      },
      isConcurrencySafe: () => false,
    },
    {
      name: 'session_archive',
      description: '归档一个会话：把它从侧边栏所有分组中隐藏（会话日志保留，仍可全文搜索与打开）。不带参数时归档当前会话。',
      parameters: {
        sessionId: { type: 'string', description: '要归档的会话 id；省略则归档当前会话' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            archived: { type: 'string', required: true },
            total: { type: 'number', required: true },
          },
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: '已归档会话 ' + value.archived + '（累计归档 ' + value.total + ' 个）' }],
      },
      execute: async (args, exec) => {
        const own = exec !== undefined && exec.agent !== undefined ? exec.agent.id : undefined
        return await arcArchive(args.sessionId, own, exec.signal)
      },
      isConcurrencySafe: () => false,
    },
    {
      name: 'session_unarchive',
      description: '取消归档一个或多个会话：把它们从归档集合移回侧边栏分组视图（会话日志不受影响）。支持传单个 sessionId 或 sessionIds 数组。',
      parameters: {
        sessionId: { type: 'string', description: '要取消归档的会话 id（单个）' },
        sessionIds: { type: 'array', items: { type: 'string' }, description: '要取消归档的会话 id 列表（批量）' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            unarchived: { type: 'number', required: true },
            requested: { type: 'number', required: true },
            total: { type: 'number', required: true },
          },
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: '已取消归档 ' + value.unarchived + ' / ' + value.requested + ' 个会话（剩余归档 ' + value.total + ' 个）' }],
      },
      execute: async (args, exec) => {
        const ids = Array.isArray(args.sessionIds) ? args.sessionIds : (args.sessionId !== undefined ? [args.sessionId] : [])
        const result = await arcUnarchive(ids, exec.signal)
        return { unarchived: result.unarchived, requested: result.requested, total: result.archivedSessionIds.length }
      },
      isConcurrencySafe: () => false,
    },
    {
      name: 'archive_search',
      description: '在已归档会话中做全文搜索，返回命中会话与片段。',
      parameters: {
        query: { type: 'string', required: true, description: '搜索关键词（非空）' },
        limit: { type: 'number', description: '最多返回会话数，默认 10，上限 50' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            total: { type: 'number', required: true },
            items: { type: 'array', items: arcHitSchema, required: true },
          },
          additionalProperties: false,
        },
        render: (_args, value) => {
          const lines = ['命中 ' + value.total + ' 个归档会话：']
          for (const item of value.items) lines.push('- [' + (item.title !== '' ? item.title : item.sessionId) + '] ' + item.snippet)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      execute: async (args, exec) => {
        return await arcSearch(args.query, args.limit, exec.signal)
      },
      isConcurrencySafe: () => true,
    },
    {
      name: 'archive_list',
      description: '列出所有已归档会话（含标题、创建时间、工作目录）。',
      parameters: {
        limit: { type: 'number', description: '最多返回条数' },
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            total: { type: 'number', required: true },
            items: { type: 'array', items: arcItemSchema, required: true },
          },
          additionalProperties: false,
        },
        render: (_args, value) => {
          const lines = ['已归档会话 ' + value.total + ' 个：']
          for (const item of value.items) lines.push('- [' + (item.title !== '' ? item.title : item.sessionId) + '] ' + new Date(item.createdAt).toISOString() + (item.cwd !== '' ? ' @ ' + item.cwd : ''))
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      execute: async (args, exec) => {
        return await arcList(args.limit, exec.signal)
      },
      isConcurrencySafe: () => true,
    },
  ]

  for (const def of toolDefs) {
    ctx.effect(() => ctx.tools.register(defineTool(def)), 'memarc: tool ' + def.name)
  }

  console.log('memarc: active (' + toolDefs.length + ' tools, rpc channel ' + RPC_CHANNEL + ')')
}
