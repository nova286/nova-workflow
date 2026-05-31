# Nova Methodology Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe Nova as an optional-integration orchestrator for OpenSpec-compatible specs, Superpowers-compatible planning/TDD, and ECC (Everything Claude Code) compatible verification.

**Architecture:** Keep Nova's current CLI and state manager intact. Add integration metadata and artifact references to `.nova.yaml`, then pass those references into `TaskContext` so implement/verify phases can be spec-bound without requiring native tool installs.

**Tech Stack:** TypeScript, Jest, YAML, existing Nova CLI adapters and local skill markdown files.

---

## File Structure

- Modify `src/cli-core/types.ts` to add integration, artifact, methodology, verification, and evidence types.
- Modify `src/cli-core/init-manager.ts` to create `.openspec/changes` and initialize integration/artifact metadata.
- Modify `src/cli-core/context-generator.ts` to carry `activeChange`, `specRefs`, `acceptanceRefs`, `method`, `verification`, and `evidence` from tasks/state into `TaskContext`.
- Modify tests in `src/cli-core/__tests__/context-generator.test.ts` and `src/cli-core/__tests__/init-manager.test.ts`.
- Modify `.agents/skills/source-command-nova-*.md` to describe the new semantic roles while keeping command names.
- Modify `README.md` to document optional integration levels and the new workflow.

## Tasks

### Task 1: Add init metadata

**Files:**
- Modify: `src/cli-core/__tests__/init-manager.test.ts`
- Modify: `src/cli-core/init-manager.ts`

- [ ] Add a failing test that `nova init` creates `.openspec/changes`.
- [ ] Add a failing test that generated `.nova.yaml` includes `integrations`, `activeChange`, and `artifacts`.
- [ ] Update `createDirs()` and `generateConfig()` to satisfy those tests.
- [ ] Run `npm test -- init-manager`.

### Task 2: Add spec-bound task context

**Files:**
- Modify: `src/cli-core/__tests__/context-generator.test.ts`
- Modify: `src/cli-core/types.ts`
- Modify: `src/cli-core/context-generator.ts`

- [ ] Add a failing test for task-level `specRefs`, `acceptanceRefs`, `method`, and `verification.commands`.
- [ ] Add a failing test for state-level `activeChange`, `artifacts`, and `integrations` being copied into context.
- [ ] Extend `TaskContext` and `ContextGenerator.generateFromTask()`.
- [ ] Run `npm test -- context-generator`.

### Task 3: Update workflow docs and skill commands

**Files:**
- Modify: `README.md`
- Modify: `.agents/skills/source-command-nova-propose/SKILL.md`
- Modify: `.agents/skills/source-command-nova-design/SKILL.md`
- Modify: `.agents/skills/source-command-nova-implement/SKILL.md`
- Modify: `.agents/skills/source-command-nova-verify/SKILL.md`

- [ ] Update command descriptions to present OpenSpec/Superpowers/ECC (Everything Claude Code) as optional native integrations with compatible fallbacks.
- [ ] Document `/nova-implement` as a spec-bound executor.
- [ ] Keep command names stable to avoid breaking existing users.

### Task 4: Verify

**Files:**
- All touched files

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm test`.
- [ ] Note any unrelated dirty worktree files in the final summary.

