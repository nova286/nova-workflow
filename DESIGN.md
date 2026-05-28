# Nova Design Document

## 1. Design Goals
Nova is an orchestration framework that integrates **Everything Claude Code (ECC)**, **OpenSpec**, and **Superpowers** into a reliable, traceable AI-assisted software development workflow.

Core principles:
- **Reliable process** – State machine and guard mechanisms enforce strict phase transitions.
- **Separation of concerns** – Each phase has a clear goal and output; phase structure creates natural role boundaries without artificial restrictions.
- **Transactional state management** – Atomic `.nova.yaml` state file with mutex-guarded writes and rollback support.
- **Observability** – Every agent invocation generates a trace ID for full auditability.
- **Skill orchestration** – Nova sequences real AI skills; it does not replace or neuter them.

## 2. Key Design Decisions

### 2.1 Skill-Based Execution (V2 Architecture)

AI-powered phases run as **Claude Code slash commands** (`/nova-propose`, `/nova-design`, `/nova-implement`, `/nova-verify`) inside the current session. The original V1 approach spawned `claude --print` as a subprocess, causing 300-500s cold starts from session initialization and extended thinking overhead. Skills eliminate these entirely:

- **Zero startup cost** — no subprocess spawn, no session init
- **Shared context** — session CLAUDE.md, existing file reads, project state all instantly available
- **No thinking triggers** — instructions live in the skill definition (system prompt level), not in a 4000-char user message
- **Real-time visibility** — output streams directly in the session

Skills follow a uniform 4-step pattern: **verify state → gather context → generate output → update state**.

The CLI layer remains as fallback for non-Claude-Code environments, and for pure operational commands (`init`, `status`, `archive`).

### 2.2 Five-Phase Workflow
We keep the *Proposal → Design → Build → Verify → Archive* flow but redefine execution roles:

1. **Proposal (Open)** – `/nova-propose` skill; outputs `proposal.md`.
2. **Design** – `/nova-design` skill; produces `design.md` and YAML task list.
3. **Build** – `/nova-implement` skill; for each task, ECC Coder implements with retry & tracing.
4. **Verify** – `/nova-verify` skill; assembles a multi-agent verification pipeline (code review + security review).
5. **Archive** – CLI command `nova archive`; merges delta specs and cleans up.

### 2.3 Role Separation by Convention

Nova separates concerns through phase structure and clear goals:

- **Propose phase** — Goal: produce `proposal.md`. Skills focus on requirements analysis.
- **Design phase** — Goal: produce `design.md` + YAML task list. Skills focus on architecture exploration and task breakdown.
- **Implement phase** — Goal: execute the task list. Skills focus on writing code and tests.
- **Verify phase** — Goal: review and validate. Skills focus on code review and security scanning.

Each phase's goal is defined clearly in its skill file. The phase guard system ensures
you can't skip steps. Role separation emerges from the workflow structure itself.

### 2.4 Environment
Nova is built for Claude Code. AI-powered phases run as Claude Code slash commands
(`/nova-propose`, `/nova-design`, etc.) with zero startup cost and shared session context.
The `ClaudeCodeAdapter` generates command files under `.claude/commands/`.

### 2.5 Task Handoff Mechanism
The handoff is the heart of the design. Superpowers converts task requirements into a standardized `TaskContext` JSON (compliant with a predefined schema). The Dispatcher then invokes the appropriate ECC agent using this context. This structured handoff eliminates natural-language ambiguity and enables input validation and output schema verification.

### 2.6 State Management
A single YAML state file `.nova.yaml` stores project metadata, environment configuration, phase status, task execution traces, etc. The StateManager provides atomic updates (write-to-temp + rename) and uses an in-process mutex for concurrency safety. Backup and rollback are supported.

## 3. Key Interaction Flows

### 3.1 Initialization Flow
1. User runs `nova init`.
2. Confirm Claude Code environment.
3. Create directory structure, generate `.nova.yaml`.
4. Install ECC skills (if `--with-ecc` provided).
5. Generate Claude Code command files (`.claude/commands/nova-*.md`).
6. Generate document templates (`docs/`).

### 3.2 Build Phase Execution
1. Guard checks preconditions (design phase complete).
2. Load task list; iterate over tasks.
3. `ContextGenerator` parses design docs and task lists, generates standard `TaskContext` JSON.
4. `Dispatcher` selects the ECC agent (e.g., `coder`) based on task type, invokes with context.
5. Collect execution results, update state file (task status, traceId).
6. After all tasks, set phase status to `done`.

### 3.3 Verification Pipeline
1. Guard checks build completion; if ECC code review is pending, trigger it automatically.
2. `PipelineOrchestrator` defines the verification pipeline: may include parallel stages (e.g., code review + security review).
3. Aggregate results, generate verification report, update state.

## 4. Error Handling & Rollback
- If any initialization step fails, rollback functions of previous steps are executed in reverse order, and backup is restored.
- State updates use atomic rename to prevent partial writes on crash.
- Agent calls support timeout, retry (with exponential backoff), and fallback strategies.

## 5. Testing Strategy
- **Unit tests** – StateManager, Dispatcher, ContextGenerator, etc.
- **Integration tests** – Full phase transition simulation.
- **CLI tests** – Using mocked AI clients to verify command output and state changes.

## 6. V2 Changelog (May 2026)

- **[x] Skill-Based Execution** — AI phases run as Claude Code slash commands with zero startup cost.
- **[x] Skill Orchestration** — Nova skills call real skills (brainstorming, writing-plans, TDD, code-review, security-review) instead of generating from thin templates.
- **[x] Iteration Support** — `/nova-iterate` for phase rollback. Guard rules for reverse transitions.
- **[x] Neutering Removed** — HTML comment injection replaced by goal-based phase separation.
- **[x] CLI Simplified** — AI-phase CLI commands removed; CLI handles only init, status, archive, context, guard.
- **[x] Multi-Language Support** — Context generator maps all 11 project types from project-detect.
- **[x] Init-Manager Tests** — 9 new tests covering fresh init, force re-init, rollback, and template generation.
- **[ ] Git Worktree Isolation** — Future: isolate AI changes in a dedicated worktree during implement phase.
- **[ ] Concurrent Task Execution** — Future: parallel task dispatch for independent tasks.
