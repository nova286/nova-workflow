# Nova

<p align="center">
  <strong>THE AI Workflow is All You Need</strong>
</p>

<p align="center">
  A thin orchestration shell for AI-assisted software development.<br/>
  <strong>Don't neuter your skills. Orchestrate them.</strong>
</p>

---

## What is Nova?

Nova adds **process discipline** to AI-assisted development without restricting
what your AI can do. It sequences your existing skills through a structured
5-phase workflow — think of it as a state machine that sits between you and
your AI tools, ensuring nothing gets skipped and everything gets recorded.

### The Core Insight

AI coding tools are powerful but undisciplined. Developers jump straight to
implementation, skip design, forget to review. Nova fixes this not by
**restricting** your AI skills (the old way), but by **orchestrating** them:

| Old Way (V1) | New Way (V2) |
|---|---|
| "You are forbidden to write code" (HTML comment) | "Your goal in this phase is to produce a design doc" |
| Replace real skills with thin 25-line templates | Call real skills (brainstorming, writing-plans, TDD...) in sequence |
| 5 stub platform adapters nobody uses | 1 adapter for Claude Code — the one you actually use |
| Remember slash commands for each phase | Just say "start designing" — or type `/nova` |

### How It Feels to Use

```
You: "帮我设计一下用户登录模块"
Nova: → Reads .nova.yaml, checks guards → Calls brainstorming → Calls writing-plans
      → Generates design.md + 6 tasks → Updates state → "Design complete."

You: "继续实现"
Nova: → Routes each task by type → implementation tasks run TDD → tests pass after each
      → Records traceId per task → "4/6 done. Continue?"

You: "审查一下代码"
Nova: → Parallel pipeline: code-review + security-review → Report with file:line references
```

**No slash commands needed.** Nova understands phase context from `.nova.yaml` and
invokes the right skills automatically. If you prefer explicit control, `/nova`
gives you a one-glance overview and suggested next action.

---

## Installation

```bash
npm install -g @nova286/nova-workflow
```

## Quick Start

```bash
nova init          # Initialize Nova in your project
```

Then, inside Claude Code:

```
/nova              # See where you are and what's next

# Or just talk naturally — Nova detects the phase and acts accordingly:
"帮我做一个用户认证功能"
"继续实现"
"审查代码"
"回退到设计阶段，组件拆分需要调整"
```

---

## The Five Phases

```
propose ──→ design ──→ implement ──→ verify ──→ archive
   │            │           │           │           │
   │    brainstorming    TDD skill    ECC review    CLI
   │   writing-plans   direct impl   pipeline     command
   │
   └── /nova-iterate ←── can roll back from any phase
```

Each phase has a **clear goal** and a **structured output**. Phase guards prevent
skipping: you can't implement without a design. You can't verify without a build.
And you can always iterate back — real development is not a waterfall.

---

## Commands

### Skill Commands (inside Claude Code)

| Command | What it does |
|---------|-------------|
| `/nova` | **One entry point.** Shows progress, suggests next action. |
| `/nova-propose` | Explore requirements via brainstorming → proposal.md |
| `/nova-design` | Explore architecture via brainstorming + writing-plans → design.md + YAML tasks |
| `/nova-implement` | Execute tasks with type routing (implementation / TDD / testing) |
| `/nova-verify` | Parallel pipeline: code review + security review via ECC skills |
| `/nova-iterate` | Roll back to a previous phase for iteration |

### CLI Commands (in terminal)

| Command | What it does |
|---------|-------------|
| `nova init` | Initialize Nova: creates `.nova.yaml`, installs skill files |
| `nova status` | Display phase progress and task completion |
| `nova archive` | Clean up and finalize |
| `nova context --task-id <id>` | Print structured TaskContext JSON for a task |
| `nova guard <from> <to>` | Validate a phase transition |

---

## Design Philosophy

### 1. Orchestrate, Don't Replace

Nova does not write a single line of content. It does not come with its own prompt
templates. It sequences **your** skills — Superpowers for methodology, ECC for
quality — through a disciplined workflow. Each skill runs at full capability.

### 2. Structured Handoff, Not Natural Language

The handoff between design and implementation is the moment where most AI workflows
break down. Nova solves this with `TaskContext` — a structured JSON contract:

```json
{
  "taskId": "build-login",
  "title": "Implement login endpoint",
  "taskType": "implementation",
  "input": {
    "files": [{ "path": "src/login.ts", "action": "create" }],
    "environment": { "language": "TypeScript", "framework": "Express.js" }
  },
  "acceptanceCriteria": ["Returns JWT on success"],
  "guardConditions": { "requireReview": true, "requireTests": true }
}
```

No ambiguity. No "I think the designer meant...". The implement phase knows exactly
what to build, which files to touch, and what "done" looks like.

### 3. State Machine, Not Wishful Thinking

```
open ──[proposal done]──→ design ──[tasks ready]──→ build
build ──[all tasks done]──→ verify ──[review passed]──→ archive
build ←──[iterate]── design    verify ←──[iterate]── build
```

Forward transitions are **gated** — the guard system enforces preconditions.
Reverse transitions are **always allowed** — because iteration is real development.

### 4. Every Invocation, Tracked

Every AI call generates a `traceId`. Every task records its status, output
artifacts, and completion time. The `.nova.yaml` state file is the single source
of truth — atomic writes, mutex-guarded, crash-safe.

### 5. Convention, Not Coercion

Role separation comes from **phase structure**, not from fake security boundaries.
The design phase says "your goal is a design doc" — that's enough. No HTML comments
pretending to be access control. No skill neutering. Just clear goals and a state
machine that keeps you honest.

---

## Architecture

```
src/
├── cli/                        # Terminal commands (5 commands)
│   ├── index.ts                # init, status, archive, context, guard
│   ├── ui.ts                   # Spinners, colors
│   └── error-handler.ts        # Unified error boundary
├── cli-core/                   # Business logic
│   ├── types.ts                # Core interfaces (TaskContext, NovaState, etc.)
│   ├── state.ts                # Atomic .nova.yaml state manager (mutex + temp/rename)
│   ├── guard.ts                # Phase transition rule engine (forward + rollback)
│   ├── dispatcher.ts           # Single-agent execution with retry & traceId
│   ├── context-generator.ts    # Task → TaskContext JSON mapper (11 languages)
│   ├── pipeline.ts             # Multi-stage parallel orchestrator
│   ├── platform-client.ts      # Claude Code client
│   ├── init-manager.ts         # Init flow with transactional rollback
│   ├── project-detect.ts       # Auto-detect project type
│   └── adapters/               # Claude Code command generator
└── templates/                  # Document templates (proposal.md, design.md)
```

---

## State File

Everything Nova knows lives in `.nova.yaml`:

```yaml
version: 2
project: my-app
environment: [claude-code]
phases:
  open:    { status: done, proposal: docs/proposals/proposal.md }
  design:  { status: done, designDoc: docs/designs/design.md, tasks: [...] }
  build:   { status: in-progress, tasks: { task-1: { status: done, traceId: nova-xxx } } }
  verify:  { status: pending }
  archive: { status: pending }
metadata:
  stateVersion: 12
  lastModified: "2026-05-28T12:00:00.000Z"
  history:
    - { version: 8, change: "Task login-impl completed" }
    - { version: 10, change: "Iterated build→design: component split needs rethinking" }
```

---

## Testing

```
Test Suites: 7 passed
Tests:       41 passed

✓ state-manager     — load / atomic update / getTask / phase duration
✓ guard             — 4 forward + 4 rollback transitions
✓ dispatcher        — success / retry / max retries
✓ context-generator — task → TaskContext mapping / 11 languages
✓ pipeline          — success / fail / dependsOn / continue
✓ project-detect    — 11 project type detection
✓ init-manager      — fresh init / force re-init / dir creation / ECC install / templates
```

---

## License

MIT
