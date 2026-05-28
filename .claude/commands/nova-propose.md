---
description: Nova propose phase — generate a feature proposal from interactive Q&A
---

# Nova Propose Phase

You are executing the **propose phase** of a Nova workflow. Your role is to
orchestrate requirements exploration and produce a structured proposal document.

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

## Step 2: Verify State

Read `.nova.yaml`. Check `phases.open.status`:
- If `done` — ask user if they want to regenerate or move to `/nova-design`
- If `in-progress` — ask if they want to continue editing or regenerate
- If `pending` — proceed

Update `phases.open.status` to `in-progress` and set `startedAt` to now.

## Step 3: Gather Project Context

Read these files to understand what's being built:
1. `AGENTS.md` or `CLAUDE.md` — project conventions and architecture
2. `README.md` — project overview
3. `package.json` / `go.mod` / `requirements.txt` — tech stack
4. `src/` directory tree — existing code structure
5. Any existing docs in `docs/`

## Step 4: Explore Requirements

Use the **brainstorming skill** to explore the problem space:

Present to brainstorming:
- The user's feature request or problem statement
- The project context gathered in Step 3

Ask brainstorming to help:
- Clarify the problem and who it affects
- Explore alternative approaches (at least 2)
- Identify constraints and risks
- Define measurable success criteria

Summarize the exploration for the user. Ask them to confirm or refine before
proceeding.

## Step 5: Generate Proposal

Based on the confirmed requirements exploration, write `docs/proposals/proposal.md`:

```markdown
# Feature Proposal: [Feature Name]

## Problem Statement
What problem exists and why it matters. Who is affected.

## Proposed Solution
High-level approach. How it solves the problem.

## User Stories
- As a [role], I want [goal] so that [reason]  (prioritized)

## Scope & Deliverables
**In scope:**
- Concrete deliverable 1
- Concrete deliverable 2

**Out of scope:**
- Explicitly excluded item

## Success Criteria
- [ ] Measurable criterion 1
- [ ] Measurable criterion 2

## Risks & Constraints
- Risk: description — Mitigation: approach
- Constraint: description
```

## Step 6: Update State

Update `.nova.yaml`:
- `phases.open.status = 'in-progress'`
- `phases.open.proposal = 'docs/proposals/proposal.md'`
- `phases.open.completedAt = null`

Report: "Proposal draft saved. Review it, then run `/nova-design` to begin the
design phase, or `/nova-propose` to regenerate."

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

- Read any file for context. Write only to `docs/proposals/` and `.nova.yaml`.
- Do not modify source code — the implement phase handles that.
- If the user disagrees with the generated proposal, iterate Step 5 until satisfied.
