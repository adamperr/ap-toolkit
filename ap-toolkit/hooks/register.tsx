import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, Timer } from 'claude-code'

import type {
  ReportDay,
  ReportTab,
  SessionCostCheck,
  ToolkitAgent,
  ToolkitCheck,
  ToolkitDone,
  ToolkitHelperMode,
  ToolkitLimit,
  ToolkitNudge,
  ToolkitPending,
  ToolkitProject,
  ToolkitReport,
  ToolkitRun,
  ToolkitShell,
  ToolkitTodo,
} from '../types'

const controlsOpenA = atom({ plugin: 'ap-toolkit', key: 'controlsOpen' } as const, false)
const usageA = atom({ plugin: 'ap-toolkit', key: 'usage' } as const, null)
const sessionTokensA = atom({ plugin: 'ap-toolkit', key: 'sessionTokens' } as const, 0)
const modelA = atom({ plugin: 'ap-toolkit', key: 'model' } as const, null)
const effortA = atom({ plugin: 'ap-toolkit', key: 'effort' } as const, null)
const pendingA = atom({ plugin: 'ap-toolkit', key: 'pending' } as const, null)
const noEffortA = atom({ plugin: 'ap-toolkit', key: 'noEffort' } as const, [])
const hasEffortA = atom({ plugin: 'ap-toolkit', key: 'hasEffortCommand' } as const, true)
const fiveHourA = atom({ plugin: 'ap-toolkit', key: 'fiveHour' } as const, null)
const contextA = atom({ plugin: 'ap-toolkit', key: 'context' } as const, null)
const helpersA = atom({ plugin: 'ap-toolkit', key: 'helpers' } as const, 0)

const cleanViewA = atom({ plugin: 'ap-toolkit', key: 'cleanView' } as const, true)
const peekA = atom({ plugin: 'ap-toolkit', key: 'peek' } as const, false)
const todosA = atom({ plugin: 'ap-toolkit', key: 'todos' } as const, [])
const runA = atom({ plugin: 'ap-toolkit', key: 'run' } as const, null)
const costSeenA = atom({ plugin: 'ap-toolkit', key: 'costSeen' } as const, null)
const doneA = atom({ plugin: 'ap-toolkit', key: 'done' } as const, null)
const nowA = atom({ plugin: 'ap-toolkit', key: 'now' } as const, 0)
const helperModeA = atom({ plugin: 'ap-toolkit', key: 'helperMode' } as const, 'lowest')
const reportA = atom({ plugin: 'ap-toolkit', key: 'report' } as const, null)
const nudgeA = atom({ plugin: 'ap-toolkit', key: 'nudge' } as const, null)
const nudgeDismissedA = atom({ plugin: 'ap-toolkit', key: 'nudgeDismissed' } as const, [])
const folderWarningA = atom({ plugin: 'ap-toolkit', key: 'folderWarning' } as const, null)
const clearArmedA = atom({ plugin: 'ap-toolkit', key: 'clearArmed' } as const, false)
const versionA = atom({ plugin: 'ap-toolkit', key: 'version' } as const, null)
const agentsA = atom({ plugin: 'ap-toolkit', key: 'agents' } as const, [])
const shellsA = atom({ plugin: 'ap-toolkit', key: 'shells' } as const, [])
const stopArmedA = atom({ plugin: 'ap-toolkit', key: 'stopArmed' } as const, null)
const projectA = atom({ plugin: 'ap-toolkit', key: 'project' } as const, null)

// The wrap-up nudge shows once context or the 5-hour limit reaches these, and again after it drops back and returns.
const NUDGE_CONTEXT = 75
const NUDGE_FIVE_HOUR = 85

// "Needs you" alerts: a request at least this long gets an alert when it finishes.
const LONG_RUN_MS = 2 * 60_000
const ALERT_TITLE = 'Claude needs you'
// The engine's notifications Claude is waiting on an answer for.
const ASKING_NOTICES = ['permission_prompt', 'elicitation_dialog']
// How the toolkit runs its scripts in scripts\: Windows PowerShell, no profile, this run only.
const POWERSHELL = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File']

// Clear, and Stop on a helper's card, count a second press within this long of the first.
const CLEAR_ARM_MS = 5_000

const REPORT_PANE = 'report'
// What an hour of Claude's work is worth in Today's report, unless the person set their own rate.
const DEFAULT_RATE = 120
// Raised when the backfill counts differently, so it runs once more and redoes its past-day records.
const BACKFILL_VERSION = 4
// Tools that wait on the person's answer; that wait is left out of Claude's work time.
const WAITING_TOOLS = ['AskUserQuestion', 'ExitPlanMode']
// API prices in $ per million tokens (claude-api skill, cached 2026-10-06): input, output, 5-minute cache writes,
// 1-hour cache writes, cache reads. They estimate the cost of work from past session files, which carry none.
const PRICES: Record<string, readonly [number, number, number, number, number]> = {
  'claude-fable-5-1': [10, 50, 12.5, 20, 0.25],
  'claude-opus-5-5': [4, 20, 5, 8, 0.2],
  'claude-sonnet-5-5': [2, 10, 2.5, 4, 0.2],
  'claude-sonnet-5': [2, 10, 2.5, 4, 0.2],
  // Haiku 5.5 at its price for prompts of 100K tokens or fewer; its cache prices aren't listed, so they follow Sonnet's
  // ratios to its input price.
  'claude-haiku-5-5': [0.1, 0.5, 0.125, 0.2, 0.01],
}
// The estimate check keeps this many past sessions.
const CHECKS_KEPT = 20

export const REPORT_TABS: readonly { key: ReportTab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All time' },
]

export const WORK_TYPES = [
  { key: 'build', label: 'Building' },
  { key: 'run', label: 'Running commands' },
  { key: 'browser', label: 'Using the browser' },
  { key: 'research', label: 'Reading & research' },
  { key: 'helpers', label: 'Working with helpers' },
  { key: 'talk', label: 'Planning & talk' },
]

// The Launch list, two to a row in this order, each with its icon and the icon's color.
export const LAUNCHES = [
  { key: 'start', label: 'Start session', short: 'Start', icon: '▶', color: 'claude' },
  { key: 'tab', label: 'New tab', short: 'New tab', icon: '+', color: 'success' },
  { key: 'report', label: "Today's report", short: 'Report', icon: '▤', color: 'warning' },
  { key: 'folder', label: 'Open project folder', short: 'Folder', icon: '▣', color: 'ide' },
]
// The slot after the Launch list holds these two side by side, for a long conversation.
export const FRESH = [
  { key: 'clear', label: 'Clear', icon: '○', color: 'suggestion' },
  { key: 'compact', label: 'Compact', icon: '≡', color: 'suggestion' },
]
// Below this column width the Launch list uses short names.
const NARROW_LAUNCH = 22

export const START_PROMPT =
  'Start the session: read the project map ("Resume here" and "Waiting on you") and tell me where things stand ' +
  'and the next step.'

const HELP_PANE = 'help'
const HELP = `**AP Toolkit** puts the things you'd otherwise type on buttons.

| Row or button | What it does |
| --- | --- |
| **◆ Project name** | The strip's first line, above the prompt. It starts with this project's folder name, bold and in the project's color, or **Session** outside a project folder. Tokens are what Claude read new and wrote this session, helpers included; cache re-reads are left out, and Today's report still shows them. **At API prices** is Claude Code's own \`/cost\` figure: what the session would cost on the API, which your plan doesn't bill. **Context** is how full the conversation is. ◆ beats while Claude works. |
| **Limits** | The strip's second line: how much of the 5-hour and weekly windows is left, and when each resets. When your pace would use up the 5-hour window before it resets, it says when, in amber. |
| **Bars** | A bar fills as you use it, and its color says how full it is: green under 50%, amber from 50% to 79%, and red from 80%. That's the only color code. |
| **Steps** | Shows above the strip while Claude works. The bar has one segment per step on Claude's to-do list: green when done, orange with a moving shine for the step it's on, and gray for what's left. With no to-do list, it reads **Working**. The step's clock turns amber after 3 minutes. On the right are this turn's tokens so far, as **in** (read new) and **out** (written), then its cost, helpers included. The checklist sits under it. |
| **Time** | When you sent the message, how long Claude has worked, and when it should finish: the average finished step times the steps left. The estimate shows once a step finishes; without a to-do list, there's none. |
| **Now** | What Claude is doing right now. It turns amber after 3 minutes on one thing. |
| **Shells** | Each command Claude runs: ◐ running, ✓ worked, or ✗ failed with its exit code, then the command, the reason Claude gave, and its time. The newest 3 show, plus any that failed, until your next message. One that runs over 2 minutes turns amber. |
| **Helpers** | One line per helper agent: its model, task, what it's doing now, tokens, cost at API prices (estimated from its tokens and model prices), and time. A helper's own helpers sit under it with ↳. **■** stops a working helper; press it twice within 5 seconds. A finished helper keeps its line until your next message. |
| **Done** | After Claude finishes: when the turn started and ended, how long it took, how many shells and helpers ran, and the turn's tokens and cost. It stays until your next message, along with any helper still working. |
| **Motion** | While Claude works, a new or changed part lights up briefly, numbers count up, bars fill smoothly, and ◆ beats. |
| **Model** | Switches Claude's model. A pick made while Claude works applies when it finishes. |
| **Effort** | How hard Claude thinks. Grayed out on models that don't use it. |
| **Color** | This project's color, marked ✓, on its name in the strip and on tabs **New tab** opens. Each project gets one on its own, the one fewest projects have; press a swatch to change it. Other tabs open in this project change when they restart. Shows only in a project folder. |
| **Helper agents** | Which model helper agents run on. Each press of its pill moves to the next: **Lowest that fits** lets Claude pick per task, **Fast & Cheap** uses Haiku, and **Same as me** uses Claude's own model. |
| **Clean View** | Hides tool output (reads, edits, and commands), so Claude's words stand out. Questions and plans for your OK stay. The work view above the strip shows either way. |
| **On / Off pills** | Press the pill at the right of a setting to switch it. The dot beside the setting turns green while it's on. |
| **Start session** | Asks Claude to read the project map and tell you where things stand. |
| **New tab** | Opens a Windows Terminal tab in this folder, in the project's color, and starts a fresh Claude session there, with an empty box. Tabs you open yourself stay plain. |
| **Open project folder** | Opens this session's folder in File Explorer. |
| **Today's report** | Claude's time, type of work, and usage by day, week, month, year, or all time. Also \`/report\`. A request that changed files counts as Building. Time Claude waits on your answers isn't counted as work. Work from before the toolkit started counting comes from past session files; its cost is estimated from tokens and model prices. Tokens and cost include helper agents. The estimate check line compares that estimate with Claude Code's own cost for past sessions. |
| **Clear** | Starts a fresh conversation in this tab, with the same folder and model. Press it twice: the first press asks **Sure?** |
| **Compact** | Claude summarizes the conversation so far and carries on from the summary, which frees up context. It reads the whole conversation once. A toast says when it's done. |
| **▴ ▾** | **▴** at the right of the strip opens the controls box (model, effort, settings, and Launch), and **▾** closes it. It remembers which. |
| **Status row** | The end of the gray hint line under the prompt: model, effort, and helpers working. |
| **"Needs you" alerts** | A Windows notification when Claude asks a question, wants a plan OK or a permission, or finishes a request that took 2 minutes or more. The title names the project, such as **ClaudeMods needs you**, or reads **Claude needs you** outside a project folder. Turn them off in \`/config\`. |
| **⚠ Folder check** | Warns when a session starts outside a project folder (one with its own CLAUDE.md). **Got it** hides it for this session. |
| **⚠ Wrap-up nudge** | Shows when context reaches 75% or the 5-hour limit reaches 85%, with **Compact** and **Clear**. **Not now** hides it until the reading drops and climbs back. |
| **Version** | The dim number in the controls box's bottom-right corner, such as v0.1.20: the second number is the major release, and the third is the batch in the project plan. A tab that shows an older number hasn't loaded the latest changes; restart it. |

To change the report's hourly rate, open \`/config\`. Press **Esc** to close this help.`

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const HELPER_MODES: readonly { key: ToolkitHelperMode; label: string; short: string }[] = [
  { key: 'lowest', label: 'Lowest that fits', short: 'Lowest' },
  { key: 'fast', label: 'Fast & Cheap', short: 'Cheap' },
  { key: 'same', label: 'Same as me', short: 'Same' },
]

const LOWEST_THAT_FITS =
  'When you start a helper agent, set its model to the lowest one that fits the task: haiku for mechanical work ' +
  '(searching, listing, simple edits), sonnet for in-between reasoning, and opus only when the task truly needs it.'

// Agent states that count as a helper still working, and how the work view names the ones that ended.
const ACTIVE = ['pending', 'running', 'waiting']
const ENDED: Partial<Record<string, ToolkitAgent['status']>> = { completed: 'done', failed: 'failed', killed: 'stopped' }

// The work view: after this long on one step or action, its clock turns amber; a shell turns amber sooner.
const SLOW_STEP_MS = 3 * 60_000
const SLOW_SHELL_MS = 2 * 60_000
const SPIN = ['◐', '◓', '◑', '◒']
// Helpers' spinner, which each helper turns out of step.
const DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
// A checklist longer than this folds its finished items into one line.
const MAX_ITEMS = 6
// Tool rows Clean View keeps, because they hold something to read or answer.
const KEEP_ROWS = ['AskUserQuestion', 'ExitPlanMode']
// Lively motion: the clock moves this often while Claude or a helper works, a new or changed part keeps its highlight
// this long, and a number counts up to a new value over this long.
const FRAME_MS = 200
const FLASH_MS = 700
const TWEEN_MS = 600
// The shine that sweeps the current step: it takes this many frames more than the step's cells to come round, and
// lightens the cell it's on and, less, the cells beside it.
const SHINE_REST = 5
const SHINE_PEAK = '#FFE3D7'
const SHINE_NEAR = '#F0A283'
// The Steps bar: at most this many cells across, and at most 3 cells a step, with a one-cell gap between steps.
const STEPS_BAR = 20
// Shells: the newest this many show, plus up to this many older ones that failed; a command keeps this many
// characters. The command and the helper's task share a column this wide, so the reasons line up.
const SHELLS_SHOWN = 3
const FAILED_KEPT = 3
const COMMAND_KEPT = 200
const WORK_COLUMN = 32
// The rows the controls box takes when open: its border, title, divider, Model, Effort, two settings under their rule,
// three Launch rows under theirs, and the version row. In a project folder, the Color row adds one.
const CONTROLS_ROWS = 14
// How a finished helper's line is marked: done, stopped, or failed.
const endMark = (a: ToolkitAgent) =>
  a.status === 'done' ? { mark: '✓', color: 'success' } : a.status === 'stopped' ? { mark: '■', color: 'warning' } : { mark: '✗', color: 'error' }

export const MODELS = [
  { key: 'haiku', label: 'Haiku 5.5', short: 'Haiku', id: 'claude-haiku-5-5' },
  { key: 'sonnet', label: 'Sonnet 5.5', short: 'Sonnet', id: 'claude-sonnet-5-5' },
  { key: 'opus', label: 'Opus 5.5', short: 'Opus', id: 'claude-opus-5-5' },
  { key: 'fable', label: 'Fable 5.1', short: 'Fable', id: 'claude-fable-5-1' },
]

export const EFFORTS = [
  { key: 'low', label: 'Low', short: 'Low' },
  { key: 'medium', label: 'Medium', short: 'Med' },
  { key: 'high', label: 'High', short: 'High' },
  { key: 'xhigh', label: 'xhigh', short: 'XHigh', chip: 'XHigh' },
  { key: 'max', label: 'Max', short: 'Max' },
]

// A project's color, on its name in the strip and on tabs New tab opens. They skip green, amber, and red, which say
// how full a bar is, and orange, which is Claude's.
export const PROJECT_COLORS = [
  { key: 'teal', label: 'Teal', hex: '#2EC4B6' },
  { key: 'sky', label: 'Sky', hex: '#4CB4F0' },
  { key: 'blue', label: 'Blue', hex: '#7B93FF' },
  { key: 'violet', label: 'Violet', hex: '#B18CFF' },
  { key: 'magenta', label: 'Magenta', hex: '#E07BE0' },
  { key: 'silver', label: 'Silver', hex: '#C9CED6' },
]
// The longest project name the strip shows whole; a longer one is cut with "…".
const NAME_MAX = 20

// Below this width the rows use short names so they fit on one line.
const NARROW = 64

// The panel's box: its widest, the cells its border and padding take, and the label and setting-name columns.
const PANEL_WIDTH = 74
const PANEL_FRAME = 4
const LABEL_WIDTH = 10
const NAME_WIDTH = 17

// The strip above the prompt: its label column, the cells in each bar, and the eighths a bar's last cell fills by.
const STRIP_LABEL = 11
const METER = 8
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
// The 5-hour window's pace shows once this much of it has gone by, so the first minutes don't cry wolf.
const FIVE_HOURS = 5 * 3_600_000
const PACE_AFTER_MS = 15 * 60_000
// At rest, the strip's reset countdown moves on once a minute.
const STRIP_REFRESH_MS = 60_000

// Which of the four models a name means: "claude-opus-5-5", "Opus 5.5" and "opus" are all Opus.
export function family(name: string | undefined): string | null {
  const n = (name ?? '').toLowerCase()
  return MODELS.find(m => n.includes(m.key))?.key ?? null
}

// An effort level the panel shows, or null for anything else ("auto", a number, nothing).
export function effortLevel(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return EFFORTS.some(x => x.key === v) ? v : null
}

export const modelLabel = (key: string | null) => MODELS.find(m => m.key === key)?.label ?? 'Model not known yet'
export const effortLabel = (key: string | null) => EFFORTS.find(x => x.key === key)?.label

function fiveHourOf(limits: readonly { kind: string; percentUsed: number }[]): number | null {
  const l = limits.find(r => r.kind === 'five_hour')
  return l ? Math.round(l.percentUsed) : null
}

const takesEffortOf = (hasEffort: boolean, noEffort: readonly string[], model: string | null) =>
  hasEffort && !(model !== null && noEffort.includes(model))

export function bar(percent: number, width: number): string {
  const full = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

// A block bar: whole cells, then the cell the fill ends in by eighths, then the empty track.
export function meter(percent: number, cells = METER): { full: string; part: string; empty: string } {
  const eighths = Math.round((Math.max(0, Math.min(100, percent)) / 100) * cells * 8)
  const whole = Math.floor(eighths / 8)
  const part = EIGHTHS[eighths % 8] ?? ''
  return { full: '█'.repeat(whole), part, empty: ' '.repeat(cells - whole - (part ? 1 : 0)) }
}

// A bar's color says how full it is, and nothing else: green under 50%, amber to 79%, red from 80%.
export const tone = (percent: number) => (percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success')

// Token counts in the strip: 840, 84K, 1.24M; a whole million reads 1M.
export const amount = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : short(n))

// An Eastern time of day as "3:10 PM" or "9 AM", with the weekday ("Thu 9 AM") when it falls on another day.
export function easternClock(ms: number, now: number): string {
  const d = new Date(ms + easternOffsetMs(ms))
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const time = `${h % 12 || 12}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
  return easternDay(ms) === easternDay(now) ? time : `${WEEKDAYS[d.getUTCDay()]?.slice(0, 3)} ${time}`
}

const hoursMinutes = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000))
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

// A rate-limit window on the Limits line: how much is used (the bar), how much is left, and when it resets. When the
// 5-hour window's pace so far would use it up before then, the note says when instead.
export function limitText(l: ToolkitLimit, now: number): { used: number; left: string; note: string; isPace: boolean } {
  const reset = l.resetsAt === undefined ? NaN : Date.parse(l.resetsAt)
  if (Number.isFinite(reset) && reset <= now) {
    return { used: 0, left: '100% left', note: `reset at ${easternClock(reset, now)}`, isPace: false }
  }
  const used = Math.max(0, l.percentUsed)
  const left = `${Math.max(0, Math.round(100 - used))}% left`
  if (!Number.isFinite(reset)) return { used, left, note: '', isPace: false }
  if (l.kind === 'five_hour' && used > 0 && used < 100) {
    const start = reset - FIVE_HOURS
    const out = start + ((now - start) * 100) / used
    if (now - start >= PACE_AFTER_MS && out < reset) {
      return { used, left, note: `runs out about ${easternClock(out, now)} at this pace`, isPace: true }
    }
  }
  const note = `resets ${easternClock(reset, now)}${l.kind === 'five_hour' ? ` (${hoursMinutes(reset - now)})` : ''}`
  return { used, left, note, isPace: false }
}

export type StatusParts = {
  model: string | null
  effort: string | null
  takesEffort: boolean
  helpers: number
}

// The status row at the end of the gray hint line under the prompt: model · effort · helpers. The 5h and context bars
// moved to the strip above the prompt. A part not known yet is left out.
export function statusText(s: StatusParts): string {
  return [
    modelLabel(s.model),
    s.takesEffort ? effortLabel(s.effort) : undefined,
    s.helpers === 1 ? '1 helper working' : s.helpers > 1 ? `${s.helpers} helpers working` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}

// The strip's figures from the engine's latest reading; one it doesn't have yet keeps the last.
async function noteUsage(
  $: EngineInterface,
  u: { context: { tokens?: number; percent?: number; window: number }; rateLimits: ToolkitLimit[]; cost?: { usd: number } },
) {
  try {
    await update($, usageA, old => ({
      costUsd: u.cost?.usd ?? old?.costUsd ?? null,
      contextTokens: u.context.tokens ?? old?.contextTokens ?? null,
      contextPercent: u.context.percent ?? old?.contextPercent ?? null,
      contextWindow: u.context.window,
      limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    }))
    const now = await $.clock.now()
    await update($, nowA, old => Math.max(old, now))
  } catch {}
}

// This session's tokens as Today's report counts them: new ones in and out, helpers included, cache re-reads left out.
// Work the report hasn't counted yet adds in: the main loop's request in progress (unless it was just counted) and
// helpers still working, so the strip doesn't dip when one finishes. Resolves to the total, or null.
async function countSessionTokens($: EngineInterface, isTurnCounted = false): Promise<number | null> {
  try {
    const id = await $.session.id()
    let tokens = 0
    for (const k of (await $.store.keys()).filter(k => k.startsWith('day:') && k.endsWith(`:${id}`))) {
      const d = (await $.store.get(k)) as Partial<ReportDay> | undefined
      tokens += (d?.tokensIn ?? 0) + (d?.tokensOut ?? 0)
    }
    if (!isTurnCounted) tokens += (await read($, runA))?.mainTokens ?? 0
    tokens += ((await read($, agentsA)) ?? []).filter(isWorking).reduce((n, a) => n + a.tokens, 0)
    await update($, sessionTokensA, () => tokens)
    return tokens
  } catch {
    return null
  }
}

// New tokens from one of Claude's or a helper's requests count into the strip right away; the main loop's also wait
// in the run until the report counts its request. The ones written (`out`) count into this turn's "out".
async function addTokens($: EngineInterface, tokens: number, isMain: boolean, out: number) {
  if (tokens <= 0) return
  try {
    await update($, sessionTokensA, old => (old ?? 0) + tokens)
    await update($, runA, r =>
      r == null
        ? null
        : { ...r, ...(isMain ? { mainTokens: (r.mainTokens ?? 0) + tokens } : {}), outTokens: (r.outTokens ?? 0) + out },
    )
  } catch {}
}

// A helper's run that just started may not be listed yet, and one that just ended may still be.
async function countHelpers($: EngineInterface, change: { started?: string; ended?: string } = {}) {
  try {
    const ids = new Set((await $.agent.list()).filter(a => ACTIVE.includes(a.status)).map(a => a.id))
    if (change.started !== undefined) ids.add(change.started)
    if (change.ended !== undefined) ids.delete(change.ended)
    await update($, helpersA, () => ids.size)
  } catch {}
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

// Plain words for what Claude is doing right now, for the "Now:" line.
export function doing(tool: string, input: Record<string, unknown> = {}): string {
  const file = typeof input.file_path === 'string' ? input.file_path.split(/[\\/]/).pop() : undefined
  const about = typeof input.description === 'string' && input.description ? input.description : undefined
  if (tool === 'Bash' || tool === 'PowerShell') return about ? `running a command: ${about}` : 'running a command'
  if (tool === 'Read') return file ? `reading ${file}` : 'reading a file'
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return file ? `editing ${file}` : 'editing a file'
  if (tool === 'Grep' || tool === 'Glob') return 'searching files'
  if (tool === 'WebSearch' || tool === 'WebFetch') return 'looking on the web'
  if (tool === 'Agent') return about ? `starting a helper: ${about}` : 'starting a helper'
  if (tool === 'AskUserQuestion') return 'waiting for your answer'
  if (tool === 'Skill') return 'loading a skill'
  if (tool === 'TodoWrite' || tool === 'TaskCreate' || tool === 'TaskUpdate') return 'updating the checklist'
  if (tool.startsWith('mcp__')) return `using ${tool.split('__')[1] ?? tool}`
  return `using ${tool}`
}

const isTodoStatus = (s: unknown): s is ToolkitTodo['status'] =>
  s === 'pending' || s === 'in_progress' || s === 'completed'

// An item that turns in progress starts its clock; one already in progress keeps it. One that turns done notes when,
// for the finish estimate; one already done keeps that.
function withClock(t: ToolkitTodo, before: ToolkitTodo | undefined, now: number): ToolkitTodo {
  const { startedAt: _, doneAt: __, ...rest } = t
  if (t.status === 'completed') {
    return { ...rest, doneAt: before?.status === 'completed' && before.doneAt !== undefined ? before.doneAt : now }
  }
  if (t.status !== 'in_progress') return rest
  return { ...rest, startedAt: before?.status === 'in_progress' && before.startedAt !== undefined ? before.startedAt : now }
}

// The checklist after one of Claude's to-do tools ran: TodoWrite sends the whole list, TaskCreate and TaskUpdate one item.
export function nextTodos(
  old: readonly ToolkitTodo[],
  tool: string,
  input: Record<string, unknown>,
  result: unknown,
  now: number,
): ToolkitTodo[] {
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    return input.todos.flatMap((raw: Record<string, unknown>) => {
      if (typeof raw.content !== 'string' || !isTodoStatus(raw.status)) return []
      const activeForm = typeof raw.activeForm === 'string' && raw.activeForm ? raw.activeForm : raw.content
      const item = { content: raw.content, activeForm, status: raw.status }
      return [withClock(item, old.find(o => o.content === raw.content), now)]
    })
  }
  if (tool === 'TaskCreate' && typeof input.subject === 'string') {
    const id = (result as { task?: { id?: unknown } } | undefined)?.task?.id
    if (typeof id !== 'string') return [...old]
    const activeForm = typeof input.activeForm === 'string' && input.activeForm ? input.activeForm : input.subject
    return [...old, { id, content: input.subject, activeForm, status: 'pending' }]
  }
  if (tool === 'TaskUpdate' && typeof input.taskId === 'string') {
    if (input.status === 'deleted') return old.filter(o => o.id !== input.taskId)
    return old.map(o => {
      if (o.id !== input.taskId) return o
      const item = {
        ...o,
        content: typeof input.subject === 'string' ? input.subject : o.content,
        activeForm: typeof input.activeForm === 'string' && input.activeForm ? input.activeForm : o.activeForm,
        status: isTodoStatus(input.status) ? input.status : o.status,
      }
      return withClock(item, o, now)
    })
  }
  return [...old]
}

export function doneText(d: ToolkitDone): string {
  const word = d.isAborted ? '■ Stopped' : d.completed < d.total ? '◆ Waiting on you' : '✓ All done'
  const steps = d.total > 0 ? `${d.completed} of ${d.total} steps` : undefined
  return [word, `took ${duration(d.tookMs)}`, steps].filter(Boolean).join(' · ')
}

// A clock that ticks in the work view, with seconds kept two wide so it doesn't jump: 45s, 4m 05s, 1h 02m.
export function ticking(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m`
  if (s >= 60) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`
  return `${s}s`
}

// Minutes and seconds, as a running shell or a helper shows them: 0:41, 12:05.
export const minSec = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// How long a finished shell took: 0.4s, 18s, 1:05.
export function shellTime(ms: number): string {
  const s = Math.max(0, ms) / 1000
  if (s < 10) return `${s.toFixed(1)}s`
  if (s < 60) return `${Math.round(s)}s`
  return minSec(ms)
}

// The exit code a failed command's error names ("Exit code 2"), if it names one.
export function exitCodeOf(text: string): number | undefined {
  const m = /exit code:?\s*(-?\d+)/i.exec(text)
  return m?.[1] === undefined ? undefined : Number(m[1])
}

// The shells the work view keeps: the newest SHELLS_SHOWN, plus older ones still running and the newest FAILED_KEPT
// older ones that failed, in the order they ran.
export function keptShells(shells: readonly ToolkitShell[]): ToolkitShell[] {
  const older = shells.slice(0, Math.max(0, shells.length - SHELLS_SHOWN))
  const failed = older.filter(s => s.status === 'failed').slice(-FAILED_KEPT)
  return [...older.filter(s => s.status === 'running' || failed.includes(s)), ...shells.slice(older.length)]
}

// How many rows a row of parts takes when each part that doesn't fit after the one before moves to a new line. A part
// wider than the room is cut, so it takes one row.
export function packRows(widths: readonly number[], gap: number, room: number): number {
  const fit = Math.max(1, room)
  let rows = 0
  let x = 0
  for (const w of widths.map(n => Math.min(n, fit))) {
    if (rows === 0 || x + gap + w > fit) {
      rows++
      x = w
    } else x += gap + w
  }
  return Math.max(1, rows)
}

// Which parts of the work view fit in so many rows: parts give way in the order named until the rest fit. A part not
// named never gives way.
export function fitParts(rows: number, parts: readonly { key: string; rows: number }[], order: readonly string[]): Set<string> {
  const kept = new Set(parts.map(p => p.key))
  let total = parts.reduce((n, p) => n + p.rows, 0)
  for (const key of order) {
    if (total <= rows) break
    const p = parts.find(x => x.key === key)
    if (p !== undefined && kept.delete(key)) total -= p.rows
  }
  return kept
}

// Cells per step in the Steps bar: 3 each, fewer for a long list, never under 1.
export const stepCells = (steps: number) => Math.max(1, Math.min(3, Math.floor((STEPS_BAR + 1) / Math.max(1, steps)) - 1))

// When Claude should finish: the average step finished this turn, times the steps left, after the last one finished;
// never sooner than 30 seconds from now. Null until a step finishes this turn.
export function finishAt(todos: readonly ToolkitTodo[], startedAt: number, now: number): number | null {
  const finished = todos.filter(t => t.status === 'completed' && t.doneAt !== undefined && t.doneAt >= startedAt)
  if (finished.length === 0) return null
  const last = Math.max(...finished.map(t => t.doneAt ?? startedAt))
  const left = todos.filter(t => t.status !== 'completed').length
  return Math.max(last + ((last - startedAt) / finished.length) * left, now + 30_000)
}

export const leftText = (ms: number) => (ms < 60_000 ? 'under 1m left' : `${hoursMinutes(ms)} left`)

// From one Eastern time to another, as "2:14 to 2:18 PM" when both share AM or PM on the same day.
export function spanText(from: number, to: number, now: number): string {
  const a = easternClock(from, now)
  const b = easternClock(to, now)
  const suffix = b.slice(-3)
  return `${a.endsWith(suffix) && easternDay(from) === easternDay(to) ? a.slice(0, -3) : a} to ${b}`
}

// The work view's Done line: how the turn ended, when, how long it took, and the shells and helpers it folds in.
export function doneLine(d: ToolkitDone, now: number): { mark: string; color: string; text: string } {
  const mark = d.isAborted
    ? { mark: '■', color: 'warning', word: 'Stopped' }
    : d.completed < d.total
      ? { mark: '◆', color: 'claude', word: 'Waiting on you' }
      : { mark: '✓', color: 'success', word: undefined }
  const shells = d.shells ? `${plural(d.shells, 'shell')}${d.failed ? ` (${d.failed} failed)` : ''}` : undefined
  const text = [
    mark.word,
    d.startedAt !== undefined && d.endedAt !== undefined ? spanText(d.startedAt, d.endedAt, now) : undefined,
    `took ${ticking(d.tookMs)}`,
    d.completed < d.total ? `${d.completed} of ${d.total} steps` : undefined,
    shells,
    d.helpers ? plural(d.helpers, 'helper') : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
  return { mark: mark.mark, color: mark.color, text }
}

// What a helper's line says it's doing: the latest action while it works, else how it ended.
export const helperDoing = (a: ToolkitAgent) =>
  isWorking(a) ? a.doing : a.status === 'done' ? 'finished' : a.status === 'stopped' ? 'stopped' : 'failed'

// The work view's order: each helper, then the helpers it started, one level deeper. A helper whose parent isn't in
// the list starts a family of its own.
export function nest(agents: readonly ToolkitAgent[]): { agent: ToolkitAgent; depth: number }[] {
  const out: { agent: ToolkitAgent; depth: number }[] = []
  const seen = new Set<string>()
  const add = (a: ToolkitAgent, depth: number) => {
    if (seen.has(a.id)) return
    seen.add(a.id)
    out.push({ agent: a, depth })
    for (const child of agents) if (child.parentId === a.id) add(child, depth + 1)
  }
  for (const a of agents) if (!agents.some(p => p.id === a.parentId)) add(a, 0)
  // Anything left (a loop of parents, which shouldn't happen) still gets a line.
  for (const a of agents) add(a, 0)
  return out
}

// Ticks once a second while Claude or a helper works, so the clocks move. While the band is being drawn, frames move
// it every FRAME_MS as well, so the shine sweeps and numbers count up; with nothing drawing it, the frames stop.
let ticker: Timer | null = null
let frames: Timer | null = null
let stripTimer: Timer | null = null
let lastDrawn = 0

const moveClock = ($: EngineInterface) =>
  void $.clock
    .now()
    .then(now => update($, nowA, () => now))
    .catch(() => {})

function startTicker($: EngineInterface) {
  if (ticker !== null) return
  ticker = $.clock.every(1000, () => moveClock($))
}

// Called as the band draws while something moves; the frames stop once the band hasn't drawn for a second.
function startFrames($: EngineInterface, now: number) {
  lastDrawn = now
  if (frames !== null) return
  try {
    frames = $.clock.every(FRAME_MS, () => {
      void $.clock
        .now()
        .then(async t => {
          if (t - lastDrawn > 1000) stopFrames()
          else await update($, nowA, () => t)
        })
        .catch(() => {})
    })
  } catch {}
}

function stopFrames() {
  frames?.cancel()
  frames = null
}

// Numbers count up and bars fill smoothly while the clock moves: each shown value eases from where it was toward its
// new one over TWEEN_MS. At rest a value shows as it is.
const tweens = new Map<string, { from: number; to: number; at: number }>()

function tweened(key: string, target: number, now: number, isMoving: boolean): number {
  const t = tweens.get(key)
  const eased = (x: { from: number; to: number; at: number }) => {
    const f = Math.min(1, Math.max(0, (now - x.at) / TWEEN_MS))
    return x.from + (x.to - x.from) * (1 - (1 - f) ** 3)
  }
  if (!isMoving || t === undefined) {
    tweens.set(key, { from: target, to: target, at: now })
    return target
  }
  if (t.to === target) return eased(t)
  const shown = eased(t)
  tweens.set(key, { from: shown, to: target, at: now })
  return shown
}

function stopTicker() {
  ticker?.cancel()
  ticker = null
  stopFrames()
}

async function setDoing($: EngineInterface, words: string) {
  const now = await $.clock.now()
  await update($, runA, r => (r == null ? null : r.doing === words ? r : { ...r, doing: words, doingSince: now }))
}

const isWorking = (a: ToolkitAgent) => a.status === 'working'
// New tokens in and out, without what Claude re-read from cache.
const newTokens = (u: TurnTokens | undefined) => (u ? u.input_tokens + u.cache_creation_input_tokens + u.output_tokens : 0)

// A helper that just started gets a line in the work view, under the helper that started it if one did.
async function startHelper($: EngineInterface, id: string, parentId: string | undefined, task: string, model: string) {
  try {
    const now = await $.clock.now()
    const line: ToolkitAgent = {
      id,
      ...(parentId === undefined ? {} : { parentId }),
      task,
      model: family(model),
      startedAt: now,
      status: 'working',
      doing: 'starting',
      tokens: 0,
      costUsd: 0,
    }
    await update($, agentsA, old => [...(old ?? []).filter(a => a.id !== id), line])
    await update($, nowA, () => now)
    startTicker($)
  } catch {}
}

let shellCount = 0

// A shell Claude starts gets a line in the work view, with the command on one line and the reason Claude gave.
async function startShell($: EngineInterface, input: Record<string, unknown>): Promise<string | null> {
  try {
    const now = await $.clock.now()
    const id = `${now}-${++shellCount}`
    const shell: ToolkitShell = {
      id,
      command: typeof input.command === 'string' ? input.command.replace(/\s+/g, ' ').trim().slice(0, COMMAND_KEPT) : '',
      why: typeof input.description === 'string' ? input.description : '',
      startedAt: now,
      status: 'running',
    }
    await update($, shellsA, old => keptShells([...(old ?? []), shell]))
    await update($, runA, r => (r == null ? null : { ...r, shells: (r.shells ?? 0) + 1 }))
    return id
  } catch {
    return null
  }
}

// A shell's line shows how it ended: worked, failed with the exit code its error names, or moved to the background.
async function endShell($: EngineInterface, id: string, result: { deny?: string; isError?: true; text?: string; result?: unknown }) {
  try {
    const now = await $.clock.now()
    const isFailed = result.deny !== undefined || result.isError === true
    const isBackground =
      !isFailed && typeof (result.result as { backgroundTaskId?: unknown } | undefined)?.backgroundTaskId === 'string'
    const code = isFailed ? exitCodeOf(result.deny ?? result.text ?? '') : undefined
    const status: ToolkitShell['status'] = isFailed ? 'failed' : isBackground ? 'background' : 'done'
    await update($, shellsA, old =>
      keptShells(
        (old ?? []).map(s => (s.id === id ? { ...s, endedAt: now, status, ...(code === undefined ? {} : { exitCode: code }) } : s)),
      ),
    )
    if (isFailed) await update($, runA, r => (r == null ? null : { ...r, failed: (r.failed ?? 0) + 1 }))
  } catch {}
}

async function updateAgent($: EngineInterface, id: string, change: (a: ToolkitAgent) => ToolkitAgent) {
  try {
    await update($, agentsA, old => (old ?? []).map(a => (a.id === id ? change(a) : a)))
  } catch {}
}

// A helper's line shows how it ended; the clock stops once neither Claude nor a helper is working.
async function endAgent($: EngineInterface, id: string, reason: string, usage: TurnTokens | undefined) {
  try {
    const now = await $.clock.now()
    const status = reason === 'answer' ? 'done' : reason === 'aborted' ? 'stopped' : 'failed'
    // A helper the person stopped stays stopped, whatever its own end says.
    await updateAgent($, id, a => ({
      ...a,
      status: a.status === 'stopped' ? 'stopped' : status,
      doing: '',
      endedAt: now,
      tokens: Math.max(a.tokens, newTokens(usage)),
    }))
    if (!((await read($, agentsA)) ?? []).some(isWorking) && (await read($, runA)) == null) stopTicker()
  } catch {}
}

let stopTimer: Timer | null = null

// ■ on a helper's line ends it on a second press within CLEAR_ARM_MS, through Claude Code's own TaskStop tool.
// Claude hears that the helper stopped, as when Claude stops one itself.
async function pressStop($: EngineInterface, id: string) {
  stopTimer?.cancel()
  stopTimer = null
  if ((await read($, stopArmedA)) !== id) {
    await update($, stopArmedA, () => id)
    stopTimer = $.clock.after(CLEAR_ARM_MS, () => void update($, stopArmedA, () => null))
    $.ui.toast('Press Stop again to stop this helper.')
    return
  }
  await update($, stopArmedA, () => null)
  try {
    const r = await $.tool.call({ tool: 'TaskStop', task_id: id })
    if (r.deny !== undefined || r.isError) {
      $.ui.toast(`Couldn't stop that helper: ${r.deny ?? r.text ?? 'Claude Code gave no reason.'}`)
      return
    }
    const task = ((await read($, agentsA)) ?? []).find(a => a.id === id)?.task
    await endAgent($, id, 'aborted', undefined)
    $.ui.toast(task === undefined ? 'Helper stopped.' : `Stopped "${task}".`)
  } catch {
    $.ui.toast("Couldn't stop that helper. Ask Claude to stop it.")
  }
}

// A line still working whose helper the engine lists as ended is marked ended, so a missed end can't keep it spinning.
async function settleAgents($: EngineInterface) {
  try {
    if (!((await read($, agentsA)) ?? []).some(isWorking)) return
    const listed = await $.agent.list()
    const now = await $.clock.now()
    await update($, agentsA, old =>
      (old ?? []).map(a => {
        const status = ENDED[listed.find(l => l.id === a.id)?.status ?? '']
        return isWorking(a) && status !== undefined ? { ...a, status, doing: '', endedAt: now } : a
      }),
    )
  } catch {}
}

// The person's next message starts the work view over: the shells go, and so do the helpers that finished.
async function clearWork($: EngineInterface) {
  try {
    await settleAgents($)
    await update($, agentsA, old => ((old ?? []).some(a => !isWorking(a)) ? (old ?? []).filter(isWorking) : (old ?? [])))
    await update($, shellsA, old => ((old ?? []).length > 0 ? [] : (old ?? [])))
  } catch {}
}

async function setCleanView($: EngineInterface, value: boolean) {
  await update($, cleanViewA, () => value)
  try {
    await $.store.set('cleanView', value)
  } catch {}
}

async function setHelperMode($: EngineInterface, value: ToolkitHelperMode) {
  await update($, helperModeA, () => value)
  try {
    await $.store.set('helperMode', value)
  } catch {}
}

export function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return `${Math.round(n)}`
}

const money = (usd: number) => `$${Math.max(0, usd).toFixed(2)}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Eastern Time is UTC−4 from the second Sunday of March at 2:00 to the first Sunday of November at 2:00, else UTC−5.
function easternOffsetMs(ms: number): number {
  const y = new Date(ms).getUTCFullYear()
  const sunday = (month: number, n: number) => 1 + ((7 - new Date(Date.UTC(y, month, 1)).getUTCDay()) % 7) + 7 * (n - 1)
  const start = Date.UTC(y, 2, sunday(2, 2), 7)
  const end = Date.UTC(y, 10, sunday(10, 1), 6)
  return (ms >= start && ms < end ? -4 : -5) * 3_600_000
}

// The Eastern date of a moment, as YYYY-MM-DD.
export function easternDay(ms: number): string {
  return new Date(ms + easternOffsetMs(ms)).toISOString().slice(0, 10)
}

// An Eastern moment as "October 18, 1:32 PM".
export function easternWhen(ms: number): string {
  const d = new Date(ms + easternOffsetMs(ms))
  const h = d.getUTCHours()
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${h % 12 || 12}:${minutes} ${h < 12 ? 'AM' : 'PM'}`
}

const noonOf = (day: string) => new Date(`${day}T12:00:00Z`)
const addDays = (day: string, n: number) => new Date(noonOf(day).getTime() + n * 86_400_000).toISOString().slice(0, 10)

// The first day a tab covers: today, this week from Monday, this month, this year, or everything.
export function periodStart(tab: ReportTab, today: string): string {
  if (tab === 'today') return today
  if (tab === 'week') return addDays(today, -((noonOf(today).getUTCDay() + 6) % 7))
  if (tab === 'month') return `${today.slice(0, 8)}01`
  if (tab === 'year') return `${today.slice(0, 5)}01-01`
  return '0000-01-01'
}

function periodTitle(tab: ReportTab, today: string, from: string): string {
  const d = noonOf(today)
  const monthDay = (day: string) => `${MONTHS[noonOf(day).getUTCMonth()]} ${noonOf(day).getUTCDate()}`
  if (tab === 'today') return `${WEEKDAYS[d.getUTCDay()]}, ${monthDay(today)}`
  if (tab === 'week') return `week of ${monthDay(from)}`
  if (tab === 'month') return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  if (tab === 'year') return `${d.getUTCFullYear()}`
  return 'all time'
}

function kindOfTool(tool: string): string | null {
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'build'
  if (tool === 'Bash' || tool === 'PowerShell') return 'run'
  if (tool.startsWith('mcp__claude-in-chrome__') || tool.includes('Claude_Browser')) return 'browser'
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob' || tool === 'WebSearch' || tool === 'WebFetch') return 'research'
  if (tool === 'Agent') return 'helpers'
  return null
}

// A request's type of work, judged from the tools it used: Building when it changed files (Claude reads before it
// edits, so reads outnumber edits), else the kind it used most; with none, planning and talk.
export function workType(tools: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const t of tools) {
    const kind = kindOfTool(t)
    if (kind !== null) counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  if (counts.has('build')) return 'build'
  let best = 'talk'
  let most = 0
  for (const w of WORK_TYPES) {
    const n = counts.get(w.key) ?? 0
    if (n > most) {
      best = w.key
      most = n
    }
  }
  return best
}

const emptyDay = (): ReportDay => ({
  sessions: [],
  requests: 0,
  ms: 0,
  types: {},
  tokensIn: 0,
  tokensCached: 0,
  tokensOut: 0,
  costUsd: 0,
  ownCalls: 0,
  ownTokens: 0,
})

// Each session keeps its own record per day (`day:YYYY-MM-DD:<session>`), so two tabs finishing at once can't
// overwrite each other's counts.
async function updateDay($: EngineInterface, now: number, change: (d: ReportDay, session: string) => ReportDay) {
  try {
    let session = 'unknown'
    try {
      session = await $.session.id()
    } catch {}
    const key = `day:${easternDay(now)}:${session}`
    const old = (await $.store.get(key)) as Partial<ReportDay> | undefined
    await $.store.set(key, change({ ...emptyDay(), ...(old ?? {}) }, session))
  } catch {}
}

// What the session has spent since it was last counted into the report: Claude's requests, helper agents (also those
// that finish after Claude's reply), and anything in between. /clear starts the session's cost over.
async function spentSinceCounted($: EngineInterface): Promise<number> {
  try {
    const u = await $.session.usage()
    if (u.cost === undefined) return 0
    const usd = u.cost.usd
    let spent = 0
    await update($, costSeenA, old => {
      const seen = old === null ? usd : old.since === u.startedAt ? old.usd : 0
      spent = Math.max(0, usd - seen)
      return { usd: Math.max(seen, usd), since: u.startedAt }
    })
    return spent
  } catch {
    return 0
  }
}

// The estimate check's record of this session: Claude Code's own cost so far. A later session checks it.
async function noteSessionCost($: EngineInterface) {
  try {
    const u = await $.session.usage()
    if (u.cost === undefined || u.cost.usd <= 0) return
    const record: SessionCostCheck = { claudeUsd: u.cost.usd, since: u.startedAt, at: await $.clock.now() }
    await $.store.set(`costCheck:${await $.session.id()}`, record)
  } catch {}
}

// Counts a finished helper agent's tokens into today's report. Its time falls inside the request that started it.
async function recordHelper($: EngineInterface, usage: TurnTokens | undefined) {
  try {
    const now = await $.clock.now()
    const spent = await spentSinceCounted($)
    await noteSessionCost($)
    await updateDay($, now, d => ({
      ...d,
      tokensIn: d.tokensIn + (usage ? usage.input_tokens + usage.cache_creation_input_tokens : 0),
      tokensCached: d.tokensCached + (usage?.cache_read_input_tokens ?? 0),
      tokensOut: d.tokensOut + (usage?.output_tokens ?? 0),
      costUsd: d.costUsd + spent,
    }))
  } catch {}
}

// Counts one finished request of the main loop into today's report. Tokens in are the new ones; the conversation
// Claude re-reads from cache at every step is kept apart. Time spent waiting on the person's answers isn't work.
async function recordTurn($: EngineInterface, durationMs: number, usage: TurnTokens | undefined, run: ToolkitRun | null) {
  try {
    const now = await $.clock.now()
    const type = workType(run?.tools ?? [])
    const spent = await spentSinceCounted($)
    await noteSessionCost($)
    const waited = Math.min(durationMs, run?.waitMs ?? 0)
    const ms = durationMs - waited
    await updateDay($, now, (d, session) => ({
      ...d,
      sessions: d.sessions.includes(session) ? d.sessions : [...d.sessions, session],
      requests: d.requests + 1,
      ms: d.ms + ms,
      types: {
        ...d.types,
        [type]: { requests: (d.types[type]?.requests ?? 0) + 1, ms: (d.types[type]?.ms ?? 0) + ms },
      },
      tokensIn: d.tokensIn + (usage ? usage.input_tokens + usage.cache_creation_input_tokens : 0),
      tokensCached: d.tokensCached + (usage?.cache_read_input_tokens ?? 0),
      tokensOut: d.tokensOut + (usage?.output_tokens ?? 0),
      costUsd: d.costUsd + spent,
      ...(waited > 0 ? { waitMs: (d.waitMs ?? 0) + waited } : {}),
    }))
  } catch {}
}

type TurnTokens = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// A request's cost at API prices, from its model and tokens; null for a model with no price.
export function estimatedCost(
  model: string,
  t: { uncached: number; writes5m: number; writes1h: number; cached: number; out: number },
): number | null {
  if (t.uncached + t.writes5m + t.writes1h + t.cached + t.out === 0) return 0
  const key = Object.keys(PRICES)
    .filter(k => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]
  const p = key === undefined ? undefined : PRICES[key]
  if (p === undefined) return null
  return (t.uncached * p[0] + t.out * p[1] + t.writes5m * p[2] + t.writes1h * p[3] + t.cached * p[4]) / 1_000_000
}

// One line of the backfill script: a request, or from version 4 on a helper agent's tokens (a `helper` line, whose
// time falls inside the request that started it). `cost` is absent on lines from before version 3, which carry no
// model, and null for a model with no price.
type PastLine = {
  isHelper: boolean
  at: number
  session: string
  tools: string[]
  took: number
  waited: number
  tokensIn: number
  tokensCached: number
  tokensOut: number
  cost?: number | null
}

function pastLine(line: string): PastLine | null {
  const fields = line.replace(/\r$/, '').split('\t')
  const isHelper = fields[0] === 'helper'
  const [ts, session, tools, took, tokensIn, tokensCached, tokensOut, model, uncached, writes5m, writes1h, waited] =
    isHelper ? [fields[1], fields[2], '', '0', ...fields.slice(3)] : fields
  const at = Date.parse(ts ?? '')
  if (!session || Number.isNaN(at)) return null
  return {
    isHelper,
    at,
    session,
    tools: tools ? tools.split(',') : [],
    took: Number(took) || 0,
    waited: Number(waited) || 0,
    tokensIn: Number(tokensIn) || 0,
    tokensCached: Number(tokensCached) || 0,
    tokensOut: Number(tokensOut) || 0,
    cost:
      model === undefined
        ? undefined
        : estimatedCost(model, {
            uncached: Number(uncached) || 0,
            writes5m: Number(writes5m) || 0,
            writes1h: Number(writes1h) || 0,
            cached: Number(tokensCached) || 0,
            out: Number(tokensOut) || 0,
          }),
  }
}

// Turns the backfill script's lines into totals per Eastern day, for the requests made before live counting began.
// Lines from version 3 on add the model, the token split that prices them, and the time spent waiting on answers.
// Version 4 adds helper agents' tokens and cost.
export function backfillDays(text: string, beforeMs: number): Record<string, ReportDay> {
  const days: Record<string, ReportDay> = {}
  for (const line of text.split('\n')) {
    const p = pastLine(line)
    if (p === null || p.at >= beforeMs) continue
    const d = (days[easternDay(p.at)] ??= { ...emptyDay(), isBackfilled: true })
    if (!p.isHelper) {
      const type = workType(p.tools)
      const wait = Math.min(p.took, p.waited)
      const ms = p.took - wait
      if (!d.sessions.includes(p.session)) d.sessions.push(p.session)
      d.requests += 1
      d.ms += ms
      d.types[type] = { requests: (d.types[type]?.requests ?? 0) + 1, ms: (d.types[type]?.ms ?? 0) + ms }
      if (wait > 0) d.waitMs = (d.waitMs ?? 0) + wait
    }
    d.tokensIn += p.tokensIn
    d.tokensCached += p.tokensCached
    d.tokensOut += p.tokensOut
    if (p.cost !== undefined) {
      d.costUsd += p.cost ?? 0
      d.isCostEstimated = d.isCostEstimated !== false && p.cost !== null
    }
  }
  return days
}

// The estimate check: each session's cost estimated from its session files, helpers included, counting only the
// work between the start of Claude Code's own count and the moment it was taken. Null where a model has no price.
export function sessionEstimates(
  text: string,
  windows: Record<string, { since: number; at: number }>,
): Record<string, number | null> {
  const estimates: Record<string, number | null> = {}
  for (const line of text.split('\n')) {
    const p = pastLine(line)
    const w = p === null ? undefined : windows[p.session]
    if (p === null || w === undefined || p.at < w.since || p.at > w.at) continue
    const old = estimates[p.session]
    estimates[p.session] = old === null || p.cost == null ? null : (old ?? 0) + p.cost
  }
  return estimates
}

export function checkText(c: ToolkitCheck): string {
  const apart = Math.round(((c.estimateUsd - c.claudeUsd) / c.claudeUsd) * 100)
  const gap = apart === 0 ? 'they match' : `${Math.abs(apart)}% ${apart < 0 ? 'lower' : 'higher'}`
  return `Estimate check: ${plural(c.sessions, 'past session')} · Claude Code ${money(c.claudeUsd)} · estimate ${money(c.estimateUsd)} (${gap}).`
}

// Once per BACKFILL_VERSION: the past year of session files fills in everything before live counting began, as one
// `day:YYYY-MM-DD:past` record per day. It replaces the whole-day records earlier versions kept.
async function backfill($: EngineInterface) {
  try {
    const home = await $.env.get('USERPROFILE')
    if (!home) return
    const now = await $.clock.now()
    const liveSince = Number(await $.store.get('liveSince')) || now
    const script = `${$.plugin.root}/scripts/backfill.ps1`
    const since = new Date(now - 366 * 86_400_000).toISOString()
    const r = await $.process.run([...POWERSHELL, script, '-Projects', `${home}\\.claude\\projects`, '-Since', since], {
      timeoutMs: 600_000,
    })
    if (r.exitCode !== 0) return
    const days = backfillDays(r.stdout, liveSince)
    for (const k of await $.store.keys()) {
      if (/^day:\d{4}-\d{2}-\d{2}(:past)?$/.test(k)) await $.store.delete(k)
    }
    for (const [day, d] of Object.entries(days)) await $.store.set(`day:${day}:past`, d)
    await $.store.set('backfilledAt', now)
    await $.store.set('backfillVersion', BACKFILL_VERSION)
  } catch {}
}

// At session start: each earlier session not checked yet gets the toolkit's estimate for the same span, read from its
// session files by the backfill script. The newest CHECKS_KEPT checked sessions are kept.
async function checkEstimates($: EngineInterface) {
  try {
    const current = await $.session.id()
    const checks: Record<string, SessionCostCheck> = {}
    for (const k of await $.store.keys()) {
      const c = k.startsWith('costCheck:') ? ((await $.store.get(k)) as SessionCostCheck | undefined) : undefined
      if (c) checks[k.slice('costCheck:'.length)] = c
    }
    const due = Object.keys(checks).filter(s => s !== current && checks[s]?.estimateUsd === undefined)
    const home = await $.env.get('USERPROFILE')
    if (due.length > 0 && home) {
      const since = new Date(Math.min(...due.map(s => checks[s]?.since ?? 0)) - 86_400_000).toISOString()
      const script = `${$.plugin.root}/scripts/backfill.ps1`
      const r = await $.process.run(
        [...POWERSHELL, script, '-Projects', `${home}\\.claude\\projects`, '-Since', since, '-Sessions', due.join(',')],
        { timeoutMs: 120_000 },
      )
      if (r.exitCode !== 0) return
      const estimates = sessionEstimates(r.stdout, checks)
      for (const s of due) {
        const c = checks[s]
        if (c) await $.store.set(`costCheck:${s}`, (checks[s] = { ...c, estimateUsd: estimates[s] ?? null }))
      }
    }
    const checked = Object.keys(checks)
      .filter(s => checks[s]?.estimateUsd !== undefined)
      .sort((a, b) => (checks[b]?.at ?? 0) - (checks[a]?.at ?? 0))
    for (const s of checked.slice(CHECKS_KEPT)) await $.store.delete(`costCheck:${s}`)
  } catch {}
}

async function showReport($: EngineInterface, tab: ReportTab) {
  try {
    const now = await $.clock.now()
    const today = easternDay(now)
    const from = periodStart(tab, today)
    const keys = (await $.store.keys()).filter(
      k => k.startsWith('day:') && k.slice(4, 14) >= from && k.slice(4, 14) <= today,
    )
    const days: ReportDay[] = []
    for (const k of keys) {
      const d = (await $.store.get(k)) as Partial<ReportDay> | undefined
      if (d) days.push({ ...emptyDay(), ...d })
    }
    const sum = (f: (d: ReportDay) => number) => days.reduce((n, d) => n + f(d), 0)
    const types = WORK_TYPES.map(w => ({
      ...w,
      requests: sum(d => d.types[w.key]?.requests ?? 0),
      ms: sum(d => d.types[w.key]?.ms ?? 0),
    })).filter(t => t.requests > 0)
    const ms = sum(d => d.ms)
    types.sort((a, b) => (ms > 0 ? b.ms - a.ms : b.requests - a.requests))
    let fiveHour: number | null = null
    let week: number | null = null
    try {
      const limits = (await $.session.usage()).rateLimits
      fiveHour = fiveHourOf(limits)
      const w = limits.find(l => l.kind === 'seven_day')
      week = w ? Math.round(w.percentUsed) : null
    } catch {}
    // The estimate check covers the past sessions checked so far, whatever the tab.
    const checked: SessionCostCheck[] = []
    for (const k of await $.store.keys()) {
      const c = k.startsWith('costCheck:') ? ((await $.store.get(k)) as SessionCostCheck | undefined) : undefined
      if (typeof c?.estimateUsd === 'number') checked.push(c)
    }
    const check: ToolkitCheck | null =
      checked.length === 0
        ? null
        : {
            sessions: checked.length,
            claudeUsd: checked.reduce((n, c) => n + c.claudeUsd, 0),
            estimateUsd: checked.reduce((n, c) => n + (c.estimateUsd ?? 0), 0),
          }
    const report: ToolkitReport = {
      tab,
      title: periodTitle(tab, today, from),
      sessions: new Set(days.flatMap(d => d.sessions)).size,
      requests: sum(d => d.requests),
      ms,
      types,
      tokensIn: sum(d => d.tokensIn),
      tokensCached: sum(d => d.tokensCached),
      tokensOut: sum(d => d.tokensOut),
      costUsd: sum(d => d.costUsd),
      ownCalls: sum(d => d.ownCalls),
      ownTokens: sum(d => d.ownTokens),
      fiveHour,
      week,
      waitMs: sum(d => d.waitMs ?? 0),
      hasBackfill: days.some(d => d.isBackfilled === true),
      hasCost: !days.some(d => d.isBackfilled === true && d.isCostEstimated !== true),
      liveSince: Number(await $.store.get('liveSince')) || null,
      check,
    }
    await update($, reportA, () => report)
  } catch {}
}

async function openReport($: EngineInterface) {
  await showReport($, 'today')
  await $.ui.open({ id: REPORT_PANE, title: "Today's report", focus: true, closeOnEscape: true })
}

// Opens a Windows Terminal tab in this folder running a fresh Claude session, with an empty box. In a project folder,
// the tab takes the project's color.
async function newTab($: EngineInterface) {
  const cwd = await $.session.cwd()
  const project = await read($, projectA)
  const hex = PROJECT_COLORS.find(c => c.key === project?.color)?.hex
  const color = hex === undefined ? [] : ['--tabColor', hex]
  await $.process.run(['wt.exe', '-w', '0', 'new-tab', '-d', cwd, ...color, ...POWERSHELL, `${$.plugin.root}/scripts/new-tab.ps1`])
}

let clearTimer: Timer | null = null

// Clear runs on a second press within CLEAR_ARM_MS, so one stray press can't end the conversation. From the nudge,
// it also puts the nudge away.
async function pressClear($: EngineInterface, isNudge = false) {
  clearTimer?.cancel()
  clearTimer = null
  if (!(await read($, clearArmedA))) {
    await update($, clearArmedA, () => true)
    clearTimer = $.clock.after(CLEAR_ARM_MS, () => void update($, clearArmedA, () => false))
    $.ui.toast('Press Clear again to start a fresh conversation in this tab.')
    return
  }
  await update($, clearArmedA, () => false)
  if (isNudge) await dismissNudge($)
  await launch($, 'clear')
}

async function launch($: EngineInterface, key: string) {
  try {
    if (key === 'start') await $.prompt.submit({ text: START_PROMPT, asUser: true })
    if (key === 'tab') await newTab($)
    if (key === 'folder') await $.process.run(['explorer.exe', await $.session.cwd()])
    if (key === 'report') await openReport($)
    if (key === 'clear') await $.command.run({ command: 'clear' })
    // A compaction a hook skips gets the engine's own line saying why.
    if (key === 'compact' && (await $.session.compact()).skip === undefined) {
      $.ui.toast('Conversation compacted. Claude carries on from a summary.')
    }
  } catch {
    $.ui.toast(
      key === 'compact'
        ? "Couldn't compact. If Claude is working, press Compact again once it's idle."
        : `Couldn't run ${[...LAUNCHES, ...FRESH].find(l => l.key === key)?.label ?? key}.`,
    )
  }
}

// Which nudge shows for these readings; a dismissed one stays away until its reading drops below the line.
export function nudgeFor(context: number | null, fiveHour: number | null, dismissed: readonly string[]) {
  const isContext = context !== null && context >= NUDGE_CONTEXT
  const isFiveHour = fiveHour !== null && fiveHour >= NUDGE_FIVE_HOUR
  const stillDismissed = dismissed.filter(r => (r === 'context' ? isContext : isFiveHour))
  let nudge: ToolkitNudge | null = null
  if (isContext && context !== null && !stillDismissed.includes('context')) nudge = { reason: 'context', percent: context }
  else if (isFiveHour && fiveHour !== null && !stillDismissed.includes('fiveHour')) {
    nudge = { reason: 'fiveHour', percent: fiveHour }
  }
  return { nudge, dismissed: stillDismissed }
}

export function nudgeText(n: ToolkitNudge): string {
  return n.reason === 'context'
    ? `Context is ${n.percent}% full. Wrap up now so the next session starts fresh.`
    : `You've used ${n.percent}% of your 5-hour limit. It's a good time to wrap up.`
}

// Called after each context or 5-hour reading; a nudge that just appeared also shows once as a toast.
async function checkNudge($: EngineInterface) {
  try {
    const found = nudgeFor(await read($, contextA), await read($, fiveHourA), (await read($, nudgeDismissedA)) ?? [])
    const before = await read($, nudgeA)
    await update($, nudgeDismissedA, () => found.dismissed)
    await update($, nudgeA, () => found.nudge)
    if (found.nudge !== null && before?.reason !== found.nudge.reason) $.ui.toast(nudgeText(found.nudge))
  } catch {}
}

// A "Needs you" alert through Claude Code's own notification channel; where that only rings the bell or finds no
// channel, a Windows notification from scripts\notify.ps1. A channel the person turned off stays off. The title names
// the project ("ClaudeMods needs you"), so an alert from one of several tabs says which one.
async function needsYou($: EngineInterface, text: string) {
  let title = ALERT_TITLE
  try {
    const project = await read($, projectA)
    if (project != null) title = `${project.name} needs you`
  } catch {}
  try {
    const r = await $.ui.notify(text, { title })
    if (r.isSent ? r.channel !== 'terminal_bell' : r.reason !== 'no-channel') return
  } catch {}
  try {
    const script = `${$.plugin.root}/scripts/notify.ps1`
    await $.process.run([...POWERSHELL, script, '-Title', title, '-Text', text], { timeoutMs: 20_000 })
  } catch {}
}

// Alerts run after the hook returns, so a question or a finished turn isn't held up by them.
function alertLater($: EngineInterface, text: string) {
  $.clock.after(0, () => void needsYou($, text))
}

// A project folder has its own CLAUDE.md, in it or a folder above it; the home folder's doesn't count.
export function isProjectFolder(found: readonly { dir: string }[], home: string | undefined): boolean {
  return projectDir(found, home) !== null
}

// The project's own folder: the nearest one with a CLAUDE.md, found root first, leaving out the home folder.
export function projectDir(found: readonly { dir: string }[], home: string | undefined): string | null {
  const trim = (p: string) => p.replace(/[\\/]+$/, '')
  const nearest = [...found].reverse().find(f => home === undefined || trim(f.dir).toLowerCase() !== trim(home).toLowerCase())
  return nearest === undefined ? null : trim(nearest.dir)
}

// The name the strip shows for a project: its folder's name, cut with "…" past NAME_MAX.
export function projectName(dir: string): string {
  const name = dir.split(/[\\/]/).pop() || dir
  return name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name
}

// A project seen for the first time gets the color fewest projects have, the first in the list on a tie.
export function pickColor(taken: readonly string[]): string {
  const uses = (key: string) => taken.filter(t => t === key).length
  return PROJECT_COLORS.reduce((best, c) => (uses(c.key) < uses(best.key) ? c : best)).key
}

export const folderText = (folder: string) =>
  `This session is outside a project folder (${folder}). Start Claude Code in the project's own folder so its rules and map load.`

async function checkFolder($: EngineInterface) {
  try {
    const found = await $.fs.ancestors({ names: ['CLAUDE.md', '.claude/CLAUDE.md'] })
    const dir = projectDir(found, await $.env.get('USERPROFILE'))
    const folder = dir !== null ? null : await $.session.cwd()
    await update($, folderWarningA, () => folder)
    if (folder !== null) $.ui.toast(folderText(folder))
    if (dir !== null) await noteProject($, dir)
  } catch {}
}

// Gives the strip and New tab the project's color, picking one the first time the toolkit sees the project.
async function noteProject($: EngineInterface, dir: string) {
  const all = ((await $.store.get('projectColors')) ?? {}) as Record<string, string>
  const saved = all[dir.toLowerCase()]
  const color = saved !== undefined && PROJECT_COLORS.some(c => c.key === saved) ? saved : pickColor(Object.values(all))
  if (color !== saved) await $.store.set('projectColors', { ...all, [dir.toLowerCase()]: color })
  const project: ToolkitProject = { name: projectName(dir), dir, color }
  await update($, projectA, () => project)
}

// A press in the Color row gives the project that color, here and on tabs New tab opens from now on.
async function setProjectColor($: EngineInterface, color: string) {
  const project = await read($, projectA)
  if (project == null) return
  await update($, projectA, () => ({ ...project, color }))
  try {
    const all = ((await $.store.get('projectColors')) ?? {}) as Record<string, string>
    await $.store.set('projectColors', { ...all, [project.dir.toLowerCase()]: color })
  } catch {}
}

async function compactFromNudge($: EngineInterface) {
  await dismissNudge($)
  await launch($, 'compact')
}

async function dismissNudge($: EngineInterface) {
  const n = await read($, nudgeA)
  if (n == null) return
  await update($, nudgeDismissedA, old => [...(old ?? []).filter(r => r !== n.reason), n.reason])
  await checkNudge($)
}

async function openHelp($: EngineInterface) {
  try {
    await $.ui.open({ id: HELP_PANE, title: 'AP Toolkit help', focus: true, closeOnEscape: true })
  } catch {}
}

function clearPending(kind: 'model' | 'effort') {
  return (p: ToolkitPending | null): ToolkitPending | null => {
    if (p === null) return null
    const rest = { ...p }
    delete rest[kind]
    return rest.model === undefined && rest.effort === undefined ? null : rest
  }
}

// Claude Code keeps an effort setting per model, so the toolkit remembers the last one it saw for each.
async function savedEffort($: EngineInterface, model: string | null): Promise<string | null> {
  if (model === null) return null
  try {
    const all = ((await $.store.get('effortByModel')) ?? {}) as Record<string, string>
    return effortLevel(all[model])
  } catch {
    return null
  }
}

async function saveEffort($: EngineInterface, model: string | null, effort: string) {
  if (model === null) return
  try {
    const all = ((await $.store.get('effortByModel')) ?? {}) as Record<string, string>
    if (all[model] !== effort) await $.store.set('effortByModel', { ...all, [model]: effort })
  } catch {}
}

// The engine queues the command and runs it once Claude is idle; the panel shows it as waiting until then.
async function switchModel($: EngineInterface, key: string) {
  const m = MODELS.find(x => x.key === key)
  if (!m) return
  await update($, pendingA, p => ({ ...(p ?? {}), model: key }))
  try {
    await $.command.run({ command: 'model', args: m.id })
    await update($, modelA, () => key)
    const effort = await savedEffort($, key)
    await update($, effortA, () => effort)
  } catch {
    $.ui.toast(`Couldn't switch to ${m.label}.`)
  }
  await update($, pendingA, clearPending('model'))
}

async function switchEffort($: EngineInterface, key: string) {
  await update($, pendingA, p => ({ ...(p ?? {}), effort: key }))
  try {
    await $.command.run({ command: 'effort', args: key })
    await update($, effortA, () => key)
    await saveEffort($, await read($, modelA), key)
  } catch {
    $.ui.toast(`Couldn't change effort to ${effortLabel(key)}.`)
  }
  await update($, pendingA, clearPending('effort'))
}

// ▴ on the strip opens the controls box, and ▾ closes it; it remembers which. Opening it while Clean View has it
// tucked away shows it until the turn ends.
async function setControlsOpen($: EngineInterface, value: boolean) {
  await update($, controlsOpenA, () => value)
  await update($, peekA, () => value)
  try {
    await $.store.set('controlsOpen', value)
  } catch {}
}

export const register: Register = (on, options) => {
  ticker = null
  frames = null
  lastDrawn = 0
  stripTimer = null
  clearTimer = null
  stopTimer = null
  tweens.clear()
  const rate = typeof options.hourlyRate === 'number' && options.hourlyRate > 0 ? options.hourlyRate : DEFAULT_RATE
  const isAlerting = options.needsYouAlerts !== false

  on('session.start', async ($, e, next) => {
    try {
      const controlsOpen = (await $.store.get('controlsOpen')) === true
      await update($, controlsOpenA, () => controlsOpen)
      const cleanView = (await $.store.get('cleanView')) !== false
      await update($, cleanViewA, () => cleanView)
      const savedMode = await $.store.get('helperMode')
      const helperMode = HELPER_MODES.find(m => m.key === savedMode)?.key ?? 'lowest'
      await update($, helperModeA, () => helperMode)
      await update($, clearArmedA, () => false)
      await update($, stopArmedA, () => null)
      // A reload mid-turn keeps the run in $.state; its clock starts again.
      if ((await read($, runA)) != null) startTicker($)
      const noEffort = await $.store.get('noEffort')
      if (Array.isArray(noEffort)) {
        await update($, noEffortA, () => noEffort.filter((x): x is string => typeof x === 'string'))
      }
    } catch {}
    try {
      const model = family(await $.session.model())
      await update($, modelA, old => model ?? old)
      const effort = await savedEffort($, model)
      await update($, effortA, old => effort ?? old)
    } catch {}
    try {
      const names = (await $.command.list()).map(c => c.name)
      await update($, hasEffortA, () => names.includes('effort'))
    } catch {}
    // The panel's version tag comes from plugin.json, so a batch bumps it in one place.
    try {
      const manifest = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)) as { version?: unknown }
      await update($, versionA, () => (typeof manifest.version === 'string' ? manifest.version : null))
    } catch {}
    try {
      const usage = await $.session.usage()
      await update($, fiveHourA, () => fiveHourOf(usage.rateLimits))
      await update($, contextA, () => usage.context.percent ?? null)
      await noteUsage($, usage)
    } catch {}
    await countSessionTokens($)
    try {
      stripTimer ??= $.clock.every(STRIP_REFRESH_MS, () => {
        void $.clock
          .now()
          .then(now => update($, nowA, old => Math.max(old, now)))
          .catch(() => {})
      })
    } catch {}
    await countHelpers($)
    await checkNudge($)
    await checkFolder($)
    try {
      await $.command.register({ name: 'report', description: "Open Today's report: time, type of work, and usage" })
      if ((await $.store.get('liveSince')) === undefined) await $.store.set('liveSince', await $.clock.now())
      if ((await $.store.get('backfillVersion')) !== BACKFILL_VERSION) $.clock.after(10_000, () => void backfill($))
      $.clock.after(20_000, () => void checkEstimates($))
    } catch {}
    return next(e)
  })

  on('command.run', { command: 'report' }, async $ => {
    try {
      await openReport($)
      return { text: "Today's report is open above the prompt." }
    } catch {
      return { text: "Today's report couldn't open." }
    }
  })

  on('session.measure', async ($, e, next) => {
    try {
      await update($, fiveHourA, () => fiveHourOf(e.rateLimits))
      await update($, contextA, old => e.context.percent ?? old)
    } catch {}
    await noteUsage($, e)
    await checkNudge($)
    return next(e)
  })

  // A /clear starts the session over under a new id, so the strip's session figures start over too.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      try {
        await update($, sessionTokensA, () => 0)
        await update($, usageA, old =>
          old === null ? null : { ...old, costUsd: 0, contextTokens: null, contextPercent: null },
        )
      } catch {}
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      await countHelpers($, { started: e.agentId })
      // A helper that finished and is sent more work is working again.
      await updateAgent($, e.agentId, a => {
        if (isWorking(a)) return a
        const { endedAt: _, ...rest } = a
        return { ...rest, status: 'working', doing: 'thinking' }
      })
      return next(e)
    }
    await clearWork($)
    try {
      const now = await $.clock.now()
      // The report counts the session's cost from its first request here; what came before was counted elsewhere.
      let costAtStart: number | null = null
      try {
        const u = await $.session.usage()
        if (u.cost !== undefined) {
          const usd = u.cost.usd
          costAtStart = usd
          await update($, costSeenA, old => old ?? { usd, since: u.startedAt })
        }
      } catch {}
      // The work view's "this turn" counts from the session's tokens and cost as the turn starts.
      const tokensAtStart = (await read($, sessionTokensA)) ?? 0
      await update($, runA, () => ({
        startedAt: now,
        doing: 'thinking',
        doingSince: now,
        tools: [],
        tokensAtStart,
        costAtStart,
        mainTokens: 0,
        outTokens: 0,
        shells: 0,
        failed: 0,
      }))
      await update($, doneA, () => null)
      await update($, peekA, () => false)
      // A finished list is cleared; one Claude is still working through carries on.
      await update($, todosA, old => ((old ?? []).every(t => t.status === 'completed') ? [] : (old ?? [])))
      await update($, nowA, () => now)
      startTicker($)
    } catch {}
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      // Helpers still working keep the clock going for their lines.
      await settleAgents($)
      if (!((await read($, agentsA)) ?? []).some(isWorking)) stopTicker()
      const run = await read($, runA)
      await recordTurn($, e.durationMs, e.usage, run)
      try {
        const now = await $.clock.now()
        const todos = (await read($, todosA)) ?? []
        const tokens = await countSessionTokens($, true)
        let usd = (await read($, usageA))?.costUsd ?? null
        try {
          const u = await $.session.usage()
          await noteUsage($, u)
          usd = u.cost?.usd ?? usd
        } catch {}
        // A shell whose end the toolkit missed shows how the turn ended.
        const missed: ToolkitShell['status'] = e.isAborted ? 'failed' : 'done'
        await update($, shellsA, old =>
          (old ?? []).some(s => s.status === 'running')
            ? (old ?? []).map(s => (s.status === 'running' ? { ...s, status: missed, endedAt: now } : s))
            : (old ?? []),
        )
        const done: ToolkitDone = {
          tookMs: e.durationMs,
          completed: todos.filter(t => t.status === 'completed').length,
          total: todos.length,
          isAborted: e.isAborted,
          ...(run == null
            ? {}
            : {
                startedAt: run.startedAt,
                endedAt: now,
                shells: run.shells ?? 0,
                failed: run.failed ?? 0,
                helpers: ((await read($, agentsA)) ?? []).length,
                tokens: Math.max(0, (tokens ?? 0) - (run.tokensAtStart ?? tokens ?? 0)),
                tokensOut: run.outTokens ?? 0,
                costUsd: usd !== null && run.costAtStart != null ? Math.max(0, usd - run.costAtStart) : null,
              }),
        }
        await update($, doneA, () => done)
        await update($, runA, () => null)
        await update($, peekA, () => false)
        if (isAlerting && !e.isAborted && e.durationMs >= LONG_RUN_MS) {
          alertLater($, `Claude finished. ${doneText(done).replace(/^\S+ /, '')}.`)
        }
      } catch {}
    } else {
      await recordHelper($, e.usage)
      await endAgent($, e.agentId, e.reason, e.usage)
      await countSessionTokens($)
    }
    await countHelpers($, { ended: e.agentId })
    return result
  })

  // Feeds the Now line, the checklist and the shells from the main loop's tool calls, and a helper's line from its own.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    if (e.agentId !== undefined) {
      await updateAgent($, e.agentId, a => ({ ...a, doing: doing(tool, input) }))
      return next(e)
    }
    try {
      await setDoing($, doing(tool, input))
      await update($, runA, r => (r == null ? null : { ...r, tools: [...r.tools, tool] }))
    } catch {}
    if (isAlerting && tool === 'AskUserQuestion') alertLater($, 'Claude has a question for you.')
    if (isAlerting && tool === 'ExitPlanMode') alertLater($, 'Claude has a plan ready for your OK.')
    const asked = WAITING_TOOLS.includes(tool) ? await $.clock.now() : null
    const shell = tool === 'Bash' || tool === 'PowerShell' ? await startShell($, input) : null
    const result = await next(e)
    if (shell !== null) await endShell($, shell, result)
    if (asked !== null) {
      try {
        const waited = Math.max(0, (await $.clock.now()) - asked)
        await update($, runA, r => (r == null ? null : { ...r, waitMs: (r.waitMs ?? 0) + waited }))
      } catch {}
    }
    if (result.deny === undefined && !result.isError) {
      try {
        const now = await $.clock.now()
        await update($, todosA, old => nextTodos(old ?? [], tool, input, result.result, now))
      } catch {}
    }
    return result
  }).catch(($, e, next) => next(e))

  // Each request Claude sends names the model and effort really in use.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      try {
        const model = family(e.model)
        if (model !== null) {
          const effort = effortLevel(e.effort)
          const takesNone = e.effort === undefined
          await update($, modelA, () => model)
          await update($, effortA, () => effort)
          let before: string[] = []
          let after: string[] = []
          await update($, noEffortA, old => {
            before = old ?? []
            const without = before.filter(x => x !== model)
            after = takesNone ? [...without, model] : without
            return after
          })
          if (after.length !== before.length) await $.store.set('noEffort', after)
          if (effort !== null) await saveEffort($, model, effort)
        }
        await setDoing($, 'thinking')
      } catch {}
      // Each reply's new tokens count into the strip and this turn's figures right away.
      const main = yield* next(e)
      await addTokens($, newTokens(main.usage ?? undefined), true, main.usage?.output_tokens ?? 0)
      return main
    }
    // A helper's request: its line says it's thinking, then counts the request's tokens, their cost at the model's
    // prices, and the model it ran on.
    const id = e.agentId
    await updateAgent($, id, a => (a.doing === 'thinking' ? a : { ...a, doing: 'thinking' }))
    const result = yield* next(e)
    const usage = result.usage ?? undefined
    const model = family(e.model)
    const cost = usage
      ? estimatedCost(MODELS.find(m => m.key === model)?.id ?? e.model, {
          uncached: usage.input_tokens,
          writes5m: usage.cache_creation_input_tokens,
          writes1h: 0,
          cached: usage.cache_read_input_tokens,
          out: usage.output_tokens,
        })
      : 0
    await updateAgent($, id, a => ({
      ...a,
      model: model ?? a.model,
      tokens: a.tokens + newTokens(usage),
      costUsd: (a.costUsd ?? 0) + (cost ?? 0),
    }))
    await addTokens($, newTokens(usage), false, usage?.output_tokens ?? 0)
    return result
  })

  // Keep the panel right when the person types /model or /effort themselves.
  on('command.run', { command: 'model' }, async ($, e, next) => {
    const result = await next(e)
    try {
      const model = family(await $.session.model())
      let isChanged = false
      await update($, modelA, old => {
        isChanged = model !== null && model !== old
        return model ?? old
      })
      if (isChanged) {
        const effort = await savedEffort($, model)
        await update($, effortA, () => effort)
      }
      await update($, pendingA, clearPending('model'))
    } catch {}
    return result
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    try {
      const effort = effortLevel(e.args)
      if (effort !== null) {
        await update($, effortA, () => effort)
        await saveEffort($, await read($, modelA), effort)
      }
      await update($, pendingA, clearPending('effort'))
    } catch {}
    return result
  }).catch(($, e, next) => next(e))

  // The status row rides at the end of Claude Code's own gray hint line, so it never reads as a warning. Claude Code
  // puts its own "·" before a tail, so the tail starts with a space only.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    try {
      const model = await read($, modelA)
      const text = statusText({
        model,
        effort: await read($, effortA),
        takesEffort: takesEffortOf(await read($, hasEffortA), (await read($, noEffortA)) ?? [], model),
        helpers: (await read($, helpersA)) ?? 0,
      })
      if (text) return next({ ...e, props: { ...e.props, tail: ` ${text}` } })
    } catch {}
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const controlsOpen = await read($, controlsOpenA)
    const usage = await read($, usageA)
    const sessionTokens = (await read($, sessionTokensA)) ?? 0
    const model = await read($, modelA)
    const effort = await read($, effortA)
    const pending = await read($, pendingA)
    const noEffort = (await read($, noEffortA)) ?? []
    const hasEffort = await read($, hasEffortA)
    const cleanView = await read($, cleanViewA)
    const peek = await read($, peekA)
    const run = await read($, runA)
    const done = await read($, doneA)
    const todos = (await read($, todosA)) ?? []
    const now = await read($, nowA)
    const helperMode = await read($, helperModeA)
    const nudge = await read($, nudgeA)
    const folderWarning = await read($, folderWarningA)
    const clearArmed = await read($, clearArmedA)
    const version = await read($, versionA)
    const agents = (await read($, agentsA)) ?? []
    const working = agents.filter(isWorking).length
    const shells = (await read($, shellsA)) ?? []
    const stopArmed = await read($, stopArmedA)
    const project = await read($, projectA)
    const projectColor = PROJECT_COLORS.find(c => c.key === project?.color)
    const { Box, Button, Text } = $.ui.resolve(e)

    const isNarrow = e.props.bodyColumns < NARROW
    const takesEffort = takesEffortOf(hasEffort, noEffort, model)

    // The work view: while Claude works, Steps, Time, Now, then shells and helpers stack above the strip, each section
    // ending in a gray row; after the turn, one Done line folds them in until the next message. While the clock moves,
    // spinners turn, the shine sweeps the current step, numbers count up, and a new or changed part lights up briefly.
    // A part that doesn't fit the window moves to a new line inside its own section.
    const isLive = e.props.isWorking && run != null
    const isMoving = e.props.isWorking || working > 0
    if (isMoving && ticker !== null) startFrames($, now)
    const frame = Math.floor(now / FRAME_MS)
    const spin = SPIN[Math.floor(frame / 2) % SPIN.length] ?? '◐'
    const at = Math.max(now, run?.startedAt ?? 0)
    const lit = (since: number | undefined) => (isMoving && since !== undefined && now - since < FLASH_MS ? 'subtle' : undefined)
    const label = (text: string) => (
      <Box width={STRIP_LABEL} flexShrink={0}>
        {text ? <Text dimColor>{`  ${text}`}</Text> : null}
      </Box>
    )
    const grayRow = () => <Text color="subtle">{'─'.repeat(Math.max(0, e.props.bodyColumns))}</Text>
    // This turn's tokens read new ("in") and written ("out"), as Claude Code counts them, then its cost.
    const turnPart = (tokens: number, out: number, usd: number | null) => (
      <Text>
        <Text dimColor>this turn </Text>
        {amount(Math.round(tweened('turnIn', Math.max(0, tokens - out), now, isMoving)))}
        <Text dimColor> in · </Text>
        {amount(Math.round(tweened('turnOut', out, now, isMoving)))}
        <Text dimColor> out</Text>
        {usd === null ? null : (
          <Text>
            <Text dimColor> · </Text>
            {money(tweened('turnCost', usd, now, isMoving))}
          </Text>
        )}
      </Text>
    )

    const shineCells = (cells: number) => {
      const peak = frame % (cells + SHINE_REST)
      return Array.from({ length: cells }, (_, j) => (
        <Text color={j === peak ? SHINE_PEAK : Math.abs(j - peak) === 1 ? SHINE_NEAR : 'claude'}>█</Text>
      ))
    }
    const cells = stepCells(todos.length)
    const stepsBar =
      todos.length === 0 ? (
        <Text>{shineCells(STEPS_BAR - 1)}</Text>
      ) : (
        <Text>
          {todos.map((t, i) => (
            <Text>
              {i > 0 ? ' ' : null}
              {t.status === 'completed' ? (
                <Text color="success">{'█'.repeat(cells)}</Text>
              ) : t.status === 'in_progress' ? (
                shineCells(cells)
              ) : (
                <Text backgroundColor="subtle">{' '.repeat(cells)}</Text>
              )}
            </Text>
          ))}
        </Text>
      )
    const current = todos.find(t => t.status === 'in_progress')
    const completed = todos.filter(t => t.status === 'completed').length
    const stepMs = current === undefined ? 0 : Math.max(0, at - (current.startedAt ?? run?.startedAt ?? at))
    const stepText =
      todos.length === 0 ? (
        <Text color="claude">{spin} Working</Text>
      ) : (
        <Text wrap="truncate-end">
          {completed} of {todos.length}
          {current === undefined ? null : (
            <Text>
              <Text dimColor> · </Text>
              <Text color={stepMs >= SLOW_STEP_MS ? 'warning' : 'claude'} backgroundColor={lit(current.startedAt)}>
                {spin} {current.activeForm}
              </Text>
              <Text dimColor> · {ticking(stepMs)}</Text>
            </Text>
          )}
        </Text>
      )
    // The checklist runs across under the bar; a long one folds its finished steps into one part.
    const isFolded = todos.length > MAX_ITEMS
    const listed = isFolded ? todos.filter(t => t.status !== 'completed') : todos
    const folded = todos.length - listed.length
    const more = Math.max(0, listed.length - MAX_ITEMS)
    const checklist = (
      <Box>
        {label('')}
        <Box flexWrap="wrap" columnGap={2} flexShrink={1}>
          {folded > 0 ? (
            <Text>
              <Text color="success">✓</Text>
              <Text dimColor> {folded} done</Text>
            </Text>
          ) : null}
          {listed.slice(0, MAX_ITEMS).map(t =>
            t.status === 'completed' ? (
              <Text wrap="truncate-end">
                <Text color="success" backgroundColor={lit(t.doneAt)}>
                  ✓
                </Text>
                <Text dimColor> {t.content}</Text>
              </Text>
            ) : t.status === 'in_progress' ? (
              <Text color="claude" wrap="truncate-end">
                {spin} {t.content}
              </Text>
            ) : (
              <Text wrap="truncate-end">
                <Text dimColor>○</Text> {t.content}
              </Text>
            ),
          )}
          {more > 0 ? <Text dimColor>… {more} more</Text> : null}
        </Box>
      </Box>
    )
    const finish = run == null ? null : finishAt(todos, run.startedAt, at)
    const lastDone = Math.max(0, ...todos.map(t => t.doneAt ?? 0))

    // A shell's time on the right, and a helper's figures, as plain text for working out how many rows a line takes.
    const shellMs = (s: ToolkitShell) => (s.endedAt ?? Math.max(now, s.startedAt)) - s.startedAt
    const shellEnd = (s: ToolkitShell) =>
      s.status === 'running'
        ? minSec(shellMs(s))
        : s.status === 'failed'
          ? `${s.exitCode === undefined ? 'failed' : `exit ${s.exitCode}`} · ${shellTime(shellMs(s))}`
          : s.status === 'background'
            ? 'in background'
            : shellTime(shellMs(s))
    const helperMs = (a: ToolkitAgent) => (a.endedAt ?? Math.max(now, a.startedAt)) - a.startedAt
    const helperEnd = (a: ToolkitAgent) => `${amount(a.tokens)} · ${money(a.costUsd ?? 0)} · ${minSec(helperMs(a))}`
    const shellRow = (s: ToolkitShell, i: number) => {
      const ms = shellMs(s)
      const isSlow = s.status === 'running' && ms >= SLOW_SHELL_MS
      const icon =
        s.status === 'running'
          ? { mark: spin, color: isSlow ? 'warning' : 'claude' }
          : s.status === 'failed'
            ? { mark: '✗', color: 'error' }
            : s.status === 'background'
              ? { mark: '◌', color: 'inactive' }
              : { mark: '✓', color: 'success' }
      return (
        <Box justifyContent="space-between" columnGap={2}>
          <Box flexShrink={1}>
            {label(i === 0 ? 'Shells' : '')}
            <Text color={icon.color} backgroundColor={lit(s.endedAt)}>
              {icon.mark}{' '}
            </Text>
            <Box flexWrap="wrap" columnGap={2} flexShrink={1}>
              <Box width={WORK_COLUMN} flexShrink={1}>
                <Text color="suggestion" wrap="truncate-end" backgroundColor={lit(s.startedAt)}>
                  {s.command}
                </Text>
              </Box>
              {s.why ? (
                <Text wrap="truncate-end" backgroundColor={lit(s.startedAt)}>
                  {s.why}
                </Text>
              ) : null}
            </Box>
          </Box>
          <Box flexShrink={0}>
            {s.status === 'running' ? (
              <Text color={isSlow ? 'warning' : 'claude'}>{minSec(ms)}</Text>
            ) : s.status === 'failed' ? (
              <Text>
                <Text color="error">{s.exitCode === undefined ? 'failed' : `exit ${s.exitCode}`}</Text>
                <Text dimColor> · {shellTime(ms)}</Text>
              </Text>
            ) : (
              <Text dimColor>{s.status === 'background' ? 'in background' : shellTime(ms)}</Text>
            )}
          </Box>
        </Box>
      )
    }
    const helperRow = ({ agent: a, depth }: { agent: ToolkitAgent; depth: number }, i: number) => {
      const isOn = isWorking(a)
      const mark = isOn ? { mark: DOTS[(frame + i * 3) % DOTS.length] ?? '⠋', color: 'claude' } : endMark(a)
      const ms = helperMs(a)
      const tokens = Math.round(tweened(`helper:${a.id}`, a.tokens, now, isMoving))
      return (
        <Box justifyContent="space-between" columnGap={2}>
          <Box flexShrink={1}>
            {label(i === 0 ? 'Helpers' : '')}
            <Text color={mark.color} backgroundColor={lit(a.endedAt)}>
              {mark.mark}{' '}
            </Text>
            <Box flexWrap="wrap" columnGap={2} flexShrink={1}>
              <Box width={WORK_COLUMN} flexShrink={1}>
                <Text wrap="truncate-end">
                  {depth > 0 ? `${'  '.repeat(depth - 1)}↳ ` : null}
                  <Text color="permission">{MODELS.find(m => m.key === a.model)?.short ?? 'Helper'}</Text>
                  <Text backgroundColor={lit(a.startedAt)}>
                    {'  '}
                    {a.task}
                  </Text>
                </Text>
              </Box>
              <Text dimColor wrap="truncate-end">
                {helperDoing(a)}
              </Text>
            </Box>
          </Box>
          <Box flexShrink={0} gap={1}>
            <Text dimColor>
              {amount(tokens)} · {money(a.costUsd ?? 0)} · {minSec(ms)}
            </Text>
            {isOn ? (
              <Button key={`stop-${a.id}`} plain onPress={() => pressStop($, a.id)}>
                <Text color="error">{stopArmed === a.id ? 'Sure? ■' : '■'}</Text>
              </Button>
            ) : (
              <Text> </Text>
            )}
          </Box>
        </Box>
      )
    }

    // Warnings sit on top of everything else, minimized or not: the folder check, then the wrap-up nudge.
    const folderRow =
      folderWarning == null ? null : (
        <Box gap={1} justifyContent="flex-end">
          <Text color="warning" wrap="truncate-end">
            ⚠ {folderText(folderWarning)}
          </Text>
          <Button key="folder-ok" label="Got it" onPress={() => update($, folderWarningA, () => null)} />
        </Box>
      )
    const nudgeRow =
      nudge == null ? null : (
        <Box gap={1} justifyContent="flex-end">
          <Text color="warning" wrap="truncate-end">
            ⚠ {nudgeText(nudge)}
          </Text>
          <Button key="nudge-compact" label="Compact" variant="primary" onPress={() => compactFromNudge($)} />
          <Button key="nudge-clear" label={clearArmed ? 'Sure? Clear' : 'Clear'} onPress={() => pressClear($, true)} />
          <Button key="nudge-later" label="Not now" onPress={() => dismissNudge($)} />
        </Box>
      )
    // The strip: two labeled lines above the prompt, Session and Limits. A part that doesn't fit the window moves to a
    // new line inside its own row, under the first part, so nothing falls off.
    const blocks = (percent: number) => {
      const m = meter(percent)
      return (
        <Text>
          <Text color={tone(percent)}>{m.full}</Text>
          {m.part ? (
            <Text color={tone(percent)} backgroundColor="subtle">
              {m.part}
            </Text>
          ) : null}
          <Text backgroundColor="subtle">{m.empty}</Text>
        </Text>
      )
    }
    // The controls box opens with ▴; while the work view shows, it stays tucked away unless opened this turn.
    const isControlsShown = controlsOpen && (!isLive || peek)
    const isBeat = e.props.isWorking && Math.floor(now / 1000) % 2 === 1
    const contextShown = usage?.contextPercent == null ? null : tweened('context', usage.contextPercent, now, isMoving)
    const contextPart =
      contextShown === null || usage === null ? (
        <Text dimColor wrap="truncate-end">
          Context shows after first reply
        </Text>
      ) : (
        <Text wrap="truncate-end">
          <Text dimColor>Context </Text>
          {blocks(contextShown)}
          <Text> {Math.round(contextShown)}%</Text>
          <Text dimColor>
            {'  '}
            {amount(usage.contextTokens ?? 0)}/{amount(usage.contextWindow)}
          </Text>
        </Text>
      )
    const limitPart = (label: string, l: ToolkitLimit) => {
      const t = limitText(l, now)
      return (
        <Text wrap="truncate-end">
          <Text dimColor>{label} </Text>
          {blocks(tweened(`limit:${l.kind}`, t.used, now, isMoving))}
          <Text> {t.left}</Text>
          {t.note ? (
            <Text color={t.isPace ? 'warning' : undefined} dimColor={!t.isPace}>
              {' '}
              · {t.note}
            </Text>
          ) : null}
        </Text>
      )
    }
    const fiveHourLimit = usage?.limits.find(l => l.kind === 'five_hour')
    const weekLimit = usage?.limits.find(l => l.kind === 'seven_day')
    // The rows the strip takes once its parts that don't fit move to new lines, so the work view leaves room for it.
    const sessionWidth = `${amount(sessionTokens)} tokens · ${money(usage?.costUsd ?? 0)} at API prices`.length
    const contextWidth =
      contextShown === null || usage === null
        ? 'Context shows after first reply'.length
        : `Context ${' '.repeat(METER)} ${Math.round(contextShown)}%  ${amount(usage.contextTokens ?? 0)}/${amount(usage.contextWindow)}`
            .length
    const modelWidth = `${modelLabel(model)}${takesEffort && effortLabel(effort) ? ` · ${effortLabel(effort)}` : ''}`.length + 2
    const limitWidth = (name: string, l: ToolkitLimit) => {
      const t = limitText(l, now)
      return `${name} ${' '.repeat(METER)} ${t.left}${t.note ? ` · ${t.note}` : ''}`.length
    }
    const limitWidths = [
      ...(fiveHourLimit === undefined ? [] : [limitWidth('5h', fiveHourLimit)]),
      ...(weekLimit === undefined ? [] : [limitWidth('Week', weekLimit)]),
    ]
    // In a project folder, the project's name, bold and in its color, takes the place of "Session"; the line's figures
    // move right to make room.
    const sessionLabel = project != null && projectColor ? Math.max(STRIP_LABEL, project.name.length + 4) : STRIP_LABEL
    const stripRows =
      packRows([sessionWidth, contextWidth], 3, e.props.bodyColumns - sessionLabel - modelWidth - 3) +
      packRows(limitWidths.length > 0 ? limitWidths : ['5h and Week show after first reply'.length], 3, e.props.bodyColumns - STRIP_LABEL)
    const strip = (
      <Box flexDirection="column">
        <Box justifyContent="space-between" columnGap={3}>
          <Box flexShrink={1}>
            <Box width={sessionLabel} flexShrink={0}>
              <Text>
                <Text color="claude" dimColor={isBeat}>
                  ◆
                </Text>
                {project != null && projectColor ? (
                  <Text color={projectColor.hex} bold>
                    {` ${project.name}`}
                  </Text>
                ) : (
                  <Text dimColor> Session</Text>
                )}
              </Text>
            </Box>
            <Box flexWrap="wrap" columnGap={3} flexShrink={1}>
              <Text wrap="truncate-end">
                {amount(Math.round(tweened('tokens', sessionTokens, now, isMoving)))}
                <Text dimColor> tokens · </Text>
                {money(tweened('cost', usage?.costUsd ?? 0, now, isMoving))}
                <Text dimColor> at API prices</Text>
              </Text>
              {contextPart}
            </Box>
          </Box>
          <Box flexShrink={0} gap={1}>
            <Text>
              <Text color="claude">{modelLabel(model)}</Text>
              {takesEffort && effortLabel(effort) ? (
                <Text>
                  <Text dimColor> · </Text>
                  <Text color="permission">{effortLabel(effort)}</Text>
                </Text>
              ) : null}
            </Text>
            {isControlsShown ? (
              <Button key="close-controls" label="▾" plain onPress={() => setControlsOpen($, false)} />
            ) : (
              <Button key="restore" label="▴" plain onPress={() => setControlsOpen($, true)} />
            )}
          </Box>
        </Box>
        <Box>
          <Box width={STRIP_LABEL} flexShrink={0}>
            <Text dimColor>{'  '}Limits</Text>
          </Box>
          <Box flexWrap="wrap" columnGap={3} flexShrink={1}>
            {fiveHourLimit === undefined && weekLimit === undefined ? (
              <Text dimColor wrap="truncate-end">
                5h and Week show after first reply
              </Text>
            ) : null}
            {fiveHourLimit !== undefined ? limitPart('5h', fiveHourLimit) : null}
            {weekLimit !== undefined ? limitPart('Week', weekLimit) : null}
          </Box>
        </Box>
      </Box>
    )

    let work: RenderElement | null = null
    if (isLive && run) {
      const turnTokens = Math.max(0, sessionTokens - (run.tokensAtStart ?? sessionTokens))
      const turnOut = Math.min(turnTokens, run.outTokens ?? 0)
      const turnCost =
        run.costAtStart != null && usage?.costUsd != null ? Math.max(0, usage.costUsd - run.costAtStart) : null
      const isSlowAction = at - run.doingSince >= SLOW_STEP_MS
      const started = `started ${easternClock(run.startedAt, at)} · ${ticking(at - run.startedAt)} so far`
      const ends =
        todos.length === 0
          ? null
          : finish === null
            ? '· ends: estimate after this step'
            : `· ends about ${easternClock(finish, at)}, ${leftText(finish - at)}`
      const helpers = nest(agents)

      // The band shows at most maxRows rows, and a taller one scrolls from the top, which takes the strip out of view.
      // So the work view gives way, least needed first: the gray rows, the checklist, the Time line, finished helpers,
      // the oldest shells, then the Now line. Each line's rows come from its parts' widths, a column to spare.
      const room = e.props.bodyColumns - STRIP_LABEL - 1
      const turnWidth =
        `this turn ${amount(turnTokens - turnOut)} in · ${amount(turnOut)} out${turnCost === null ? '' : ` · ${money(turnCost)}`}`.length
      const stepWidth =
        todos.length === 0
          ? `${spin} Working`.length
          : `${completed} of ${todos.length}${current === undefined ? '' : ` · ${spin} ${current.activeForm} · ${ticking(stepMs)}`}`.length
      const barWidth = todos.length === 0 ? STEPS_BAR - 1 : todos.length * (cells + 1) - 1
      const listWidths = [
        ...(folded > 0 ? [`✓ ${folded} done`] : []),
        ...listed.slice(0, MAX_ITEMS).map(t => `✓ ${t.content}`),
        ...(more > 0 ? [`… ${more} more`] : []),
      ].map(w => w.length)
      const parts = [
        { key: 'steps', rows: packRows([barWidth, stepWidth], 2, room - turnWidth - 3) },
        { key: 'checklist', rows: todos.length === 0 ? 0 : packRows(listWidths, 2, room) },
        { key: 'gray', rows: shells.length + agents.length > 0 ? 4 : 3 },
        { key: 'time', rows: packRows(ends === null ? [started.length] : [started.length, ends.length], 1, room) },
        { key: 'now', rows: 1 },
        ...shells.map(s => ({ key: `shell:${s.id}`, rows: packRows([WORK_COLUMN, s.why.length], 2, room - 4 - shellEnd(s).length) })),
        ...helpers.map(({ agent: a }) => ({
          key: `helper:${a.id}`,
          rows: packRows([WORK_COLUMN, helperDoing(a).length], 2, room - 6 - helperEnd(a).length),
        })),
      ]
      const shellKeys = (status: readonly ToolkitShell['status'][]) =>
        shells.filter(s => status.includes(s.status)).map(s => `shell:${s.id}`)
      const kept = fitParts(
        e.props.maxRows - (folderWarning == null ? 0 : 1) - (nudge == null ? 0 : 1) - (isControlsShown ? CONTROLS_ROWS + (project == null ? 0 : 1) : 0) - stripRows,
        parts,
        [
          'gray',
          'checklist',
          'time',
          ...helpers.filter(x => !isWorking(x.agent)).map(x => `helper:${x.agent.id}`),
          ...shellKeys(['done', 'background']),
          ...shellKeys(['failed']),
          ...shellKeys(['running']),
          'now',
        ],
      )
      const isGray = kept.has('gray')
      const shownShells = shells.filter(s => kept.has(`shell:${s.id}`))
      const shownHelpers = helpers.filter(x => kept.has(`helper:${x.agent.id}`))

      work = (
        <Box flexDirection="column">
          <Box justifyContent="space-between" columnGap={3}>
            <Box flexShrink={1}>
              {label('Steps')}
              <Box flexWrap="wrap" columnGap={2} flexShrink={1}>
                {stepsBar}
                {stepText}
              </Box>
            </Box>
            <Box flexShrink={0}>{turnPart(turnTokens, turnOut, turnCost)}</Box>
          </Box>
          {todos.length > 0 && kept.has('checklist') ? checklist : null}
          {isGray ? grayRow() : null}
          {kept.has('time') ? (
            <Box>
              {label('Time')}
              <Box flexWrap="wrap" columnGap={1} flexShrink={1}>
                <Text wrap="truncate-end">
                  <Text dimColor>started </Text>
                  {easternClock(run.startedAt, at)}
                  <Text dimColor> · </Text>
                  {ticking(at - run.startedAt)} so far
                </Text>
                {todos.length === 0 ? null : finish === null ? (
                  <Text dimColor wrap="truncate-end">
                    {ends}
                  </Text>
                ) : (
                  <Text wrap="truncate-end">
                    <Text dimColor>· ends about </Text>
                    <Text backgroundColor={lit(lastDone)}>{easternClock(finish, at)}</Text>
                    <Text dimColor>, {leftText(finish - at)}</Text>
                  </Text>
                )}
              </Box>
            </Box>
          ) : null}
          {isGray && kept.has('time') ? grayRow() : null}
          {kept.has('now') ? (
            <Box>
              {label('Now')}
              <Text wrap="truncate-end" color={isSlowAction ? 'warning' : undefined} backgroundColor={lit(run.doingSince)}>
                {run.doing}
              </Text>
            </Box>
          ) : null}
          {isGray && kept.has('now') ? grayRow() : null}
          {shownShells.length + shownHelpers.length > 0 ? (
            <Box flexDirection="column">
              {shownShells.map(shellRow)}
              {shownHelpers.map(helperRow)}
              {isGray ? grayRow() : null}
            </Box>
          ) : null}
        </Box>
      )
    } else if (done && !e.props.isWorking) {
      const d = doneLine(done, now)
      work = (
        <Box flexDirection="column">
          <Box justifyContent="space-between" columnGap={3}>
            <Box flexShrink={1}>
              {label('Done')}
              <Text wrap="truncate-end">
                <Text color={d.color}>{d.mark}</Text> {d.text}
              </Text>
            </Box>
            {done.tokens === undefined ? null : (
              <Box flexShrink={0}>{turnPart(done.tokens, Math.min(done.tokens, done.tokensOut ?? 0), done.costUsd ?? null)}</Box>
            )}
          </Box>
          {nest(agents.filter(isWorking)).map(helperRow)}
          {grayRow()}
        </Box>
      )
    } else if (working > 0) {
      work = (
        <Box flexDirection="column">
          {nest(agents.filter(isWorking)).map(helperRow)}
          {grayRow()}
        </Box>
      )
    }

    // Everything stacks above the strip: warnings, the work view, then the controls.
    const band = (controls: RenderElement | null) => (
      <Box flexDirection="column">
        {folderRow}
        {nudgeRow}
        {work}
        {controls}
        {strip}
      </Box>
    )

    if (!isControlsShown) return band(null)

    const shownModel = pending?.model ?? model
    const shownEffort = pending?.effort ?? effort
    const whyNoEffort = hasEffort
      ? `${modelLabel(model)} doesn't use an effort setting.`
      : "This version of Claude Code doesn't have /effort."

    let waiting = null
    if (pending) {
      const target = [pending.model ? modelLabel(pending.model) : '', pending.effort ? effortLabel(pending.effort) : '']
        .filter(Boolean)
        .join(' · ')
      waiting = (
        <Text dimColor wrap="truncate-end">
          {e.props.isWorking ? `Switches to ${target} when Claude finishes` : `Switching to ${target}…`}
        </Text>
      )
    }

    // The full panel follows docs\design\target-panel.png: a rounded box, picks on colored blocks, pills on the right.
    const width = Math.min(PANEL_WIDTH, e.props.bodyColumns)
    const inner = Math.max(0, width - PANEL_FRAME)
    const half = Math.floor(inner / 2)
    const nextHelper =
      HELPER_MODES[(HELPER_MODES.findIndex(m => m.key === helperMode) + 1) % HELPER_MODES.length]?.key ?? 'lowest'
    const helperLabel = HELPER_MODES.find(m => m.key === helperMode)?.[isNarrow ? 'short' : 'label'] ?? ''

    const rule = (title: string) => {
      const spaced = title.split('').join(' ')
      return (
        <Text dimColor wrap="truncate-end">
          ── {spaced} {'─'.repeat(Math.max(0, inner - spaced.length - 4))}
        </Text>
      )
    }
    // A model or effort: the one in use sits on a colored block.
    const chip = (key: string, label: string, isPicked: boolean, color: string, onPress: () => void, isDim = false) => (
      <Button key={key} plain dimColor={isDim} onPress={onPress}>
        <Text backgroundColor={isPicked ? color : undefined} color={isPicked ? 'inverseText' : undefined}>
          {` ${label} `}
        </Text>
      </Button>
    )
    // A setting's pill is named for what a press does: Clean View's reads clean-off while it's on.
    const setting = (name: string, about: string, isOn: boolean, key: string, pill: string, onPress: () => void) => (
      <Box justifyContent="space-between" gap={1}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Text color={isOn ? 'success' : 'inactive'}>{isOn ? '●' : '○'} </Text>
            <Text>{name.padEnd(NAME_WIDTH)}</Text>
            <Text dimColor>{about}</Text>
          </Text>
        </Box>
        <Button key={key} plain onPress={onPress}>
          <Text backgroundColor={isOn ? 'success' : 'subtle'} color={isOn ? 'inverseText' : 'text'}>
            {` ${pill} `}
          </Text>
        </Button>
      </Box>
    )
    // Two slots to a row; Clear and Compact share the slot after the last button (null).
    const slots = [...LAUNCHES, null]
    const launchRows = Array.from({ length: Math.ceil(slots.length / 2) }, (_, r) => slots.slice(r * 2, r * 2 + 2))
    const clearLabel = !clearArmed ? 'Clear' : half < NARROW_LAUNCH ? 'Sure?' : 'Sure? Clear'

    return band(
      <Box justifyContent="flex-end">
        <Box flexDirection="column" width={width} borderStyle="round" borderColor="warning" paddingX={1}>
          <Box justifyContent="space-between" gap={1}>
            <Text color="claude" bold wrap="truncate-end">
              ◆ A P   T O O L K I T
            </Text>
            <Box gap={2} flexShrink={0}>
              <Button key="help" label="?" plain onPress={() => openHelp($)} />
              <Button key="minimize" label="▾" plain onPress={() => setControlsOpen($, false)} />
            </Box>
          </Box>
          <Text dimColor>{'─'.repeat(inner)}</Text>
          <Box>
            <Box width={LABEL_WIDTH} flexShrink={0}>
              <Text dimColor>MODEL</Text>
            </Box>
            <Box gap={1}>
              {MODELS.map(m =>
                chip(`model-${m.key}`, isNarrow ? m.short : m.label, m.key === shownModel, 'claude', () =>
                  m.key === shownModel ? undefined : switchModel($, m.key),
                ),
              )}
            </Box>
          </Box>
          <Box>
            <Box width={LABEL_WIDTH} flexShrink={0}>
              <Text dimColor>EFFORT</Text>
            </Box>
            <Box gap={1}>
              {EFFORTS.map(x =>
                chip(
                  `effort-${x.key}`,
                  isNarrow ? x.short : (x.chip ?? x.label),
                  takesEffort && x.key === shownEffort,
                  'permission',
                  () =>
                    !takesEffort ? $.ui.toast(whyNoEffort) : x.key === shownEffort ? undefined : switchEffort($, x.key),
                  !takesEffort,
                ),
              )}
            </Box>
          </Box>
          {project != null && projectColor ? (
            <Box>
              <Box width={LABEL_WIDTH} flexShrink={0}>
                <Text dimColor>COLOR</Text>
              </Box>
              <Box gap={1}>
                {PROJECT_COLORS.map(c => (
                  <Button key={`color-${c.key}`} plain onPress={() => (c.key === project.color ? undefined : setProjectColor($, c.key))}>
                    <Text backgroundColor={c.hex} color="inverseText">
                      {c.key === project.color ? ' ✓ ' : '   '}
                    </Text>
                  </Button>
                ))}
                <Text dimColor>{projectColor.label}</Text>
              </Box>
            </Box>
          ) : null}
          {rule('SETTINGS')}
          {setting('Clean View', 'hides tool output', cleanView, cleanView ? 'clean-off' : 'clean-on', cleanView ? '● On' : '○ Off', () =>
            setCleanView($, !cleanView),
          )}
          {setting('Helper agents', 'model they use', false, `helpers-${nextHelper}`, helperLabel, () =>
            setHelperMode($, nextHelper),
          )}
          {rule('LAUNCH')}
          {launchRows.map(row => (
            <Box>
              {row.map(l =>
                l !== null ? (
                  <Box width={half} flexShrink={0}>
                    <Button key={`launch-${l.key}`} plain onPress={() => launch($, l.key)}>
                      <Text color={l.color}>{l.icon}</Text> {half < NARROW_LAUNCH ? l.short : l.label}
                    </Button>
                  </Box>
                ) : (
                  <Box width={half} flexShrink={0} gap={2}>
                    {FRESH.map(f => (
                      <Button key={`launch-${f.key}`} plain onPress={() => (f.key === 'clear' ? pressClear($) : launch($, f.key))}>
                        <Text color={f.color}>{f.icon}</Text> {f.key === 'clear' ? clearLabel : f.label}
                      </Button>
                    ))}
                  </Box>
                ),
              )}
            </Box>
          ))}
          <Box justifyContent="space-between" gap={1}>
            <Box flexShrink={1}>{waiting}</Box>
            {version !== null ? <Text dimColor>v{version}</Text> : null}
          </Box>
        </Box>
      </Box>,
    )
  })

  // Clean View: tool calls and their output draw nothing; Claude's words, the checklist and the spinner stay.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (KEEP_ROWS.includes(e.props.tool) || !(await read($, cleanViewA))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (KEEP_ROWS.includes(e.props.tool) || !(await read($, cleanViewA))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await read($, cleanViewA))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // Helper agents: Fast & Cheap runs each on Haiku, Same as me on Claude's own model. Forks always inherit. Each
  // helper that starts gets a line in the work view.
  on('agent.spawn', async ($, e, next) => {
    const mode = e.fork ? null : await read($, helperModeA)
    const result = await next(mode === 'fast' ? { ...e, model: 'haiku' } : mode === 'same' ? { ...e, model: e.parentModel } : e)
    if (result.agentId !== undefined) await startHelper($, result.agentId, e.parentAgentId, e.description, result.model)
    return result
  }).catch(($, e, next) => next(e))

  // Lowest that fits: Claude picks each helper's model, told to pick the lowest that fits.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    try {
      if (!e.tools.includes('Agent') || (await read($, helperModeA)) !== 'lowest') return result
      return { sections: [...result.sections, { id: 'ap-toolkit:helpers', text: LOWEST_THAT_FITS, scope: 'session' }] }
    } catch {
      return result
    }
  })

  // Permission prompts and MCP questions get a "Needs you" alert too; the toolkit's own notices are left alone.
  on('classic.Notification', async ($, e, next) => {
    const result = await next(e)
    if (isAlerting && ASKING_NOTICES.includes(e.notification_type)) alertLater($, e.message)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: HELP_PANE }, async ($, e) => {
    const { Markdown } = $.ui.resolve(e)
    return <Markdown text={HELP} />
  })

  on('ui.render', { component: 'Pane', requestId: REPORT_PANE }, async ($, e) => {
    const r = await read($, reportA)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (r == null) return <Text dimColor>Working out the report…</Text>

    const isNarrow = e.props.bodyColumns < 72
    // Shares go by time where the period has it; days backfilled before version 2 have request counts only.
    const byTime = r.ms > 0
    const share = (t: { requests: number; ms: number }) =>
      Math.round(((byTime ? t.ms : t.requests) / Math.max(1, byTime ? r.ms : r.requests)) * 100)
    const worth = Math.round((r.ms / 3_600_000) * rate)
    const headline =
      r.requests === 0
        ? 'Nothing yet for this period.'
        : [
            byTime ? `${duration(r.ms)} of Claude's work` : undefined,
            plural(r.sessions, 'session'),
            plural(r.requests, 'request'),
            byTime ? `≈ $${worth} of work at $${rate}/hr` : undefined,
          ]
            .filter(Boolean)
            .join(' · ')
    const usage = [
      `${short(r.tokensIn)} tokens in`,
      `${short(r.tokensOut)} out`,
      r.tokensCached > 0 ? `${short(r.tokensCached)} re-read from cache` : undefined,
      // Days backfilled before cost estimates have no cost, so a period with one leaves cost out rather than undercount it.
      r.hasCost ? `≈ ${money(r.costUsd)}` : undefined,
      r.fiveHour !== null ? `5h ${r.fiveHour}% now` : undefined,
      r.week !== null ? `week ${r.week}%` : undefined,
    ]
      .filter(Boolean)
      .join(' · ')
    const own = r.ownCalls === 0 ? 'none' : `${plural(r.ownCalls, 'Haiku call')} · ${short(r.ownTokens)} tokens`

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection={isNarrow ? 'column' : 'row'} justifyContent="space-between">
          <Text bold color="claude">
            Today's report · {r.title}
          </Text>
          <Box gap={1}>
            {REPORT_TABS.map(t => (
              <Button
                key={`tab-${t.key}`}
                label={t.label}
                variant={t.key === r.tab ? 'primary' : 'secondary'}
                onPress={() => showReport($, t.key)}
              />
            ))}
          </Box>
        </Box>
        <Text>{headline}</Text>
        {r.types.length > 0 ? (
          <Box flexDirection="column">
            {r.types.map(t => (
              <Text wrap="truncate-end">
                <Text>{t.label.padEnd(22)}</Text>
                <Text color="claude">{bar(share(t), isNarrow ? 8 : 16)}</Text>
                <Text> {String(share(t)).padStart(3)}%</Text>
                <Text dimColor>
                  {'  '}
                  {[t.ms > 0 ? duration(t.ms) : undefined, plural(t.requests, 'request')].filter(Boolean).join(' · ')}
                </Text>
              </Text>
            ))}
          </Box>
        ) : null}
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text dimColor>Usage </Text>
            {usage}
          </Text>
          <Text wrap="truncate-end">
            <Text dimColor>Toolkit's own use </Text>
            {own}
          </Text>
        </Box>
        {r.check !== null ? <Text dimColor>{checkText(r.check)}</Text> : null}
        {r.waitMs > 0 ? (
          <Text dimColor>Time Claude waited on your answers is left out: {duration(r.waitMs)}.</Text>
        ) : null}
        {r.hasBackfill && r.liveSince !== null ? (
          <Text dimColor>
            Work before {easternWhen(r.liveSince)} comes from past session files
            {r.hasCost ? '; its cost is estimated from tokens and model prices.' : ', which carry no cost.'}
          </Text>
        ) : null}
      </Box>
    )
  })
}
