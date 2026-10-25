# AP Toolkit

AP Toolkit is a mod for Claude Code on Windows. It adds:

- A two-line strip above the prompt with this session's tokens, cost at API prices, context, and your 5-hour and weekly limits.
- A live view while Claude works: its steps, a finish estimate, what it's doing now, its shell commands, and its helper agents.
- A controls box (press **▴** on the strip) for model, effort, Clean View, helper agent models, and launch buttons.
- Today's report, with time, tokens, and cost by type of work for today, this week, this month, this year, and all time.
- A color for each project folder, shown in the strip and on tabs that **New tab** opens.
- "Needs you" Windows alerts when Claude asks you something or finishes a long request.

Press **?** in the controls box for in-app Help.

## What you need

- Windows 10 or 11, with Windows Terminal and Git for Windows
- Claude Code 2.1.310 or later

## Install

In Claude Code, run these two commands, then restart Claude Code:

```
/plugin marketplace add adamperr/ap-toolkit
/plugin install ap-toolkit@ap-toolkit
```

## Your data stays on your PC

Today's report reads Claude Code's own session files on your PC. The toolkit makes no network calls and sends nothing anywhere.

**New tab**, the alerts, and the report's first fill run small PowerShell scripts from the `scripts` folder. If your PC's security policy blocks them, everything else still works.
