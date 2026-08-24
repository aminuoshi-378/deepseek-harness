/**
 * dsh-self-improving — Plugin Entry Point for real dsh runtime.
 *
 * Mounts the four-layer learning system onto dsh's actual event hooks:
 *
 *   Layer 1: Outcome Evaluator     → tools/result (observe tool outcomes)
 *   Layer 2: Behavior Adapter       → agent/pre-step (inject experience)
 *                                     systemPrompt.section (learned prefs)
 *   Layer 3: Experience Store      → SQLite sidecar table
 *   Layer 4: Meta-Cognition Engine  → agent/turn-stopping (queue reflection)
 *                                     agent.runMaintenance (process queue)
 *
 * All injection is advisory — the model can heed or ignore it.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { MessageSource, UserMessage } from '@deepseek-ai/dsh-llm'
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { ulid } from 'ulid'

export const name = 'self-improving'

// Cordis inject: wait for these services to be ready before applying.
// - 'tools' for the tools/result event
// - 'systemPrompt' for the section() registration
// - 'agents' for the agent/pre-step and agent/turn-stopping events
export const inject = ['tools', 'systemPrompt']

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface Config {
  dbPath: string
  metaCognitionEnabled: boolean
  behaviorAdapterEnabled: boolean
  minInjectionScore: number
}

export const Config: z<Config> = z.object({
  dbPath: z.string().default(':memory:'),
  metaCognitionEnabled: z.boolean().default(true),
  behaviorAdapterEnabled: z.boolean().default(true),
  minInjectionScore: z.number().default(0.3),
})

// ---------------------------------------------------------------------------
// Experience Store (Layer 3) — inlined for single-file plugin
// ---------------------------------------------------------------------------

interface ExperienceRecord {
  id: string
  sessionId: string
  turnId: string
  createdAt: number
  contextHash: string
  taskPattern: string | null
  toolsUsed: string[] | null
  workspaceDigest: string | null
  actions: string
  outcomeScore: number
  userFeedback: string
  lesson: string | null
  confidence: number
  reuseCount: number
}

class ExperienceStore {
  private db: DatabaseType

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initSchema()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS experiences (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        context_hash TEXT NOT NULL,
        task_pattern TEXT,
        tools_used TEXT,
        workspace_digest TEXT,
        actions TEXT NOT NULL,
        outcome_score REAL,
        user_feedback TEXT,
        lesson TEXT,
        confidence REAL DEFAULT 1.0,
        reuse_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_exp_context ON experiences(context_hash);
      CREATE INDEX IF NOT EXISTS idx_exp_task ON experiences(task_pattern);
      CREATE INDEX IF NOT EXISTS idx_exp_score ON experiences(outcome_score DESC);
    `)
  }

  store(
    sessionId: string,
    turnId: string,
    outcomeScore: number,
    userFeedback: string,
    toolsUsed: string[],
    actions: string,
    workspaceDigest: string | null,
  ): string {
    const id = ulid()
    const contextHash = [toolsUsed.slice().sort().join(','), workspaceDigest ?? ''].join('|')

    this.db.prepare(`
      INSERT INTO experiences (id, session_id, turn_id, created_at, context_hash,
        task_pattern, tools_used, workspace_digest, actions, outcome_score,
        user_feedback, lesson, confidence, reuse_count)
      VALUES (@id, @sessionId, @turnId, @createdAt, @contextHash,
        NULL, @toolsUsed, @ws, @actions, @score, @feedback, NULL, 1.0, 0)
    `).run({
      id, sessionId, turnId, createdAt: Date.now(),
      contextHash, toolsUsed: JSON.stringify(toolsUsed),
      ws: workspaceDigest, actions, score: outcomeScore, feedback: userFeedback,
    })

    // Enforce retention limit of 1000
    const count = this.count()
    if (count > 1000) {
      this.db.prepare(`
        DELETE FROM experiences WHERE id IN (
          SELECT id FROM experiences ORDER BY outcome_score ASC, created_at ASC LIMIT ?
        )
      `).run(count - 1000)
    }

    return id
  }

  query(toolsUsed: string[], workspaceDigest: string | null, limit: number = 5, minScore: number = 0.0): ExperienceRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM experiences WHERE outcome_score >= ? ORDER BY outcome_score DESC, created_at DESC LIMIT ?
    `).all(minScore, limit * 3) as any[]

    const records = rows.map(r => this.rowToRecord(r))
    if (toolsUsed.length === 0 && !workspaceDigest) return records.slice(0, limit)

    // Re-rank by tool overlap similarity
    return records
      .map(rec => ({ rec, sim: this.similarity(rec, toolsUsed, workspaceDigest) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, limit)
      .map(item => item.rec)
  }

  updateLesson(id: string, lesson: string): void {
    this.db.prepare('UPDATE experiences SET lesson = ? WHERE id = ?').run(lesson, id)
  }

  incrementReuse(id: string): void {
    this.db.prepare(`
      UPDATE experiences SET reuse_count = reuse_count + 1,
        confidence = MAX(0.1, 1.0 - (reuse_count + 1) * 0.1) WHERE id = ?
    `).run(id)
  }

  boostConfidence(id: string): void {
    this.db.prepare('UPDATE experiences SET confidence = MIN(1.0, confidence + 0.2) WHERE id = ?').run(id)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM experiences').get() as any).c
  }

  stats(): { total: number; avgScore: number; positive: number; withLessons: number } {
    const r = this.db.prepare(`
      SELECT COUNT(*) as total, COALESCE(AVG(outcome_score), 0) as avgScore,
        SUM(CASE WHEN user_feedback = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN lesson IS NOT NULL THEN 1 ELSE 0 END) as withLessons
      FROM experiences
    `).get() as any
    return { total: r.total, avgScore: r.avgScore, positive: r.positive ?? 0, withLessons: r.withLessons ?? 0 }
  }

  private similarity(rec: ExperienceRecord, tools: string[], ws: string | null): number {
    let score = 0, weight = 0
    if (rec.toolsUsed && tools.length > 0) {
      weight += 0.6
      const qs = new Set(tools), rs = new Set(rec.toolsUsed)
      const inter = [...qs].filter(t => rs.has(t)).length
      const union = new Set([...qs, ...rs]).size
      score += 0.6 * (union > 0 ? inter / union : 0)
    }
    if (ws && rec.workspaceDigest && rec.workspaceDigest === ws) { weight += 0.4; score += 0.4 }
    return weight > 0 ? score / weight : 0.5
  }

  private rowToRecord(r: any): ExperienceRecord {
    return {
      id: r.id, sessionId: r.session_id, turnId: r.turn_id, createdAt: r.created_at,
      contextHash: r.context_hash, taskPattern: r.task_pattern,
      toolsUsed: r.tools_used ? JSON.parse(r.tools_used) : null,
      workspaceDigest: r.workspace_digest, actions: r.actions,
      outcomeScore: r.outcome_score, userFeedback: r.user_feedback,
      lesson: r.lesson, confidence: r.confidence, reuseCount: r.reuse_count,
    }
  }

  close(): void { this.db.close() }
  clear(): void { this.db.exec('DELETE FROM experiences') }
}

// ---------------------------------------------------------------------------
// Plugin apply — wires everything to dsh's real event hooks
// ---------------------------------------------------------------------------

const PLUGIN_SOURCE: MessageSource = { kind: 'plugin', plugin: 'self-improving' }

export function apply(ctx: Context, config: Config): void {
  const store = new ExperienceStore(config.dbPath)

  // Per-agent turn tracking: collect tool results during a turn
  const turnTools = new Map<string, { tools: { name: string; success: boolean }[]; sessionId: string }>()

  // --- Layer 1: Observe tool outcomes via tools/result ---
  ctx.on('tools/result', (exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>) => {
    const agent = exec.agent
    if (!agent) return

    // Use the agent's current turn number from session
    const turn = agent.session.turn ?? 0
    const turnKey = `${agent.id}:${turn}`
    if (!turnTools.has(turnKey)) {
      turnTools.set(turnKey, { tools: [], sessionId: agent.id })
    }
    const entry = turnTools.get(turnKey)!

    entry.tools.push({
      name: exec.name,
      success: !result.isError,
    })
  })

  // --- Layer 1 + 4: On turn-stopping, score the turn and store it ---
  ctx.on('agent/turn-stopping', async (payload: { agent: Agent; turn: number; signal: AbortSignal }) => {
    const { agent, turn } = payload
    const turnKey = `${agent.id}:${turn}`
    const entry = turnTools.get(turnKey)

    if (!entry || entry.tools.length === 0) return

    // Score the turn
    const toolCallCount = entry.tools.length
    const successCount = entry.tools.filter(t => t.success).length
    const toolSuccessRate = toolCallCount > 0 ? successCount / toolCallCount : 0
    const guardCount = 0 // guards observed via separate mechanism

    // Goal progress: assume advanced if tools succeeded, stalled if many failures
    const goalProgress: 'advanced' | 'stalled' | 'regressed' | 'none' =
      toolSuccessRate >= 0.5 ? 'advanced' : 'stalled'

    // Determine user feedback (simplified: no direct feedback API in this context)
    const userFeedback = 'none'

    // Compute outcome score using the same weights as our evaluator
    const goalScore = goalProgress === 'advanced' ? 1.0 : goalProgress === 'stalled' ? 0.3 : 0.5
    const guardPenalty = Math.min(guardCount * 0.1, 0.15)
    const feedbackScore = 0.5
    const outcomeScore = Math.max(0, Math.min(1,
      goalScore * 0.4 + toolSuccessRate * 0.25 + (0.15 - guardPenalty) + feedbackScore * 0.2,
    ))

    // Store the experience
    const toolsUsed = entry.tools.map(t => t.name)
    const actions = JSON.stringify({ tools: entry.tools, goalProgress, feedback: userFeedback })
    const wsDigest = agent.options.cwd ? String(agent.options.cwd).slice(-32) : null

    const expId = store.store(
      agent.id, `turn-${turn}`, outcomeScore, userFeedback,
      toolsUsed, actions, wsDigest,
    )

    // Queue reflection if enabled
    if (config.metaCognitionEnabled) {
      pendingReflections.push({
        expId,
        actions,
        outcomeScore,
        userFeedback,
        toolsUsed,
      })
    }

    // Clean up turn tracking
    turnTools.delete(turnKey)
  })

  // --- Layer 2: Inject experience at agent/pre-step ---
  if (config.behaviorAdapterEnabled) {
    ctx.on('agent/pre-step', async (
      payload: { agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal },
      next: () => Promise<any>,
    ) => {
      const { agent } = payload

      try {
        // Query experience store for similar past turns
        const wsDigest = agent.options.cwd ? String(agent.options.cwd).slice(-32) : null
        const records = store.query([], wsDigest, 5, config.minInjectionScore)

        // Always call next() first (waterfall contract: never short-circuit)
        const decision = await next()

        if (records.length > 0) {
          const sorted = [...records].sort((a, b) => b.outcomeScore - a.outcomeScore)
          const best = sorted[0]
          const worst = sorted[sorted.length - 1]

          const lines: string[] = ['## Past Experience (advisory)', '']
          if (best.outcomeScore >= 0.6) {
            const lesson = best.lesson ?? `Using ${best.toolsUsed?.join(', ')} led to a good outcome (score: ${best.outcomeScore.toFixed(2)})`
            lines.push(`- **What worked**: ${lesson}`)
          }
          if (worst.outcomeScore <= 0.4) {
            const lesson = worst.lesson ?? `Using ${worst.toolsUsed?.join(', ')} led to a poor outcome (score: ${worst.outcomeScore.toFixed(2)})`
            lines.push(`- **What failed**: ${lesson}`)
          }
          lines.push('')
          lines.push('These are historical observations, not instructions. Use your judgment.')

          const text = lines.join('\n')
          const context = createUserMessage({
            content: [{ type: 'text', text }],
            source: { ...PLUGIN_SOURCE, form: 'notice', summary: 'past experience' },
          })

          // Increment reuse counts
          for (const rec of records) {
            store.incrementReuse(rec.id)
          }

          // Inject advisory context: prepend our message to the decision's messages
          if (decision.kind === 'enter') {
            return { ...decision, messages: [context, ...decision.messages] }
          }
        }

        return decision
      } catch (err) {
        // Never break the agent loop — delegate to next() on any error
        ctx.logger?.warn?.('self-improving: pre-step injection error', err)
        return next()
      }
    })
  }

  // --- Layer 2: Register system prompt section for learned preferences ---
  if (config.behaviorAdapterEnabled) {
    ctx.systemPrompt.section({
      name: 'self-improving-learned-preferences',
      order: 450,
      text: () => {
        const stats = store.stats()
        if (stats.total < 10) return ''
        const lines: string[] = ['## Learned Preferences (advisory)', '']
        if (stats.avgScore > 0.7) {
          lines.push(`- Recent outcomes are strong (avg score ${stats.avgScore.toFixed(2)} over ${stats.total} turns) — current approach is effective`)
        }
        if (stats.avgScore < 0.4) {
          lines.push(`- Recent outcomes have low scores (avg ${stats.avgScore.toFixed(2)}) — consider more careful tool selection`)
        }
        if (stats.positive > stats.total * 0.5) {
          lines.push(`- User has given positive feedback on ${stats.positive} of ${stats.total} turns`)
        }
        return lines.length > 2 ? lines.join('\n') : ''
      },
    })
  }

  // --- Layer 4: Meta-cognition reflection queue ---
  interface PendingReflection {
    expId: string
    actions: string
    outcomeScore: number
    userFeedback: string
    toolsUsed: string[]
  }
  const pendingReflections: PendingReflection[] = []

  // Process reflections during maintenance (rule-based, no LLM)
  ctx.on('agent/run-maintenance', async () => {
    while (pendingReflections.length > 0) {
      const entry = pendingReflections.shift()!

      // Rule-based reflection (fallback when no LLM available)
      let lesson: string
      if (entry.outcomeScore >= 0.7) {
        lesson = `Tool sequence [${entry.toolsUsed.join(' → ')}] achieved a good outcome (score: ${entry.outcomeScore.toFixed(2)})`
      } else if (entry.outcomeScore <= 0.3) {
        lesson = `Tool sequence [${entry.toolsUsed.join(' → ')}] led to a poor outcome (score: ${entry.outcomeScore.toFixed(2)}) — try a different approach`
      } else {
        lesson = `Mixed outcome (score: ${entry.outcomeScore.toFixed(2)}) with tools [${entry.toolsUsed.join(', ')}]`
      }

      store.updateLesson(entry.expId, lesson)

      // Boost confidence on similar past experiences if this was positive
      if (entry.outcomeScore >= 0.7) {
        const similar = store.query(entry.toolsUsed, null, 5, 0.6)
        for (const rec of similar) {
          if (rec.id !== entry.expId) {
            store.boostConfidence(rec.id)
          }
        }
      }
    }

    // Distill preferences
    if (config.behaviorAdapterEnabled) {
      const stats = store.stats()
      if (stats.total >= 10) {
        // Preferences are injected via the system prompt section above
        // (the section's text provider reads stats dynamically)
      }
    }
  })

  // --- Cleanup ---
  ctx.effect(() => () => {
    store.close()
  })
}
