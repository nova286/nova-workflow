# Nova Architecture Document

## 1. Overall Architecture
Nova follows a layered architecture: CLI Layer, Core Business Layer (cli-core), Adapter Layer, and Infrastructure Layer.

```
┌──────────────────────────────────────────────────┐
│                CLI Layer (src/cli)                │
│  init | open | design | build | verify | archive  │
│  context | guard | status                         │
└────────────────────┬─────────────────────────────┘
                     │ calls
┌────────────────────▼─────────────────────────────┐
│           Core Business Layer (src/cli-core)       │
│  InitManager  │ Dispatcher │ PipelineOrch │ Guard  │
│  StateManager │ ContextGenerator                   │
└────────────────────┬─────────────────────────────┘
                     │ depends on
┌────────────────────▼─────────────────────────────┐
│          Adapter Layer (src/cli-core/adapters)     │
│  ClaudeCode │ Codex │ Openclaw │ Hermes │ Generic │
└────────────────────┬─────────────────────────────┘
                     │ writes/operates
┌────────────────────▼─────────────────────────────┐
│            Infrastructure Layer                    │
│  .nova.yaml (state) │ File System │ AI Platform    │
└──────────────────────────────────────────────────┘
```

### 1.1 CLI Layer
Provides user-facing commands; parses arguments, invokes core logic, displays results. All commands are wrapped with `withErrorHandling` for unified error handling.

### 1.2 Core Business Layer
- **InitManager** – Handles `nova init`: step orchestration, rollback, environment detection, component neutering.
- **StateManager** – Encapsulates reading/writing `.nova.yaml`; provides atomic updates, mutex lock, query helpers.
- **Guard** – Implements phase transition checks; supports static checks and dynamic triggering of agent reviews.
- **Dispatcher** – Single-agent scheduler; builds prompts, calls AI platform, handles retry/timeout/output validation.
- **PipelineOrchestrator** – Manages multi-agent pipelines with stage dependencies, parallel execution, and failure policies.
- **ContextGenerator** – Extracts and assembles standardized `TaskContext` JSON from Markdown design and task documents.

### 1.3 Adapter Layer
The `ClaudeCodeAdapter` implements `EnvironmentAdapter.setup(cwd: string)`, generating
Claude Code command files (`.claude/commands/nova-*.md`). The adapter decouples the AI
environment from skill logic.

### 1.4 Infrastructure Layer
- **State file (`.nova.yaml`)** – Stores project metadata, phase progress, task status, invocation traces.
- **File system** – Stores skill files, design documents, templates.
- **AI Platform Client** – Encapsulates communication with Claude, Codex, etc. (`sendPrompt`), called by Dispatcher.

## 2. Core Data Structures

### 2.1 TaskContext
```typescript
interface TaskContext {
  taskId: string;
  title: string;
  description: string;
  taskType: 'implementation' | 'design' | 'review' | ...;
  designContext: { designDocRef, relevantSpecs, architectureNotes };
  input: { files, dependencies, environment };
  output: { expectedArtifacts, constraints };
  acceptanceCriteria: string[];
  guardConditions: { requireReview, requireTests, blocking };
  metadata: { createdBy, createdAt, priority, complexity };
}
```

### 2.2 .nova.yaml Structure (NovaState)
```typescript
interface NovaState {
  version: number;
  project: string;
  environment: string[];
  currentPhase: string;
  phases: {
    open: { status, proposal };
    design: { status, designDoc, tasks };
    build: { status, tasks: Record<string, TaskStatus>, eccReviewPassed };
    verify: { status, pipelineResult };
    archive: { status };
  };
  metadata: { stateVersion, lastModified, history[] };
}
```

## 3. Module Interaction Sequence (Build Phase Example)
1. CLI `build` command → Guard checks design completion.
2. Guard passes → StateManager loads task list.
3. For each task, ContextGenerator creates TaskContext JSON.
4. Dispatcher.execute() is called:
   - Selects adapter → transforms context into prompt → calls AI platform → parses response → validates output → returns DispatchResult.
5. StateManager updates task status and traceId.
6. After all tasks, phase status set to `done`.

## 4. Initialization Flow Architecture
`InitManager.run()` maintains a list of steps, each with `run` and `rollback` functions. During execution:
- Steps run sequentially; any failure triggers reverse-order rollback.
- The ECC skills directory is installed if `--with-ecc` is provided.
- The Claude Code environment adapter generates command files under `.claude/commands/`.
- Document templates are copied to `docs/`.

## 5. Extensibility & Maintainability
- **New AI environment** – Implement `EnvironmentAdapter` and register in `getAdapter`.
- **New workflow phase** – Extend the `phases` field in `.nova.yaml`, add corresponding Guard checks and CLI command.
- **New agent type** – Add to `AgentType` enum and implement a corresponding prompt builder in the Dispatcher.

## 6. Deployment & Publishing
- Published as a global npm package `nova-workflow`.
- CLI entry registered in the `bin` field.
- Template files shipped with the package (via `files` field).
- Pre-publish step compiles and runs tests (`prepublishOnly` script).
