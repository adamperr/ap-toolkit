# Backfill for Today's report: one line per request in past session files.
# Output: <timestamp>`t<session id>`t<tool,tool,...>`t<ms>`t<new tokens in>`t<tokens re-read from cache>`t<tokens out>
#   `t<model>`t<uncached tokens in>`t<5-minute cache writes>`t<1-hour cache writes>`t<ms waiting on answers>.
# Then one line per helper agent, from its own file under <session id>\subagents: helper`t<timestamp>`t<session id>
#   `t<new tokens in>`t<tokens re-read from cache>`t<tokens out>`t<model>`t<uncached tokens in>`t<5-minute cache writes>
#   `t<1-hour cache writes>. A helper's time falls inside the request that started it, so only its tokens count.
# Reads timestamps, session ids, tool names, model names, and token counts only.
# Run by the toolkit; it never writes anything.
param(
  [Parameter(Mandatory = $true)][string]$Projects,
  [Parameter(Mandatory = $true)][string]$Since,
  # For the estimate check: only these sessions, as comma-separated ids. Empty reads every session.
  [string]$Sessions = ''
)

$sinceUtc = [datetime]::Parse($Since, [Globalization.CultureInfo]::InvariantCulture).ToUniversalTime()
$only = @{}
foreach ($id in $Sessions.Split(',')) { if ($id.Trim()) { $only[$id.Trim()] = $true } }
$toolRx = [regex]'"type":"tool_use","id":"[^"]*","name":"([^"]+)"'
$tsRx = [regex]'"timestamp":"([^"]+)"'
$msgRx = [regex]'"id":"(msg_[^"]+)"'
$inRx = [regex]'"input_tokens":(\d+)'
$madeRx = [regex]'"cache_creation_input_tokens":(\d+)'
$readRx = [regex]'"cache_read_input_tokens":(\d+)'
$outRx = [regex]'"output_tokens":(\d+)'
$hourRx = [regex]'"ephemeral_1h_input_tokens":(\d+)'
$modelRx = [regex]'"message":\{[^{}]*?"model":"([^"]+)"'
# Questions and plans wait on the person's answer; that wait isn't Claude's work.
$askRx = [regex]'"type":"tool_use","id":"([^"]*)","name":"(?:AskUserQuestion|ExitPlanMode)"'
$answerTsRx = [regex]'"uuid":"[^"]+","timestamp":"([^"]+)"'
$out = New-Object System.Text.StringBuilder
# Reply ids seen in main session files, so a helper file that repeats one doesn't count it twice.
$mainIds = @{}
$helperFiles = New-Object System.Collections.Generic.List[object]

function Get-Count($rx, $text) {
  $m = $rx.Match($text)
  if ($m.Success) { [long]$m.Groups[1].Value } else { 0 }
}

# A reply's id, model, and tokens: new in, re-read from cache, out, uncached in, 5-minute and 1-hour cache writes.
# Null for a line that carries no usage.
function Read-Reply($line) {
  $id = $msgRx.Match($line)
  $at = $line.IndexOf('"usage":{')
  if (-not $id.Success -or $at -lt 0) { return $null }
  $name = $modelRx.Match($line)
  # Error and placeholder replies name a "<synthetic>" model and carry no tokens.
  $model = if ($name.Success -and -not $name.Groups[1].Value.StartsWith('<')) { $name.Groups[1].Value } else { '' }
  $u = $line.Substring($at)
  $made = Get-Count $madeRx $u
  $hour = [Math]::Min([long]$made, [long](Get-Count $hourRx $u))
  @{
    Id = $id.Groups[1].Value
    Model = $model
    Counts = @(((Get-Count $inRx $u) + $made), (Get-Count $readRx $u), (Get-Count $outRx $u), (Get-Count $inRx $u),
      ($made - $hour), $hour)
  }
}

# One helper agent's tokens, dated by its first reply. Like a request's, each reply id counts once.
function Write-Helper($path, $session) {
  $replies = @{}
  $first = $null
  $model = ''
  foreach ($line in [System.IO.File]::ReadLines($path)) {
    if (-not $line.Contains('"type":"assistant"') -or -not $line.Contains('"isSidechain":true')) { continue }
    $r = Read-Reply $line
    if (-not $r -or $mainIds.ContainsKey($r.Id)) { continue }
    if (-not $first) {
      $all = $tsRx.Matches($line)
      if ($all.Count -gt 0) { $first = $all[$all.Count - 1].Groups[1].Value }
    }
    if ($r.Model) { $model = $r.Model }
    $replies[$r.Id] = $r.Counts
  }
  if (-not $first) { return }
  $in = 0; $cached = 0; $sent = 0; $uncached = 0; $minute = 0; $hour = 0
  foreach ($u in $replies.Values) {
    $in += $u[0]; $cached += $u[1]; $sent += $u[2]; $uncached += $u[3]; $minute += $u[4]; $hour += $u[5]
  }
  [void]$script:out.AppendLine("helper`t$first`t$session`t$in`t$cached`t$sent`t$model`t$uncached`t$minute`t$hour")
}

# One request: how long Claude worked on it (its prompt to its last reply), and its tokens.
# A reply is written as several lines that repeat its usage, so each reply id counts once.
function Write-Request {
  if (-not $script:ts) { return }
  $ms = 0
  if ($script:last) {
    $ms = [long]([DateTimeOffset]::Parse($script:last) - [DateTimeOffset]::Parse($script:ts)).TotalMilliseconds
    if ($ms -lt 0) { $ms = 0 }
  }
  $in = 0; $cached = 0; $sent = 0; $uncached = 0; $minute = 0; $hour = 0
  foreach ($u in $script:usage.Values) {
    $in += $u[0]; $cached += $u[1]; $sent += $u[2]; $uncached += $u[3]; $minute += $u[4]; $hour += $u[5]
  }
  [void]$script:out.AppendLine(("$($script:ts)`t$($script:session)`t$($script:tools -join ',')`t$ms`t$in`t$cached`t$sent" +
    "`t$($script:model)`t$uncached`t$minute`t$hour`t$($script:waited)"))
}

foreach ($dir in Get-ChildItem -LiteralPath $Projects -Directory) {
  foreach ($file in Get-ChildItem -LiteralPath $dir.FullName -File -Filter *.jsonl) {
    if ($file.LastWriteTimeUtc -lt $sinceUtc) { continue }
    $session = $file.BaseName
    if ($only.Count -gt 0 -and -not $only.ContainsKey($session)) { continue }
    $ts = $null
    $last = $null
    $tools = New-Object System.Collections.Generic.List[string]
    $usage = @{}
    $model = ''
    $asked = @{}
    $waited = 0
    foreach ($line in [System.IO.File]::ReadLines($file.FullName)) {
      if ($line.Contains('"isSidechain":true')) { continue }
      $isPrompt = $line.Contains('"type":"user"') -and
        -not $line.Contains('"tool_result"') -and
        -not $line.Contains('"isMeta":true') -and
        -not $line.Contains('"isCompactSummary":true') -and
        -not $line.Contains('"content":"<') -and
        ($line.Contains('"content":"') -or $line.Contains('"type":"text"'))
      if ($isPrompt) {
        Write-Request
        $m = $tsRx.Match($line)
        $ts = if ($m.Success) { $m.Groups[1].Value } else { $null }
        $last = $null
        $tools.Clear()
        $usage = @{}
        $model = ''
        $asked = @{}
        $waited = 0
      } elseif ($ts -and $line.Contains('"type":"assistant"')) {
        foreach ($m in $toolRx.Matches($line)) { $tools.Add($m.Groups[1].Value) }
        # The line's own timestamp comes after the reply it carries, so the last match is the right one.
        $all = $tsRx.Matches($line)
        if ($all.Count -gt 0) { $last = $all[$all.Count - 1].Groups[1].Value }
        if ($last) { foreach ($m in $askRx.Matches($line)) { $asked[$m.Groups[1].Value] = $last } }
        $r = Read-Reply $line
        if ($r) {
          if ($r.Model) { $model = $r.Model }
          $usage[$r.Id] = $r.Counts
          $mainIds[$r.Id] = $true
        }
      } elseif ($ts -and $asked.Count -gt 0 -and $line.Contains('"tool_result"')) {
        foreach ($key in @($asked.Keys)) {
          if (-not $line.Contains("`"tool_use_id`":`"$key`"")) { continue }
          $m = $answerTsRx.Match($line)
          if ($m.Success) {
            $wait = [long]([DateTimeOffset]::Parse($m.Groups[1].Value) - [DateTimeOffset]::Parse($asked[$key])).TotalMilliseconds
            if ($wait -gt 0) { $waited += $wait }
          }
          $asked.Remove($key)
        }
      }
    }
    Write-Request
    $helpers = Join-Path $dir.FullName "$session\subagents"
    if (Test-Path -LiteralPath $helpers) {
      foreach ($agent in Get-ChildItem -LiteralPath $helpers -File -Filter *.jsonl) {
        if ($agent.LastWriteTimeUtc -ge $sinceUtc) { $helperFiles.Add(@($agent.FullName, $session)) }
      }
    }
  }
}

# Helpers go last, once every main reply id is known.
foreach ($h in $helperFiles) { Write-Helper $h[0] $h[1] }

[Console]::Out.Write($out.ToString())
