# Starts Claude Code in a new Windows Terminal tab for AP Toolkit's New tab button. Installs and changes nothing.

# The tab inherits the old session's environment, so the variables that tie a process to that session go first.
'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_MESSAGING_SOCKET',
'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SESSION_ID' |
  ForEach-Object { Remove-Item "env:$_" -ErrorAction SilentlyContinue }

# The tab is named for the project, as the strip's name tag is: the nearest folder up from here with its own CLAUDE.md
# (the home folder's doesn't count), else this folder. Claude Code then leaves the tab's name alone.
$here = Get-Item -LiteralPath (Get-Location).ProviderPath -ErrorAction SilentlyContinue
if ($here) {
  $name = $here.Name
  $homeDir = $env:USERPROFILE.TrimEnd('\')
  for ($d = $here; $d; $d = $d.Parent) {
    if ($d.FullName.TrimEnd('\') -ieq $homeDir) { continue }
    if ((Test-Path -LiteralPath (Join-Path $d.FullName 'CLAUDE.md')) -or (Test-Path -LiteralPath (Join-Path $d.FullName '.claude\CLAUDE.md'))) {
      $name = $d.Name
      break
    }
  }
  $Host.UI.RawUI.WindowTitle = $name
  $env:CLAUDE_CODE_DISABLE_TERMINAL_TITLE = '1'
}

$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) { $claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe' }
if (-not (Test-Path $claude)) {
  Write-Host "This tab couldn't find Claude Code, so it can't start it."
  Read-Host 'Press Enter to close this tab'
  exit 1
}
& $claude
