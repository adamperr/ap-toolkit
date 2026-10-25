// A switch pressed while Claude works waits here until the command runs.
export type ToolkitPending = { model?: string; effort?: string }

// One item of Claude's to-do list as the checklist draws it; `startedAt` while it's in progress, `doneAt` once done.
export type ToolkitTodo = {
  id?: string
  content: string
  activeForm: string
  status: 'pending' | 'in_progress' | 'completed'
  startedAt?: number
  doneAt?: number
}

// The turn Claude is working on: when it started, what it's doing now and since when, the tools it has used,
// and how long it has waited on the person's answers. The work view adds the session's tokens and cost when it
// started, the main loop's new tokens not yet counted into the report, the tokens Claude and helpers wrote this turn
// (`outTokens`), and the shells it ran and how many failed.
export type ToolkitRun = {
  startedAt: number
  doing: string
  doingSince: number
  tools: string[]
  waitMs?: number
  tokensAtStart?: number
  costAtStart?: number | null
  mainTokens?: number
  outTokens?: number
  shells?: number
  failed?: number
}

// One shell command in the work view: the command, the reason Claude gave, when it ran, and how it ended. A failed
// one keeps its exit code when the error names one.
export type ToolkitShell = {
  id: string
  command: string
  why: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'failed' | 'background'
  exitCode?: number
}

// The session's cost as Claude Code counts it, at the last time the report counted it, and when that count began
// (`$.session.usage().startedAt`; /clear starts it over).
export type ToolkitCostSeen = { usd: number; since: number }

// One Eastern day of Today's report, kept in $.store as `day:YYYY-MM-DD:<session>` live and `day:YYYY-MM-DD:past`
// backfilled. Tokens in are new ones; `tokensCached` is what Claude re-read from cache. Tokens and cost include
// helper agents (backfilled from version 4 on). `ms` leaves out the time Claude waited on the person's answers, kept
// in `waitMs`. A backfilled day's cost is estimated from tokens and model prices when `isCostEstimated`; days
// backfilled before version 3 have no cost.
export type ReportDay = {
  sessions: string[]
  requests: number
  ms: number
  types: Record<string, { requests: number; ms: number }>
  tokensIn: number
  tokensCached: number
  tokensOut: number
  costUsd: number
  ownCalls: number
  ownTokens: number
  waitMs?: number
  isBackfilled?: boolean
  isCostEstimated?: boolean
}

export type ReportTab = 'today' | 'week' | 'month' | 'year' | 'all'

// The estimate check's record of one session, kept in $.store as `costCheck:<session>`: Claude Code's own cost for
// it, counted from `since` (`$.session.usage().startedAt`) to `at`. `estimateUsd` is the toolkit's estimate for the
// same span from the session files, once a later session has checked it; null where a model has no price.
export type SessionCostCheck = { claudeUsd: number; since: number; at: number; estimateUsd?: number | null }

// The report's estimate check line: the past sessions checked, and both totals.
export type ToolkitCheck = { sessions: number; claudeUsd: number; estimateUsd: number }

// One rate-limit window as the strip's Limits line reads it: `five_hour` or `seven_day`, how much is used, and when it
// resets (ISO 8601).
export type ToolkitLimit = { kind: string; percentUsed: number; resetsAt?: string }

// The strip's figures from `$.session.usage()`: Claude Code's own cost for the session (/cost, at API prices), the
// context window's fill, and the rate-limit windows. A figure the engine hasn't reported yet is null.
export type ToolkitUsage = {
  costUsd: number | null
  contextTokens: number | null
  contextPercent: number | null
  contextWindow: number
  limits: ToolkitLimit[]
}

// The wrap-up nudge on show: which limit is near, and how full it is.
export type ToolkitNudge = { reason: 'context' | 'fiveHour'; percent: number }

// What the report pane draws: one period's totals, worked out when the tab is picked.
export type ToolkitReport = {
  tab: ReportTab
  title: string
  sessions: number
  requests: number
  ms: number
  types: { key: string; label: string; requests: number; ms: number }[]
  tokensIn: number
  tokensCached: number
  tokensOut: number
  costUsd: number
  ownCalls: number
  ownTokens: number
  fiveHour: number | null
  week: number | null
  waitMs: number
  hasBackfill: boolean
  hasCost: boolean
  liveSince: number | null
  check: ToolkitCheck | null
}

// How the last turn ended, for "All done · took X · N of N steps" and the work view's Done line: its start and end,
// the shells and helpers it ran, and its tokens, how many of them were written, and cost (null when Claude Code
// reported none).
export type ToolkitDone = {
  tookMs: number
  completed: number
  total: number
  isAborted: boolean
  startedAt?: number
  endedAt?: number
  shells?: number
  failed?: number
  helpers?: number
  tokens?: number
  tokensOut?: number
  costUsd?: number | null
}

// Which model helper agents run on: picked per task, Haiku, or Claude's own.
export type ToolkitHelperMode = 'lowest' | 'fast' | 'same'

// The project this session is in: its folder's name, the folder, and its color's key. Colors are kept in $.store as
// `projectColors`, keyed by the folder in lowercase. Outside a project folder, it's the folder Claude Code started in,
// and `isOutside` is true.
export type ToolkitProject = { name: string; dir: string; color: string; isOutside?: boolean }

// One helper agent in the work view: its task and model, what it's doing now, its new tokens (in and out, without
// cache re-reads), and their cost estimated from model prices. `parentId` names the helper that started it; absent
// when Claude did.
export type ToolkitAgent = {
  id: string
  parentId?: string
  task: string
  model: string | null
  startedAt: number
  endedAt?: number
  status: 'working' | 'done' | 'stopped' | 'failed'
  doing: string
  tokens: number
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'ap-toolkit': {
      controlsOpen: boolean
      usage: ToolkitUsage | null
      sessionTokens: number
      model: string | null
      effort: string | null
      pending: ToolkitPending | null
      noEffort: string[]
      hasEffortCommand: boolean
      fiveHour: number | null
      context: number | null
      helpers: number
      cleanView: boolean
      peek: boolean
      todos: ToolkitTodo[]
      run: ToolkitRun | null
      costSeen: ToolkitCostSeen | null
      done: ToolkitDone | null
      now: number
      helperMode: ToolkitHelperMode
      report: ToolkitReport | null
      nudge: ToolkitNudge | null
      nudgeDismissed: string[]
      folderWarning: string | null
      clearArmed: boolean
      version: string | null
      agents: ToolkitAgent[]
      shells: ToolkitShell[]
      stopArmed: string | null
      project: ToolkitProject | null
    }
  }
}
