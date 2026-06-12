import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { EnvironmentAdapter, AdapterSetupOptions, McpServers } from '../types';
import { FIGMA_STEP, MOBILE_STEP, SkillTemplateFn } from './skill-templates';

const SKILL_TEMPLATES: Record<string, SkillTemplateFn> = {
  'nova.md': () => `---
description: Nova — unified entry point. Shows progress and suggests next action.
---

# Nova

Read \`.nova.yaml\` and present a compact overview with a clear next action.
If the \`nova\` CLI is available, prefer \`nova next\` for the deterministic
next-action decision.

## Step 1: Read State
Run \`nova next\` when available, or parse \`.nova.yaml\`. For each phase, determine status (pending / in-progress / done).
If \`.nova.yaml\` does not exist, say: "Nova not initialized. Run \`nova init\` first."

## Step 2: Show Overview
\`\`\`
Nova · <project-name>
────────────────────────────────────────
propose   [done]       docs/proposals/proposal.md
design    [done]       docs/designs/design.md · 6 tasks
implement [in-progress] 3/6 tasks done
verify    [pending]
archive   [pending]
────────────────────────────────────────
\`\`\`

## Step 3: Suggest Next Action
Based on the first phase that is NOT done:
- propose: pending → "/nova-propose — Start with a proposal"
- design: pending → "/nova-design — Create technical design"
- implement: pending → "/nova-implement — Start implementing"
- verify: pending → "/nova-verify — Run review pipeline"
- archive: pending → "/nova-archive — Finalize and clean artifacts"
- all done → "Complete — workflow archived"

Show: "Next: <suggestion>"
Also list: /nova-propose /nova-design /nova-implement /nova-verify /nova-archive /nova-iterate /nova-status and CLI helpers \`nova next\`, \`nova validate\`, \`nova checkpoint\`.

## Step 4: Act
Ask: "Run the suggested action, pick another, or do something else?"

## Constraints
Read-only unless the user explicitly confirms an action.
`,

  'nova-propose.md': () => `---
description: Nova propose phase — specify an OpenSpec-compatible change contract
---

# Nova Propose Phase

You are executing the **propose phase** of a Nova workflow. Your role is to
orchestrate requirements exploration and produce an OpenSpec-compatible change
contract. Native OpenSpec is optional; if unavailable, write compatible artifacts.

## Step 1: Verify State
Read \`.nova.yaml\`. Check \`phases.propose.status\`. If pending, update to
\`in-progress\` with \`nova checkpoint phase propose --status in-progress\` when available.

## Step 2: Gather Context
Read \`AGENTS.md\`, \`CLAUDE.md\`, \`README.md\`, \`package.json\`, \`src/\` to
understand the project.

## Step 3: Explore Requirements
Use the **brainstorming skill** to explore the problem space: clarify the problem,
explore alternatives, identify risks, define success criteria. Summarize for the
user and ask them to confirm before proceeding.

## Step 3.5: Handle Figma Links
If the user's request contains a Figma URL:

1. Run \`nova detect --agent claude-code --json\` and check the \`figma-mcp\`
   tool status.
2. If Figma MCP is missing or partial:
   - Tell the user that this request includes a Figma design, so Nova needs
     Figma MCP to inspect frames, tokens, and exportable assets.
   - Show the install guidance from \`nova detect\`.
   - Ask whether they want to configure it now.
   - If they configure it, rerun \`nova detect --agent claude-code --json\`
     before continuing.
   - If they decline, continue only with a documented limitation in the proposal
     and mark Figma-derived details as blocked.
3. When Figma MCP is available, inspect the linked file/frame enough to identify
   the intended screen(s), reusable components, and exportable image/icon assets.
4. Before generating the proposal, ask the user to choose:
   - **Existing page modification**: identify the existing route/screen/component
     being changed.
   - **Incremental new page**: define the new route/screen and the entry point
     users will use to navigate into it.
5. Capture Figma file URL, node IDs, page mode, affected route/screen, entry
   point, and required cut/export assets for the spec contract.

## Step 4: Generate Proposal
Before generating the proposal, classify the change mode:

- \`existing\`: modifies existing business logic, page, route, component, API, or workflow
- \`incremental\`: adds a new page/entry/flow that connects to existing product navigation
- \`new\`: creates an isolated new capability with no legacy behavior dependency

If the change mode is \`existing\`, record affected modules/routes/components and
state that design must run a legacy preflight before task planning.

Do lightweight Project Context discovery for the proposal: record likely rule
sources, projectType, primary stack, and obvious risks. Do not write the formal
\`.nova.yaml.projectContext\` yet; the design phase generates or refreshes the
Project Context Contract.

Before generating the proposal, confirm the test strategy with the user using
this Markdown checklist:

- [ ] 自动化 UI 测试
- [ ] 单元测试

If automated UI testing is selected, determine the user flow early: entry point,
route/screen, navigation steps, and success assertion. Infer this from code,
Figma, or existing navigation when possible; ask the user only when it cannot be
determined confidently.

Write \`.openspec/changes/<change-id>/proposal.md\`, compatible spec files under
\`.openspec/changes/<change-id>/specs/\`, and \`docs/proposals/proposal.md\` as
a summary. Include requirement ids and acceptance ids for later task references.
When a Figma link is present, the spec MUST include Figma traceability, whether
the work is an existing-page modification or incremental page, the navigation
entry point for incremental pages, and requirements for exporting/using suitable
cut assets from the current project's implementation context.
Always include \`## Test Strategy\` with \`automatedUiTesting\`, \`unitTesting\`,
UI flows when selected, unit test targets when selected, and rationale for
omitted or blocked test types.
Always include \`## Change Mode\` with \`changeMode\`, affected areas, and
whether \`legacyPreflight.required\` is expected during design.

## Step 5: Update State
Set \`activeChange\`, \`artifacts.openspecChange\`, \`artifacts.proposal\`,
\`artifacts.specDelta\`, \`phases.propose.proposal\`, \`phases.propose.changeMode\`, and
\`phases.propose.testStrategy\`. Use \`nova checkpoint artifacts --proposal docs/proposals/proposal.md --spec-delta <spec-ref-or-path> --active-change <change-id> --test-strategy '<json>'\`,
where \`<json>\` includes \`automatedUiTesting\` and \`unitTesting\`; also pass
\`--change-mode existing|incremental|new\`.
Run \`nova validate\`, then mark completion with \`nova checkpoint phase propose --status done\`
when validation passes.

## Constraints
- Read any file for context. Write only to \`docs/proposals/\`,
  \`.openspec/changes/\`, and \`.nova.yaml\`.
- Do not modify source code — the implement phase handles that.
`,

  'nova-design.md': (mcp) => `---
description: Nova design phase — plan spec-bound work from an approved change
---

# Nova Design Phase

You are executing the **design phase** of a Nova workflow. Your role is to turn
the OpenSpec-compatible change into a Superpowers-compatible plan and task graph.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.propose.status: done\` with a non-empty proposal.
Update \`phases.design.status\` to \`in-progress\` with
\`nova checkpoint phase design --status in-progress\` when available.

## Step 2: Load Context
Read the proposal/spec delta (\`artifacts.proposal\`, \`artifacts.openspecChange\`),
\`AGENTS.md\`, \`CLAUDE.md\`, \`CODEX.md\`, \`README.md\`, package metadata,
and \`src/\`. Also read project-local rule files when present, including
\`.cursorrules\`, \`.cursor/rules/\`, and closer directory-specific
\`AGENTS.md\` or instruction files for affected areas.

Before planning tasks, extract mandatory project rules, forbidden patterns,
required libraries/frameworks, and verification commands. Treat these project
rules as higher priority than generic Nova guidance, and include a
\`## Project Rules / Conventions\` summary in the design document.

Also identify project type best practices from \`.nova.yaml.projectType\`,
project metadata such as \`package.json\`, \`go.mod\`, \`pyproject.toml\`, or
equivalent files, and the existing codebase. Capture architecture boundaries,
framework idioms, error handling, test strategy, security defaults, and
performance considerations for this project type. Include a
\`## Project Type Best Practices\` summary in the design document. If a project
rule conflicts with a generic best practice, follow the project rule and record
the rationale.

Generate or refresh the Project Context Contract in \`.nova.yaml.projectContext\`
with \`rules.sources/must/mustNot/verificationCommands\`,
\`bestPractices.projectType/sources/must/should/risks\`, and \`conflicts[]\`.
Optionally write a readable copy and record it as \`artifacts.projectContext\`.

## Step 3: Explore Architecture Options
Use the **brainstorming skill** to explore at least 2 architectural approaches.
For each: architecture pattern, tech stack rationale, component structure, data
flow, key trade-offs. Present alternatives to the user for selection.
${mcp?.figma ? FIGMA_STEP : ''}

## Step 3.5: Legacy Preflight for Existing Changes
If \`changeMode=existing\`, inspect the affected existing modules before task
planning. Check whether they follow the current project conventions and project
type best practices for
architecture boundaries, component/module responsibility, state/data flow,
testability, verification commands, design-system usage, and obvious technical
debt that would affect this change.

Record \`legacyPreflight\` with \`required\`, \`performed\`, \`affectedAreas\`,
\`hasIssues\`, \`issues\`, and \`rationale\`. If issues are found, present this
interactive choice and wait for the user before finalizing tasks:

- [ ] 仅完成本次需求，不做重构
- [ ] 做最小必要重构，只处理会阻塞本次需求的部分
- [ ] 将相关模块一起重构到项目规范

Map the answer to \`refactorPolicy\`: \`none\`, \`minimal\`, or \`full\`, and
record \`userDecision\`. Do not expand refactoring scope later beyond this policy.

## Step 4: Generate Design Document
Based on the user-selected approach, use the **writing-plans skill** to produce
\`docs/designs/design.md\` and \`docs/superpowers/plans/<change-id>.md\`.
Tasks must include \`method\`, \`specRefs\`, \`acceptanceRefs\`, and
\`verification.commands\`. Tasks must also reference the relevant project
rules/conventions and project type best practices they must obey when touching
code, using \`complianceRefs.projectRules\` and
\`complianceRefs.bestPractices\`. Any planned deviation from either must include
a clear rationale.
Follow the proposal test strategy:
- If \`automatedUiTesting=true\`, define UI test cases with entry point,
  route/screen, steps, expected result, and Mobile MCP/E2E runner needs. Add a
  testing task or UI verification command.
- If \`unitTesting=true\`, define unit test targets and include unit test
  commands/files in implementation or testing tasks.
- If a test type was not selected, do not force it; keep a concise rationale
  when useful.
If \`changeMode=existing\`, include a \`## Legacy Preflight\` section and make
tasks respect the selected \`refactorPolicy\`.

## Step 5: Validate Tasks
Verify each task has all required fields (id, title, type, description, files,
acceptance, priority, estimatedComplexity).

## Step 6: Update State
Set \`designDoc\` and \`tasks\` from parsed YAML. Prefer
\`nova checkpoint artifacts --design-doc docs/designs/design.md --project-context '<json>' --project-context-path <path>\`.
Include \`--legacy-preflight '<json>'\` when \`changeMode=existing\`.
Run \`nova validate\`, then mark completion with \`nova checkpoint phase design --status done\`.

## Constraints
- Design and plan only — no implementation code.
- Tasks must be concrete: specific file paths, verifiable acceptance criteria.
`,

  'nova-implement.md': () => `---
description: Nova implement phase — execute spec-bound tasks with evidence
---

# Nova Implement Phase

You are executing the **implement phase** of a Nova workflow. Your role is to
execute each task as a spec-bound unit of work: resolve spec refs, apply the
task method, verify the result, and record evidence for review.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.design.status: done\` with non-empty tasks.
Update \`phases.implement.status\` to \`in-progress\` with
\`nova checkpoint phase implement --status in-progress\` when available.

## Step 2: Load Task List
Show task summary (id, title, method, specRefs, priority). Ask user to confirm before
proceeding. For each task, use \`nova context --task-id <id>\`; if
\`designContext.legacyPreflight\` is present, keep implementation and refactoring
within its \`refactorPolicy\`.

Before editing files for a task, read and obey the project-local instruction
files that apply to the repository and target paths: \`AGENTS.md\`,
\`CLAUDE.md\`, \`CODEX.md\`, \`README.md\`, \`.cursorrules\`,
\`.cursor/rules/\`, and any closer directory-specific rule files. If these
rules conflict with generic Nova instructions, follow the project rules.

Also read \`context.projectContext\` (Project Context Contract) and the task's
\`complianceRefs\`. Apply the contract rules and best practices for the current
\`.nova.yaml.projectType\` and detected stack. Project Type Best Practices apply here. If implementation must deviate from a project rule
or best practice, record a specific rationale in \`compliance.deviations\`; weak
or missing rationale will be rejected in verify.

## Step 3: Execute Each Task
For each task in priority order:

### Route by Method
- **tdd** — use the **test-driven-development skill** when available
- **implementation** — write scoped production code with tests or no-test rationale
- **refactor** — preserve referenced spec behavior and run regression checks
- **docs** — update docs/specs and validate references
- **migration** — require dry-run, rollback notes, and compatibility evidence

### Verify After Each Task
1. Run \`task.verification.commands\` if present
2. Run type check (\`npx tsc --noEmit\`)
3. Run selected tests from \`testStrategy\`: unit tests if selected, automated
   UI scripts if selected
4. For existing changes, run or record regression checks for affected legacy behavior
5. Confirm specRefs and acceptanceRefs have evidence before marking complete
6. Confirm the implementation follows the applicable project rules/conventions
   and project type best practices

### Record Result
Record task status and evidence with \`nova checkpoint task <task-id> --status done --files <csv> --tests <csv> --trace-id <id> --compliance '<json>'\` when available.
Include in the task summary/evidence which project rules, project type best
practices, and verification commands were followed. List any deviations with
rationale.
On failure, ask user: abort, skip, or retry.

## Step 4: Final Verification
Run full test suite and type check. Report summary.

## Step 5: Update State
Run \`nova guard implement verify\`, then set \`phases.implement.status = 'done'\`
with \`nova checkpoint phase implement --status done\`.

## Constraints
- Follow existing project conventions. Never leave TODOs or stubs.
- Run checks after EACH task, not just at the end.
`,

  'nova-verify.md': (mcp) => `---
description: Nova verify phase — run spec conformance, code, and security review
---

# Nova Verify Phase

You are executing the **verify phase** of a Nova workflow. Your role is to
orchestrate an ECC (Everything Claude Code) compatible verification pipeline.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.implement.status: done\`.
Update \`phases.verify.status\` to \`in-progress\` with
\`nova checkpoint phase verify --status in-progress\` when available.

## Step 2: Gather Context
Load completed tasks from \`phases.design.tasks\`. Read changed files, task
evidence, the design document, and \`artifacts.openspecChange\`.
Also read applicable project-local instruction files and the design document's
\`Project Rules / Conventions\` and \`Project Type Best Practices\` sections.
Treat \`.nova.yaml.projectContext\` as the Project Context Contract source of
truth.

Before producing verdicts, start an independent verification reviewer. Prefer a
subagent or separate reviewer context that receives only \`.nova.yaml\`, Project
Context Contract, design tasks, implementation evidence, changed files, and the
expected report format. The main agent orchestrates commands and checkpoints but
must not grant PASS from its own implementation context.

If subagents are unavailable, use a fresh-context review: reread artifacts and
changed files without relying on implementation-stage explanations. Only use
\`same-session-fallback\` when no independent path exists, and record a concrete
rationale in \`reviewIndependence\`.

## Step 3: Run Spec-Conformance Review
Compare task evidence against \`specRefs\` and \`acceptanceRefs\`. Verdict:
PASS / CHANGES_REQUESTED / BLOCKED.
If \`changeMode=existing\`, verify changed files stayed within the selected
\`legacyPreflight.refactorPolicy\` and that existing behavior regression evidence
is present.

## Step 4: Run Code Review
Use the **ecc:code-reviewer** skill to review each task's changed files:
correctness, conventions, error handling, test coverage, type safety.
Verdict: PASS / CHANGES_REQUESTED / COMMENT.

## Step 4.5: Run Project Rules and Best-Practice Review
For each changed file and task, verify conformance with the Project Context
Contract:

- project-local rules: \`AGENTS.md\`, \`CLAUDE.md\`, \`CODEX.md\`, \`README.md\`,
  \`.cursorrules\`, \`.cursor/rules/\`, and closer directory-specific rules
- project type best practices from \`.nova.yaml.projectType\`, project metadata,
  existing code patterns, and the design document

If code deviates from project rules or best practices, accept it only when the
task compliance evidence or implementation notes provide a specific, sufficient rationale.
Weak, missing, or convenience-only rationale is \`CHANGES_REQUESTED\`; do not
allow verify to pass.

Run every command in \`projectContext.rules.verificationCommands\`, including
build, compile, typecheck, and test commands. Any required command that fails or
is skipped blocks PASS and must be reported as CHANGES_REQUESTED or BLOCKED.

## Step 5: Run Security Review
Use the **ecc:security-reviewer** skill to audit each task's changed files:
injection risks, secret exposure, insecure dependencies, input validation.
Verdict: PASS / VULNERABILITY_FOUND. Include severity and remediation.
${mcp?.mobile ? MOBILE_STEP : ''}
Only require automated UI verification when the proposal test strategy selected
\`automatedUiTesting=true\`. If it was not selected, note it as not applicable.

## Step 6: Generate Report
Write \`docs/reports/verification-report.md\` with summary, spec-conformance
results, \`reviewIndependence\`, \`verificationCommands\`, Project Context Contract
\`projectRulesVerdict\` and \`bestPracticesVerdict\`, per-task results, overall
assessment (PASS / NEEDS_FIXES / BLOCKED), and
recommendations. List every deviation, the stated rationale, and whether it was
accepted.

## Step 7: Update State
Set \`phases.verify.status = 'done'\`, \`pipelineResult\` with stage results.
Set \`artifacts.verificationReport = 'docs/reports/verification-report.md'\`.
Prefer \`nova checkpoint artifacts --verification-report docs/reports/verification-report.md --project-rules-verdict PASS --best-practices-verdict PASS --review-independence '{"mode":"subagent","agent":"claude-reviewer"}' --verification-commands '[{"command":"npm test","status":"PASS","exitCode":0}]'\`.
Run \`nova validate\`, then mark completion with
\`nova checkpoint phase verify --status done\`.

## Constraints
- Be specific — reference file paths and line numbers.
- Do not mark verify done unless spec conformance, project rules conformance,
  project type best-practice conformance, required verification commands, code
  review, and security review all pass. Weak, missing, or convenience-only deviation rationale is
  CHANGES_REQUESTED.
- Security findings must include severity and remediation.
`,

  'nova-archive.md': () => `---
description: Nova archive phase — finalize specs and clean source artifacts
---

# Nova Archive Phase

You are executing the **archive phase** of a Nova workflow. Your role is to
finalize the workflow by delegating to the deterministic CLI archive command.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.verify.status: done\`. Run
\`nova guard verify archive\` and stop if it fails.

## Step 2: Archive
Run \`nova archive\`. This copies proposal, design, and verification artifacts
into \`docs/specs/\`, updates \`.nova.yaml\` to point at the archived copies,
removes source artifacts recorded in state, removes the active OpenSpec change
directory when recorded, removes the Superpowers implementation plan when
recorded, and clears temporary Nova contexts.

## Step 3: Report
Summarize the archived files and cleaned source artifacts from the CLI output.
Then run \`nova next\` or read \`.nova.yaml\` to confirm the workflow is complete.

## Constraints
- Do not manually delete code files.
- If \`nova archive\` fails, report the exact guard or artifact issue.
`,

  'nova-iterate.md': () => `---
description: Nova iterate — roll back to a previous phase for iteration
---

# Nova Iterate Phase

You are handling a **phase iteration** in a Nova workflow. Software development
is iterative — implementation reveals design gaps, verification reveals spec issues.

## Step 1: Detect Current Phase
Read \`.nova.yaml\`. Determine which phase is active and which earlier phases are
valid rollback targets.

## Step 2: Present Options
Show valid rollback targets. For each, explain what will be reset.
Ask user: which phase, why (recorded in history), keep or discard work?

## Step 3: Execute Rollback
- **Keep work**: Reset state only — preserve all files. Set target phase and all
  subsequent phases to \`pending\`, clear task results and timestamps.
- **Discard work**: Additionally revert changed files via \`git checkout\`.

## Step 4: Record Iteration
Add to \`.nova.yaml\` metadata.history:
\`"Iterated <from> to <target>: <user's reason>"\`

## Step 5: Report Next Steps
Summarize what changed and which command to run next.

## Constraints
- Never delete code files without explicit user confirmation.
- Always record the iteration reason.
`,

  'nova-status.md': () => `---
description: Nova status — display phase progress, task completion, and stuck detection
---

# Nova Status

Display current project status from \`.nova.yaml\`.

## Step 1: Load State
Read \`.nova.yaml\`. Parse all phase statuses and task results.

## Step 2: Display Summary
Show each phase with status icon (pending/in-progress/done), timestamps, and
key artifacts. For the build phase, show per-task completion.

## Step 3: Detect Issues
Flag: phases stuck in-progress, failed tasks, skipped guard conditions,
missing artifacts.
`,

  'nova-detect.md': () => `---
description: Nova detect — check installation status of tools and provide install instructions
---

# Nova Detect

Run \`nova detect --agent claude-code\` to check required, recommended, and
optional Nova-enhancing tools from a Claude Code session. Use
\`nova detect --agent claude-code --json\` when the user wants structured output.

## What To Report

- **Required**: Nova project state such as \`.nova.yaml\`. Missing required items
  block the current project until fixed.
- **Recommended**: OpenSpec, Superpowers, and affaan-m/ECC. Missing recommended items do
  not block Nova; compatible mode will be used.
- **Optional**: CodeGraph, Figma MCP, and Mobile MCP. Missing optional items only
  limit enhanced context, design, or UI verification workflows.

For each missing or partial item, show the install guidance from \`nova detect\`.
Do not imply that every tool must be installed before Nova can be used.

## Fallback

If the \`nova\` CLI is unavailable, explain that \`nova detect\` is the preferred
deterministic check and ask the user to run \`npm install -g @nova286/nova-workflow\`
or use the local project build.

## Constraints
- Never auto-install without user confirmation
- Always show what will be installed before running commands
- Respect existing configurations — don't overwrite
`,
};

export class ClaudeCodeAdapter implements EnvironmentAdapter {
  name = 'claude-code';
  async setup(cwd: string, options?: AdapterSetupOptions) {
    if (options?.skillsDir === 'user') {
      await this.writeToSharedSkills(options?.mcpServers, options.homeDir);
    } else {
      await this.writeToProjectSkills(cwd, options?.mcpServers);
    }
  }

  private async writeToSharedSkills(mcpServers?: McpServers, homeDir = os.homedir()) {
    const agentsSkillsDir = path.join(homeDir, '.agents', 'skills');
    const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
    await ensureSharedSkillsDirs(agentsSkillsDir, claudeSkillsDir);
    for (const [filename, templateFn] of Object.entries(SKILL_TEMPLATES)) {
      const skillName = filename.replace('.md', '');
      const skillDir = path.join(agentsSkillsDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await this.writeSkillFile(path.join(skillDir, 'SKILL.md'), templateFn(mcpServers));
      const linkPath = path.join(claudeSkillsDir, skillName);
      try { await fs.access(linkPath); continue; } catch {}
      try {
        await fs.symlink(skillDir, linkPath);
      } catch {}
    }
  }

  private async writeToProjectSkills(cwd: string, mcpServers?: McpServers) {
    const skillsDir = path.join(cwd, '.claude', 'skills');
    for (const [filename, templateFn] of Object.entries(SKILL_TEMPLATES)) {
      const skillName = filename.replace('.md', '');
      const skillDir = path.join(skillsDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await this.writeSkillFile(path.join(skillDir, 'SKILL.md'), templateFn(mcpServers));
    }
  }

  private async writeSkillFile(filePath: string, content: string) {
    const newHash = crypto.createHash('md5').update(content).digest('hex');
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      const oldHash = crypto.createHash('md5').update(existing).digest('hex');
      if (oldHash === newHash) return;
    } catch {}
    await fs.writeFile(filePath, content);
  }
}

async function ensureSharedSkillsDirs(agentsSkillsDir: string, claudeSkillsDir: string) {
  await fs.mkdir(agentsSkillsDir, { recursive: true });
  try {
    await fs.lstat(claudeSkillsDir);
    return;
  } catch {}

  await fs.mkdir(path.dirname(claudeSkillsDir), { recursive: true });
  try {
    await fs.symlink(agentsSkillsDir, claudeSkillsDir, 'dir');
  } catch {
    await fs.mkdir(claudeSkillsDir, { recursive: true });
  }
}
