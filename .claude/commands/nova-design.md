---
description: Nova design phase — generate technical design from approved proposal
---

# Nova Design Phase

You are executing the **design phase** of a Nova workflow. Your role is to
orchestrate architecture exploration and produce a structured design document
with an actionable task list.

## Step 0: Context Gate

Check if `.nova.yaml` exists in the project root.
- If NO: "This project isn't using Nova. Run `nova init` first, or I'll
  use raw Superpowers skills directly." Let user choose.
- If YES: Parse it. If YAML is corrupted or unreadable, say:
  ".nova.yaml exists but is corrupted. Run `nova init --force` to
  reinitialize, or fix the file manually." Stop — do not proceed.
- If YES and valid: Nova owns this workflow. Verify phase is correct
  for this command:
  * `/nova-propose` — reject if past propose (design/build/verify done
    or in-progress). Suggest `/nova-iterate` to roll back first.
  * `/nova-design` — reject if propose not done, or if build/verify done.
  * `/nova-implement` — reject if design not done.
  * `/nova-verify` — reject if build not done.
  * `/nova-iterate` — always allowed.
  If the phase is correct, proceed.

## Step 1: Verify State

Read `.nova.yaml`. Check:
- `phases.open.status` is `done` — proposal must be complete. Reject if not.
- `phases.open.proposal` is not empty — must have a proposal file.
- `phases.design.status` is NOT `done` — if done, ask user if they want to regenerate.
- If `in-progress` — generate a resume summary:

  ```
  [Nova] Resuming design phase
    Last active: <relative time>
    Proposal: <path>
    Design doc in progress — continue editing?
  ```

Update `phases.design.status` to `in-progress` and set `startedAt` to now. Skip this update if already `in-progress`.

## Step 2: Load Context

Read these files:
1. The proposal file at `phases.open.proposal` (default: `docs/proposals/proposal.md`)
2. `AGENTS.md` or `CLAUDE.md` — project conventions
3. `package.json` / `go.mod` / etc — dependencies and tech stack
4. `src/` directory tree — existing code structure

## Step 3: Explore Architecture Options

Use the **brainstorming skill** to explore at least 2 architectural approaches:

Present to brainstorming:
- The proposal's requirements and constraints
- The project's current tech stack and code structure
- The target environment (CLI, web, API, library, etc.)

Ask brainstorming to produce for each approach:
- Architecture pattern and component structure
- Tech stack decisions with rationale
- Data flow between components
- Key trade-offs vs. the other approach(es)
- Major risks specific to that approach

Present the alternatives to the user. Ask them to select one or combine ideas.
Do not proceed until the user confirms their choice.

## Step 4: Generate Design Document

Based on the user-selected approach, use the **writing-plans skill** to produce
`docs/designs/design.md` with these sections:

### Architecture Overview
High-level system structure. Patterns used. How components relate.

### Tech Stack
Languages, frameworks, key libraries. Rationale for each choice.

### Component Breakdown
For each module/component: name, file path, responsibility, key interfaces,
dependencies on other components.

### Data Flow
How data moves through the system. Request/response flows. Key interfaces.

### Implementation Plan
Ordered, actionable task list in YAML:

```yaml
tasks:
  - id: kebab-case-id
    title: Short task description
    type: implementation | testing | design | review | security
    description: What to implement and why
    files:
      - {path: relative/file/path, action: create|modify|read|delete}
    expectedArtifacts:
      - {type: file|test|code, description: What this is, pathHint: where it goes}
    acceptance:
      - Verifiable criterion
    priority: high | medium | low
    estimatedComplexity: 1-10
```

Task guidelines:
- Each task completable in one focused effort
- Order: setup → core → integration → polish → testing
- `files` must list every file the task touches
- `acceptance` criteria must be specific and verifiable
- Complexity: 1-3 trivial, 4-6 moderate, 7-10 complex

### Risks & Mitigations
Known risks, failure modes, and mitigations. Include technical, integration,
security, and performance risks.

## Step 5: Validate Tasks

Verify each task in the YAML task list:
1. Has all required fields: id, title, type, description, files, acceptance
2. `id` is kebab-case and unique
3. `files[].action` is one of: create, modify, read, delete
4. `priority` is one of: high, medium, low
5. `estimatedComplexity` is a number 1-10

Fix any issues before proceeding.

## Step 6: Update State

Update `.nova.yaml`:
- `phases.design.status = 'done'`
- `phases.design.designDoc = 'docs/designs/design.md'`
- `phases.design.tasks = [parsed task list]`
- `phases.design.completedAt = now`

Report: "Design complete. N tasks defined. Review docs/designs/design.md, then
run `/nova-implement` to begin implementation."

## Step 7: Output Status Bar

After all work is done and `.nova.yaml` is updated, output a one-line status summary:

```
[Nova] <phase> · <completion> · next: <suggestion>
```

Read `.nova.yaml` to determine:
- `<phase>`: the current phase name (propose / design / implement / verify / archive)
- `<completion>`: phase status (done / in-progress / N/M done / failed)
- `<suggestion>`: the logical next action

Examples:
[Nova] propose · done · next: /nova-design
[Nova] design · done · 6 tasks · next: /nova-implement
[Nova] implement · 3/6 done · next: "add rate limiting" (task-4)
[Nova] verify · 2 issues · next: fix then /nova-verify
[Nova] all done · next: nova archive

## Constraints

- Design and plan only — do NOT write implementation code or modify `src/`.
- Write only to `docs/designs/` and `.nova.yaml`.
- If the proposal is unclear, note it as an assumption in Risks.
- Each task must be concrete enough for a fresh AI session to execute without
  additional clarification.
