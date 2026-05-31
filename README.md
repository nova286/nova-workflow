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
what your AI can do. It sequences specification, planning, implementation, and
review through a structured workflow — think of it as a state machine that sits
between you and your AI tools, ensuring nothing gets skipped and everything gets
recorded.

### The Core Insight

AI coding tools are powerful but undisciplined. Developers jump straight to
implementation, lose the original requirement, and review too late. Nova fixes
this not by **restricting** your AI skills, but by **orchestrating** three roles:
OpenSpec-compatible specs define the contract, Superpowers-compatible methods
drive planning and TDD, and ECC (Everything Claude Code) compatible review judges quality.

| Old Way (V1) | New Way (V2) |
|---|---|
| "You are forbidden to write code" (HTML comment) | "This task must satisfy these spec refs and acceptance refs" |
| Proposal/design docs as loose markdown | OpenSpec-compatible change artifacts as the requirement contract |
| TDD/review as optional vibes | Superpowers/ECC (Everything Claude Code) compatible gates recorded as evidence |
| Remember slash commands for each phase | Just say "continue" — or type `/nova` |

### How It Feels to Use

```
You: "帮我设计一下用户登录模块"
Nova: → Creates an OpenSpec-compatible change → explores requirements
      → records spec refs and acceptance criteria → "Change specified."

You: "继续实现"
Nova: → Reads the next task's spec refs → runs the Superpowers-compatible method
      → records tests, changed files, traceId, and evidence → "4/6 done."

You: "审查一下代码"
Nova: → ECC (Everything Claude Code) compatible code review + security review + spec conformance review
      → Report with file:line references and pass/fix verdicts
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

## Methodology Integrations

Nova does **not** require OpenSpec, Superpowers, or ECC (Everything Claude Code) to be installed. It does
require their workflow model: specification contract, disciplined execution, and
independent review. Each integration can run in one of three modes:

| Mode | Meaning |
|------|---------|
| `native` | The real tool or skill pack is available and Nova should use it |
| `compatible` | Nova writes compatible artifacts and uses built-in prompts/checklists |
| `disabled` | The user explicitly opted out |

Default `nova init` starts in compatible mode:

```yaml
integrations:
  openspec: { mode: compatible }
  superpowers: { mode: compatible }
  ecc: { mode: compatible }
```

If native integrations are present, Nova can use them for a stronger experience.
The product promise stays the same: open the box and it works; add the three
methodologies and it gets sharper.

---

## The Five Phases

```
propose ──→ design ──→ implement ──→ verify ──→ archive
   │            │           │           │           │
   │            │           │           │           │
   │            │           │           │           └─ archive OpenSpec-compatible change
   │            │           │           └─ ECC (Everything Claude Code) compatible code/security/spec review
   │            │           └─ spec-bound execution with tests and evidence
   │            └─ Superpowers-compatible planning from the spec contract
   └─ OpenSpec-compatible change proposal and spec delta
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
| `/nova-propose` | Specify an OpenSpec-compatible change contract |
| `/nova-design` | Build a Superpowers-compatible plan and task graph from the spec |
| `/nova-implement` | Execute spec-bound tasks with method, tests, and evidence |
| `/nova-verify` | Run ECC (Everything Claude Code) compatible code, security, and spec-conformance review |
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

Nova does not replace the methodologies. It coordinates them. OpenSpec-compatible
artifacts own "what must be true", Superpowers-compatible plans own "how to work",
and ECC (Everything Claude Code) compatible reviews own "whether this is acceptable".

**Methodologies are semantic dependencies, not install-time dependencies.** Nova
works in compatible mode without external tools. Native OpenSpec, Superpowers,
and ECC (Everything Claude Code) installations make the same workflow more capable.

### 2. Structured Handoff, Not Natural Language

The handoff between design and implementation is the moment where most AI workflows
break down. Nova solves this with `TaskContext` — a structured JSON contract:

```json
{
  "taskId": "build-login",
  "title": "Implement login endpoint",
  "taskType": "implementation",
  "change": {
    "activeChange": "add-login",
    "artifacts": {
      "openspecChange": ".openspec/changes/add-login",
      "implementationPlan": "docs/superpowers/plans/add-login.md"
    }
  },
  "implementation": {
    "method": "tdd",
    "specRefs": ["auth.requirements.valid-credential-login"],
    "acceptanceRefs": ["auth.acceptance.valid-login-returns-token"]
  },
  "input": {
    "files": [{ "path": "src/login.ts", "action": "create" }],
    "environment": { "language": "TypeScript", "framework": "Express.js" }
  },
  "verification": {
    "commands": ["npm test -- login", "npx tsc --noEmit"]
  },
  "acceptanceCriteria": ["Returns JWT on success"],
  "guardConditions": { "requireReview": true, "requireTests": true }
}
```

No ambiguity. No "I think the designer meant...". The implement phase knows exactly
which spec contract it is satisfying, which files to touch, how to prove it, and
what "done" looks like.

### 3. State Machine, Not Wishful Thinking

```
propose ──[change specified]──→ design ──[plan ready]──→ implement
implement ──[evidence recorded]──→ verify ──[reviews passed]──→ archive
implement ←──[iterate]── design    verify ←──[iterate]── implement
```

Forward transitions are **gated** — the guard system enforces preconditions.
Reverse transitions are **always allowed** — because iteration is real development.

### 4. Every Invocation, Tracked

Every AI call generates a `traceId`. Every task records its status, output
artifacts, and completion time. The `.nova.yaml` state file is the single source
of truth — atomic writes, mutex-guarded, crash-safe.

### 5. Convention, Not Coercion

Role separation comes from **artifact ownership**, not from fake security
boundaries. Specs own requirements, plans own execution, reviews own judgment.
No HTML comments pretending to be access control. No skill neutering. Just clear
goals and a state machine that keeps you honest.

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

Runtime state and artifact references live in `.nova.yaml`. Detailed
requirements, plans, and reports live in the referenced files:

```yaml
version: 1
project: my-app
environment: [claude-code]
activeChange: add-login
integrations:
  openspec: { mode: compatible }
  superpowers: { mode: compatible }
  ecc: { mode: compatible }
artifacts:
  openspecChange: .openspec/changes/add-login
  proposal: .openspec/changes/add-login/proposal.md
  specDelta: .openspec/changes/add-login/specs/auth/spec.md
  implementationPlan: docs/superpowers/plans/add-login.md
  verificationReport: docs/reports/add-login-verification.md
phases:
  propose: { status: done, proposal: docs/proposals/proposal.md }
  design:  { status: done, designDoc: docs/designs/design.md, tasks: [...] }
  implement:
    status: in-progress
    tasks:
      implement-login:
        status: done
        specRefs: [auth.requirements.valid-credential-login]
        acceptanceRefs: [auth.acceptance.valid-login-returns-token]
        evidence:
          tests: [npm test -- login]
          filesChanged: [src/auth/login.ts]
          traceIds: [nova-xxx]
  verify:  { status: pending }
  archive: { status: pending }
metadata:
  stateVersion: 12
  lastModified: "2026-05-28T12:00:00.000Z"
  history:
    - { version: 8, change: "Task login-impl completed" }
    - { version: 10, change: "Iterated implement→design: component split needs rethinking" }
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
✓ init-manager      — fresh init / force re-init / dir creation / ECC (Everything Claude Code) install / templates
```

---

## License

MIT
