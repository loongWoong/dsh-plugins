/**
 * dsh-goal-auto-resume — Host half.
 *
 * The native `goal-round-driver` (dsh-base) turns an active, armed goal into
 * sequential goal rounds, but it deliberately disarms (gives up) the goal on
 * abnormal stops: step/turn errors, aborted turns, max-tokens ceilings, and
 * driver queue failures. After a crash restart the goal also starts disarmed.
 *
 * This plugin watches the same signals and re-arms the goal through
 * `ctx.goals.resume()` once the agent is quiescent again, so the native
 * driver — which still owns all race fences and round accounting — queues the
 * next round by itself. It publishes no service and consumes only host
 * services (`agents`, `goals`, `timer`), so it needs no isolate realm.
 *
 * Safety valves:
 *  - exponential backoff across consecutive abnormal stops (1.5s → 5min);
 *  - gives up after GIVE_UP_AFTER consecutive abnormal stops with no
 *    completed turn in between (a human `resume` resets the counter);
 *  - never auto-resumes `round-limit` blockers or model-reported blockers;
 *  - never touches paused goals without an accompanying abnormal stop
 *    (deliberate user pauses are respected).
 */

export const name = 'goal-auto-resume'

export const inject = ['agents', 'goals', 'timer']

// ── Tunables ──────────────────────────────────────────────────────────────
// Delay before the first re-arm attempt after an abnormal stop.
const IMMEDIATE_DELAY_MS = 1500
// Exponential backoff base and ceiling for repeated abnormal stops.
const BACKOFF_BASE_MS = 5000
const BACKOFF_MAX_MS = 300000
// Give up auto-continuing after this many consecutive abnormal stops
// without one successfully completed turn in between.
const GIVE_UP_AFTER = 6
// Delay for the startup / agent-created sweep check.
const SWEEP_DELAY_MS = 2500
// When true, a user-initiated stop (cancel cause 'user') is also treated
// as an abnormal stop and the goal is continued. When false, user stops
// are respected: only errors / crashes / max-tokens auto-continue.
const RESUME_AFTER_USER_ABORT = true
// Driver-infrastructure block codes that are safe to auto-resume.
// 'round-limit' and model-reported blockers are never auto-resumed.
const INFRA_BLOCK_CODES = ['queue-failed', 'prompt-rejected']

export function apply(ctx) {
  const agents = ctx.agents
  const goals = ctx.goals

  // Diagnostics: prefer the real host logger; keep a small in-memory ring
  // buffer as a fallback so recent activity is always inspectable.
  const recentLogs = []
  function log(level, message) {
    let line
    try { line = String(Date.now()) + ' [' + level + '] goal-auto-resume: ' + message }
    catch (formatError) { line = 'goal-auto-resume: ' + message }
    recentLogs.push(line)
    if (recentLogs.length > 60) recentLogs.shift()
    try {
      const logger = ctx.logger
      if (logger !== undefined && logger !== null && typeof logger[level] === 'function') {
        logger[level]('goal-auto-resume: ' + message)
      }
    } catch (loggingError) {}
  }
  function renderThrown(value) {
    if (value instanceof Error) return value.message
    if (typeof value === 'object' && value !== null && typeof value.message === 'string') return value.message
    return String(value)
  }
  function brief(text) {
    return text.length > 140 ? text.slice(0, 137) + '…' : text
  }

  // ── Per-agent state ─────────────────────────────────────────────────────
  const states = new Map()
  const pendingTimers = new Set()

  function stateFor(agent) {
    const existing = states.get(agent)
    if (existing !== undefined) return existing
    const state = {
      agent,
      abnormal: false,        // abnormal stop observed since the last completed turn
      consecutive: 0,         // abnormal stops since the last completed turn
      givingUpLogged: false,
      lastAbnormalReason: '',
      lastCountedTurn: -1,    // dedupes agent/error + turn/end for one failed turn
      lastStopWasUser: false,
      pending: false,         // a check is scheduled
      selfResume: false,      // the next 'resume' change was made by this plugin
      timerCancel: undefined,
    }
    states.set(agent, state)
    return state
  }

  function resetHealth(state) {
    state.abnormal = false
    state.consecutive = 0
    state.givingUpLogged = false
    state.lastAbnormalReason = ''
    state.lastStopWasUser = false
  }

  function markAbnormal(state, reason) {
    state.consecutive += 1
    state.abnormal = true
    state.lastStopWasUser = false
    state.lastAbnormalReason = reason
  }

  function markAbnormalTurn(state, turn, reason) {
    if (turn === state.lastCountedTurn) return
    state.lastCountedTurn = turn
    markAbnormal(state, reason)
  }

  // ── Scheduling ──────────────────────────────────────────────────────────
  function backoffDelay(consecutive) {
    if (consecutive <= 1) return IMMEDIATE_DELAY_MS
    const shifted = BACKOFF_BASE_MS * Math.pow(2, Math.min(consecutive - 2, 8))
    return Math.min(shifted, BACKOFF_MAX_MS)
  }

  function scheduleCheck(state, delay) {
    if (state.pending) return
    state.pending = true
    const entry = {}
    const disposer = ctx.timeout(() => {
      pendingTimers.delete(entry)
      state.pending = false
      state.timerCancel = undefined
      try {
        runCheck(state)
      } catch (checkError) {
        log('warn', 'check failed for agent "' + state.agent.id + '": ' + renderThrown(checkError))
      }
    }, delay)
    entry.disposer = disposer
    pendingTimers.add(entry)
    state.timerCancel = () => {
      pendingTimers.delete(entry)
      try { disposer() } catch (cancelError) {}
      state.pending = false
      state.timerCancel = undefined
    }
  }

  // ── Goal access ─────────────────────────────────────────────────────────
  function liveGoal(state) {
    if (agents.get(state.agent.id) !== state.agent) return undefined
    try {
      return goals.get(state.agent)
    } catch (goalError) {
      return undefined
    }
  }

  // ── Re-arm ──────────────────────────────────────────────────────────────
  // Returns 'resumed' | 'stale' | 'skipped'.
  function attemptResume(agent, ref) {
    try {
      goals.resume(agent, { id: ref.id, revision: ref.revision })
      return 'resumed'
    } catch (error) {
      const code = error !== undefined && error !== null && typeof error.code === 'string' ? error.code : ''
      if (code === 'GOAL_STALE_REVISION') return 'stale'
      if (code === 'GOAL_INVALID_TRANSITION') return 'skipped'
      if (code === 'GOAL_AGENT_NOT_LIVE') return 'skipped'
      throw error
    }
  }

  function resumeGoal(state, goal, why) {
    const agent = state.agent
    let outcome
    try {
      state.selfResume = true
      outcome = attemptResume(agent, goal)
      if (outcome === 'stale') {
        const latest = liveGoal(state)
        if (latest === undefined || latest.id !== goal.id) {
          state.selfResume = false
          return
        }
        outcome = attemptResume(agent, latest)
      }
    } catch (error) {
      state.selfResume = false
      log('warn', 'could not re-arm goal "' + goal.id + '" for agent "' + agent.id + '": ' + renderThrown(error))
      return
    }
    if (outcome === 'resumed') {
      log('info', 're-armed goal "' + goal.id + '" for agent "' + agent.id + '" after '
        + (state.consecutive > 0 ? state.consecutive + ' consecutive ' : '')
        + 'abnormal stop (' + why + '); round ' + (goal.roundsStarted + 1) + '/' + goal.maxGoalRounds
        + ' continues via the goal-round driver')
    }
  }

  // ── The check: one scheduled re-arm evaluation ──────────────────────────
  function runCheck(state) {
    const agent = state.agent
    if (agents.get(agent.id) !== agent) return
    const goal = liveGoal(state)
    if (goal === undefined || goal === null) return

    if (state.consecutive > GIVE_UP_AFTER) {
      if (!state.givingUpLogged) {
        state.givingUpLogged = true
        log('warn', 'goal "' + goal.id + '" on agent "' + agent.id + '" hit ' + state.consecutive
          + ' abnormal stops in a row (last: ' + state.lastAbnormalReason
          + '); auto-continue paused for it — resume manually once the cause is fixed')
      }
      return
    }

    if (goal.phase === 'active') {
      if (goal.activation === 'armed') return // the native driver owns it
      if (goal.roundsStarted >= goal.maxGoalRounds) {
        // Exhausted while disarmed: record the durable round-limit blocker
        // so the goal does not sit silently stuck.
        try {
          goals.block(agent, { id: goal.id, revision: goal.revision }, {
            code: 'round-limit',
            message: 'Goal reached its configured limit of ' + goal.maxGoalRounds + ' rounds.',
          })
        } catch (blockError) {}
        return
      }
      if (state.lastStopWasUser && !state.abnormal && !RESUME_AFTER_USER_ABORT) return
      resumeGoal(state, goal, state.lastAbnormalReason !== '' ? state.lastAbnormalReason : 'goal was left disarmed')
      return
    }

    if (goal.phase === 'paused') {
      // The driver pauses a goal whose round was aborted mid-flight; a
      // deliberate user pause does not follow an abnormal stop.
      if (!state.abnormal) return
      if (goal.roundsStarted >= goal.maxGoalRounds) return
      resumeGoal(state, goal, 'round was paused after an abnormal stop (' + state.lastAbnormalReason + ')')
      return
    }

    if (goal.phase === 'blocked') {
      const code = goal.blockedReason === undefined || goal.blockedReason === null ? '' : goal.blockedReason.code
      if (code !== 'queue-failed' && code !== 'prompt-rejected') return
      if (goal.roundsStarted >= goal.maxGoalRounds) return
      resumeGoal(state, goal, 'driver failed to run the round ("' + code + '")')
      return
    }
    // phase 'complete': nothing to continue.
  }

  // ── Listeners ───────────────────────────────────────────────────────────
  ctx.on('agent/created', ({ agent }) => {
    const state = stateFor(agent)
    // Covers sessions resumed after a crash/restart: their goals start
    // disarmed and the agent may sit idle with no status transition.
    scheduleCheck(state, SWEEP_DELAY_MS)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    const state = states.get(agent)
    if (state !== undefined && state.timerCancel !== undefined) state.timerCancel()
    states.delete(agent)
  })

  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle') return
    const state = stateFor(agent)
    scheduleCheck(state, state.consecutive > 0 ? backoffDelay(state.consecutive) : IMMEDIATE_DELAY_MS)
  })

  ctx.on('agent/error', ({ agent, turn, error }) => {
    const state = stateFor(agent)
    markAbnormalTurn(state, typeof turn === 'number' ? turn : -1, 'agent error: ' + brief(renderThrown(error)))
  })

  ctx.on('session/event', (session, event) => {
    const agent = agents.get(session.id)
    if (agent === undefined || agent.session !== session) return
    const state = stateFor(agent)
    if (event.type !== 'turn/end') return
    const data = event.data
    const reason = data.reason
    const kind = reason === undefined || reason === null ? '' : reason.kind
    if (kind === 'completed') {
      // A finished turn is evidence the runtime works again.
      resetHealth(state)
      return
    }
    if (kind === 'aborted') {
      const cause = reason.reason === undefined || reason.reason === null ? '' : reason.reason.kind
      const isUser = cause === 'user'
      if (isUser && !RESUME_AFTER_USER_ABORT) {
        if (data.turn !== state.lastCountedTurn) {
          state.lastCountedTurn = data.turn
          state.consecutive += 1
          state.lastStopWasUser = true
          state.lastAbnormalReason = 'turn aborted by user'
        }
        return
      }
      markAbnormalTurn(state, data.turn, isUser ? 'turn aborted by user' : 'turn aborted (' + (cause === '' ? 'unknown cause' : cause) + ')')
      return
    }
    if (kind === 'max-tokens') {
      markAbnormalTurn(state, data.turn, 'turn hit the max-tokens ceiling')
      return
    }
    if (kind === 'error') {
      markAbnormalTurn(state, data.turn, 'turn failed')
      return
    }
    if (kind === 'interrupted') {
      markAbnormalTurn(state, data.turn, 'crash-orphaned turn closed as interrupted')
      return
    }
  })

  ctx.on('goal/changed', ({ agent, change }) => {
    const state = stateFor(agent)
    const operation = change === undefined || change === null ? '' : change.operation
    if (operation === 'pause') {
      // Rescue only when the pause follows an abnormal stop (the driver's
      // pause-after-cancel); deliberate user pauses stay respected.
      if (state.abnormal) scheduleCheck(state, backoffDelay(state.consecutive))
      return
    }
    if (operation === 'block') {
      const goal = change.goal
      const code = goal !== undefined && goal !== null && goal.blockedReason !== undefined && goal.blockedReason !== null
        ? goal.blockedReason.code
        : ''
      if (code !== '' && INFRA_BLOCK_CODES.indexOf(code) !== -1) {
        markAbnormal(state, 'goal blocked by driver failure "' + code + '"')
        scheduleCheck(state, backoffDelay(state.consecutive))
      }
      return
    }
    if (operation === 'resume') {
      if (state.selfResume) {
        state.selfResume = false
        return
      }
      // A human re-armed the goal: fresh trust.
      resetHealth(state)
      return
    }
    if (operation === 'create' || operation === 'complete' || operation === 'clear') {
      resetHealth(state)
      return
    }
  })

  // ── Startup sweep ───────────────────────────────────────────────────────
  for (const agent of agents.list()) {
    const state = stateFor(agent)
    scheduleCheck(state, SWEEP_DELAY_MS)
  }

  // Pending check timers are ctx.timeout disposables owned by the plugin
  // Fiber: unmounting this plugin disposes them automatically.
}
