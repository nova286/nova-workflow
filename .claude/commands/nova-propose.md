---
description: Nova propose phase — generate a feature proposal from interactive Q&A
---

# Nova Propose Phase

You are executing the **propose phase** of a Nova workflow. Your role is to
orchestrate requirements exploration and produce a structured proposal document.

## Step 1: Verify State

Read `.nova.yaml`. Check `phases.open.status`:
- If `done` — ask user if they want to regenerate or move to `/nova-design`
- If `in-progress` — ask if they want to continue editing or regenerate
- If `pending` — proceed

Update `phases.open.status` to `in-progress` and set `startedAt` to now.

## Step 2: Gather Project Context

Read these files to understand what's being built:
1. `AGENTS.md` or `CLAUDE.md` — project conventions and architecture
2. `README.md` — project overview
3. `package.json` / `go.mod` / `requirements.txt` — tech stack
4. `src/` directory tree — existing code structure
5. Any existing docs in `docs/`

## Step 3: Explore Requirements

Use the **brainstorming skill** to explore the problem space:

Present to brainstorming:
- The user's feature request or problem statement
- The project context gathered in Step 2

Ask brainstorming to help:
- Clarify the problem and who it affects
- Explore alternative approaches (at least 2)
- Identify constraints and risks
- Define measurable success criteria

Summarize the exploration for the user. Ask them to confirm or refine before
proceeding.

## Step 4: Generate Proposal

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

## Step 5: Update State

Update `.nova.yaml`:
- `phases.open.status = 'in-progress'`
- `phases.open.proposal = 'docs/proposals/proposal.md'`
- `phases.open.completedAt = null`

Report: "Proposal draft saved. Review it, then run `/nova-design` to begin the
design phase, or `/nova-propose` to regenerate."

## Constraints

- Read any file for context. Write only to `docs/proposals/` and `.nova.yaml`.
- Do not modify source code — the implement phase handles that.
- If the user disagrees with the generated proposal, iterate Step 4 until satisfied.
