/**
 * dsh-session-branches — Host half.
 *
 * Session Branches: visualize the fork relationships between DSH sessions.
 * Builds a forest of session trees per workspace from `header.parentSession`
 * (fork/continue branches) and `header.origin === 'subagent'` (delegation
 * children), and serves it to the browser half over one loopback-only
 * `connection.rpc` channel ("/sesbr").
 *
 * Consumes host services only (sessionQuery, workspaceRegistry optional via
 * ctx.get); publishes none, so it needs no isolate realm.
 */

export const name = 'session-branches'

export const inject = ['sessionQuery', 'connection']

const RPC_CHANNEL = '/sesbr'

function normCwd(p) {
  return typeof p === 'string' ? p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() : ''
}

function rpcOk(value) {
  return { ok: true, value }
}

function rpcError(message) {
  return { ok: false, error: { code: 'session-branches', message, details: {} } }
}

export function apply(ctx) {
  const sessionQuery = ctx.sessionQuery

  async function buildBranches(signal) {
    const records = await sessionQuery.listSessions(signal)
    const archivedSet = new Set()
    try {
      const registry = ctx.get('workspaceRegistry')
      if (registry !== undefined && registry.archivedSessionIds !== undefined) {
        for (const id of registry.archivedSessionIds) archivedSet.add(id)
      }
    } catch (registryError) {}

    const titles = {}
    try {
      const ids = records.map((r) => r.header.id)
      const results = await sessionQuery.readTitleSnapshots(ids, signal)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== undefined && result.value.title !== undefined) {
          titles[result.sessionId] = result.value.title.title
        }
      }
    } catch (titleError) {}

    const groups = new Map()
    for (const record of records) {
      const header = record.header
      const cwd = typeof header.cwd === 'string' && header.cwd.length > 0 ? header.cwd : ''
      const key = cwd !== '' ? normCwd(cwd) : '(no-cwd)'
      let group = groups.get(key)
      if (group === undefined) {
        group = { root: cwd !== '' ? cwd : '(无工作目录)', items: [] }
        groups.set(key, group)
      }
      if (cwd !== '' && cwd.length < group.root.length) group.root = cwd
      group.items.push(record)
    }

    const out = []
    for (const group of groups.values()) {
      const byId = new Map()
      for (const r of group.items) {
        byId.set(r.header.id, {
          sessionId: r.header.id,
          title: titles[r.header.id] !== undefined ? titles[r.header.id] : '',
          createdAt: r.header.createdAt,
          preset: typeof r.header.agentPreset === 'string' ? r.header.agentPreset : '',
          live: r.live === true,
          persisted: r.persisted === true,
          archived: archivedSet.has(r.header.id),
          subagent: r.header.origin === 'subagent',
          depth: typeof r.header.delegationDepth === 'number' ? r.header.delegationDepth : 0,
          seedLength: typeof r.header.seedLength === 'number' ? r.header.seedLength : 0,
          parent: typeof r.header.parentSession === 'string' ? r.header.parentSession : '',
          children: [],
        })
      }
      const roots = []
      let orphans = 0
      for (const node of byId.values()) {
        const parent = node.parent !== '' ? byId.get(node.parent) : undefined
        if (parent !== undefined) parent.children.push(node)
        else {
          roots.push(node)
          if (node.parent !== '') orphans += 1
        }
      }
      const sortRec = (list) => {
        list.sort((a, b) => a.createdAt - b.createdAt)
        for (const n of list) sortRec(n.children)
      }
      sortRec(roots)
      let newest = 0
      for (const r of group.items) {
        if (r.header.createdAt > newest) newest = r.header.createdAt
      }
      out.push({ root: group.root, total: group.items.length, roots, orphans, newest })
    }
    out.sort((a, b) => b.newest - a.newest)
    return { groups: out, totalSessions: records.length }
  }

  ctx.effect(() => ctx.connection.rpc.handle(RPC_CHANNEL, async (endpoint, payload, signal) => {
    try {
      switch (endpoint) {
        case 'branches/list':
          return rpcOk(await buildBranches(signal))
        default:
          return rpcError('unknown endpoint: ' + String(endpoint))
      }
    } catch (error) {
      const message = error !== undefined && error !== null && typeof error.message === 'string' ? error.message : String(error)
      return rpcError(message)
    }
  }, { authority: 'loopback' }), 'session-branches rpc')

  console.log('session-branches: active (rpc channel ' + RPC_CHANNEL + ')')
}
