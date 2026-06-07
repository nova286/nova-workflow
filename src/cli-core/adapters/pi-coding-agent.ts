import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { EnvironmentAdapter, AdapterSetupOptions, McpServers } from '../types';
import { FIGMA_STEP, MOBILE_STEP, SkillTemplateFn } from './skill-templates';

const PI_SKILL_TEMPLATES: Record<string, SkillTemplateFn> = {
  'nova.md': () => `---
description: Nova — unified entry point for Pi. Shows progress and suggests next action.
---

# Nova

Read \`.nova.yaml\` and present a compact overview with a clear next action.
Prefer \`nova next\` when available so /nova and the CLI share the same
deterministic routing decision.

## Step 1: Read State
Run \`nova next\` when available, or parse \`.nova.yaml\`. For each phase, determine status (pending / in-progress / done).
If \`.nova.yaml\` does not exist, say: "Nova not initialized. Run \`nova init\` first."

## Step 2: Show Overview
\`\`\`
Nova · <project-name>
────────────────────────────────────────
propose   [status]     docs/proposals/proposal.md
design    [status]     docs/designs/design.md
implement [status]     X/Y tasks done
verify    [status]
archive   [status]
────────────────────────────────────────
\`\`\`

## Step 3: Suggest Next Action
Based on the first phase that is NOT done:
- propose: pending → "Run propose phase"
- design: pending → "Run design phase"
- implement: pending → "Run implement phase"
- verify: pending → "Run verify phase"
- all done → "Run nova archive"
`,

  'nova-propose.md': () => `---
description: Nova propose phase — generate a feature proposal
---

# Nova Propose Phase

## Step 1: Verify State
Read \`.nova.yaml\`. Check \`phases.propose.status\`. If pending, update to \`in-progress\` with \`nova checkpoint phase propose --status in-progress\` when available.

## Step 2: Gather Context
Read \`AGENTS.md\`, \`README.md\`, \`package.json\`, \`src/\` to understand the project.

## Step 3: Explore Requirements
Clarify the problem, explore alternatives, identify risks, define success criteria.

## Step 3.5: Handle Figma Links
If the request contains a Figma URL:

1. Run \`nova detect --agent pi-coding-agent --json\` and check \`figma-mcp\`.
2. If Figma MCP is missing or partial, tell the user this request needs Figma
   MCP for frame inspection and asset export planning. Show the install guidance,
   let the user configure it now, then rerun detection before continuing.
3. If the user continues without Figma MCP, record the limitation in the proposal.
4. When Figma MCP is available, inspect the linked file/frame and ask whether
   this is an existing page modification or an incremental new page.
5. For existing pages, identify the existing route/screen/component. For
   incremental pages, identify the new route/screen and the navigation entry
   point users will use to reach it.
6. Capture Figma URL, node IDs, page mode, route/screen, entry point, and
   required cut/export assets in the proposal/spec.

## Step 4: Generate Proposal
Before generating the proposal, classify the change mode:

- \`existing\`: modifies existing business/page/route/component/API/workflow
- \`incremental\`: adds a new connected page/entry/flow
- \`new\`: creates an isolated new capability

If \`existing\`, record affected modules/routes/components and require legacy
preflight in design.

Before generating the proposal, confirm the test strategy with:

- [ ] 自动化 UI 测试
- [ ] 单元测试

If automated UI testing is selected, determine the entry point, route/screen,
navigation steps, and success assertion. Infer from code, Figma, or existing
navigation when possible; ask the user when it cannot be determined.

Write \`docs/proposals/proposal.md\` with problem, solution, user stories, scope, success criteria.
When a Figma link is present, include Figma traceability and cut-asset
requirements so implementation can export and use suitable assets for the
current project.
Always include \`## Test Strategy\` with automatedUiTesting, unitTesting, UI
flows when selected, unit targets when selected, and rationale for omitted or
blocked test types.
Always include \`## Change Mode\` with changeMode, affected areas, and whether
legacyPreflight is required.

## Step 5: Update State
Update proposal artifacts with \`nova checkpoint artifacts --proposal docs/proposals/proposal.md --spec-delta <spec-ref-or-path> --active-change <change-id> --test-strategy '<json>' --change-mode existing|incremental|new\`, where \`<json>\` includes automatedUiTesting and unitTesting and is written to \`phases.propose.testStrategy\`. Run \`nova validate\`, then \`nova checkpoint phase propose --status done\`.
`,

  'nova-design.md': (mcp) => `---
description: Nova design phase — create technical design and task list
---

# Nova Design Phase

## Step 1: Verify State
Read \`.nova.yaml\`. Require phases.propose.status = done. Update phases.design.status to in-progress with \`nova checkpoint phase design --status in-progress\` when available.

## Step 2: Load Context
Read proposal, AGENTS.md, package.json, src/.

## Step 3: Explore Architecture
Explore at least 2 architectural approaches. Present alternatives.
${mcp?.figma ? FIGMA_STEP : ''}

## Step 3.5: Legacy Preflight
If \`changeMode=existing\`, inspect affected existing code before task planning:
architecture boundaries, module/component responsibility, data flow,
testability, verification commands, design-system usage, and technical debt.
Record \`legacyPreflight\` with required/performed/affectedAreas/hasIssues/issues.
If issues exist, ask the user to choose:

- [ ] 仅完成本次需求，不做重构
- [ ] 做最小必要重构，只处理会阻塞本次需求的部分
- [ ] 将相关模块一起重构到项目规范

Map the answer to \`refactorPolicy\`: \`none\`, \`minimal\`, or \`full\`, and
record \`userDecision\`.

## Step 4: Generate Design
Write \`docs/designs/design.md\` with architecture, tech stack, components, data flow, and task list in YAML.
Follow the proposal test strategy: automated UI testing requires UI flows plus
a testing task or UI verification command; unit testing requires unit targets
and unit test commands/files. Do not force unselected test types.
If \`changeMode=existing\`, include \`## Legacy Preflight\` and keep tasks within
the selected refactorPolicy.

## Step 5: Update State
Update .nova.yaml: designDoc, tasks. Prefer \`nova checkpoint artifacts --design-doc docs/designs/design.md --legacy-preflight '<json>'\` when \`changeMode=existing\`. Run \`nova validate\`, then \`nova checkpoint phase design --status done\`.
`,

  'nova-implement.md': () => `---
description: Nova implement phase — execute tasks with evidence
---

# Nova Implement Phase

## Step 1: Verify State
Read .nova.yaml. Require phases.design.status = done. Update phases.implement.status to in-progress with \`nova checkpoint phase implement --status in-progress\` when available.

## Step 2: Load Tasks
Show task summary. Confirm before proceeding.

## Step 3: Execute Each Task
For each task: implement, write only the selected unit/UI tests from testStrategy,
verify, record evidence with \`nova checkpoint task <task-id>\` (tests, filesChanged).
Use \`nova context --task-id <id>\`; if legacyPreflight is present, stay within
its refactorPolicy and record regression evidence for existing behavior.
On failure: abort, skip, or retry.

## Step 4: Final Verification
Run full test suite and type check.

## Step 5: Update State
Run \`nova guard implement verify\`, then set phases.implement.status = done with \`nova checkpoint phase implement --status done\`.
`,

  'nova-verify.md': (mcp) => `---
description: Nova verify phase — run code review and security review
---

# Nova Verify Phase

## Step 1: Verify State
Read .nova.yaml. Require phases.implement.status = done. Update phases.verify.status to in-progress with \`nova checkpoint phase verify --status in-progress\` when available.

## Step 2: Gather Context
Load tasks, changed files, design document.

## Step 3: Code Review
Review changed files for correctness, conventions, error handling, test coverage.
Run automated UI verification only when automatedUiTesting=true. Run unit tests
only when unitTesting=true. Unselected test types are not failure conditions.
If changeMode=existing, verify implementation stayed within refactorPolicy and
existing behavior regression evidence is present.

## Step 4: Security Review
Audit for injection risks, secret exposure, insecure dependencies.
${mcp?.mobile ? MOBILE_STEP : ''}

## Step 5: Generate Report
Write docs/reports/verification-report.md.

## Step 6: Update State
Run \`nova checkpoint artifacts --verification-report docs/reports/verification-report.md\`, then \`nova validate\`, then set phases.verify.status = done with \`nova checkpoint phase verify --status done\`.
`,

  'nova-iterate.md': () => `---
description: Nova iterate — roll back to a previous phase
---

# Nova Iterate Phase

## Step 1: Detect Current Phase
Read .nova.yaml. Determine active phase and valid rollback targets.

## Step 2: Present Options
Show rollback targets. Ask: which phase, why, keep or discard work?

## Step 3: Execute Rollback
Reset target phase and subsequent phases to pending.

## Step 4: Record Iteration
Add to .nova.yaml metadata.history.
`,

  'nova-status.md': () => `---
description: Nova status — display phase progress
---

# Nova Status

## Step 1: Load State
Read .nova.yaml. Parse all phase statuses.

## Step 2: Display Summary
Show each phase with status icon and key artifacts.

## Step 3: Detect Issues
Flag: stuck phases, failed tasks, missing artifacts.
`,

  'nova-detect.md': () => `---
description: Nova detect — check installation status of tools and provide install instructions
---

# Nova Detect

Run \`nova detect --agent pi-coding-agent\` to check required, recommended, and
optional Nova-enhancing tools from a Pi Coding Agent session. Use
\`nova detect --agent pi-coding-agent --json\` when structured output is useful.

## What To Report

- **Required**: Nova project state such as \`.nova.yaml\`; missing required items block use in the current project.
- **Recommended**: OpenSpec, Superpowers, and affaan-m/ECC; missing items mean Nova uses compatible mode.
- **Optional**: CodeGraph, Figma MCP, and Mobile MCP; missing items only limit enhanced workflows.

For each missing or partial item, show the install guidance from \`nova detect\`.
Do not imply that every tool must be installed before Nova can be used.

## Fallback

If the \`nova\` CLI is unavailable, explain that \`nova detect\` is the preferred
deterministic check and ask the user to install Nova or use the local project build.
`,
};

export class PiCodingAgentAdapter implements EnvironmentAdapter {
  name = 'pi-coding-agent';

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
    for (const [filename, templateFn] of Object.entries(PI_SKILL_TEMPLATES)) {
      const skillName = filename.replace('.md', '');
      const skillDir = path.join(agentsSkillsDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await this.writeSkillFile(path.join(skillDir, 'SKILL.md'), templateFn(mcpServers));
      const linkPath = path.join(claudeSkillsDir, skillName);
      try { await fs.access(linkPath); continue; } catch {}
      try { await fs.symlink(skillDir, linkPath); } catch {}
    }
  }

  private async writeToProjectSkills(cwd: string, mcpServers?: McpServers) {
    const skillsDir = path.join(cwd, '.claude', 'skills');
    for (const [filename, templateFn] of Object.entries(PI_SKILL_TEMPLATES)) {
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
