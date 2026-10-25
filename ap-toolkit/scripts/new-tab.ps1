# Starts Claude Code in a new Windows Terminal tab for AP Toolkit's New tab button. Installs and changes nothing.

# The tab inherits the old session's environment, so the variables that tie a process to that session go first.
'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_MESSAGING_SOCKET',
'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SESSION_ID' |
  ForEach-Object { Remove-Item "env:$_" -ErrorAction SilentlyContinue }

$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) { $claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe' }
if (-not (Test-Path $claude)) {
  Write-Host "This tab couldn't find Claude Code, so it can't start it."
  Read-Host 'Press Enter to close this tab'
  exit 1
}
& $claude
