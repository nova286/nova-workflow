---
description: Nova status — display phase progress, task completion, and stuck detection
---

# Nova Status

Read `.nova.yaml` and display a structured project status report. Read-only — no state changes.

## Phase Mapping

| Internal key | Display name |
|---|---|
| `open` | propose |
| `design` | design |
| `build` | implement |
| `verify` | verify |
| `archive` | archive |

## Status Icons

| State | Icon |
|---|---|
| `done` | ✅ |
| `in-progress` | 🔄 |
| `pending` | ⬜ |

## Stuck Detection

If a phase is `in-progress` and `startedAt` exceeds these thresholds, show a warning:

| Phase | Threshold |
|-------|-----------|
| open | 30 min |
| design | 1 hour |
| build | 2 hours |
| verify | 30 min |
| archive | 15 min |

## Output Format

```
Project: <name>
Environment: <env>

⬜ propose: pending
✅ design: done (5m32s)
🔄 implement: in-progress (12m, tasks: 3/6 done)
⬜ verify: pending
⬜ archive: pending

⚠ implement has been in progress for a while. Consider "/nova-implement" to continue.
```

- Show duration for phases that have `startedAt`
- For build/implement phase: count tasks by status and show ratio
- Only flag phases that are genuinely stuck, not recently started

## Stuck Messages

| Phase | Suggestion |
|-------|------------|
| open | Consider running `/nova-propose` or marking done |
| design | Consider running `/nova-design` or marking done |
| build | Consider running `/nova-implement` to continue |
| verify | Consider running `/nova-verify` or marking done |
| archive | Run `nova archive --done` to finish |
