import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { AdapterSetupOptions, EnvironmentAdapter } from '../types';
import { genericAgentInstructions } from './skill-templates';

const CODEX_INSTRUCTIONS = `# Nova Workflow

This project uses Nova — an AI-assisted development workflow with 5 phases.
Nova orchestrates OpenSpec-compatible specs, Superpowers-compatible execution,
and ECC (Everything Claude Code) compatible review. Long-running AI work happens
inside the active Agent session; the CLI is the fast deterministic kernel for
\`nova next\`, \`nova validate\`, \`nova guard\`, \`nova context\`,
\`nova checkpoint\`, and \`nova archive\`. All state is in \`.nova.yaml\`.
Always read it first.

## How to Use

### Check Status
\`\`\`
运行 nova next 或读取 .nova.yaml，告诉我当前在哪个阶段，下一步该做什么
\`\`\`

### Phase 1: Propose (提案)
\`\`\`
帮我为"{你的需求描述}"创建 OpenSpec-compatible change。
1. 先读 .nova.yaml 和已有代码了解项目
2. 问 3-4 个澄清问题
   - 如果需求里有 Figma 链接，先运行 nova detect --agent codex --json 检查 Figma MCP
   - 如果 Figma MCP 未配置，提示用户现在配置，并在用户配置后重新检测
   - Figma MCP 可用后，必须确认这是存量页面修改还是增量新页面
   - 存量页面要确认现有 route/screen/component；增量页面要确认新页面入口和跳转路径
   - spec 必须记录 Figma URL、node IDs、页面模式、入口路径，以及实现阶段需要按当前项目导出的切图/图片/icon 资产
3. 写入 .openspec/changes/<change-id>/proposal.md 和 specs
4. 运行 nova validate
5. 用 nova checkpoint phase propose --status done 记录完成
\`\`\`

### Phase 2: Design (设计)
\`\`\`
读取 activeChange 对应的 OpenSpec-compatible change，生成执行计划。
1. 读 proposal/spec delta 和 src/ 了解架构
2. 写入 docs/designs/design.md 和 docs/superpowers/plans/<change>.md
3. 任务必须包含 method, specRefs, acceptanceRefs, verification.commands
4. 运行 nova validate
5. 用 nova checkpoint phase design --status done 记录完成
\`\`\`

### Phase 3: Implement (实现)
\`\`\`
读取 .nova.yaml 中的 spec-bound tasks，逐个实现：
1. 按 priority/dependency 排序执行
2. 每个任务先解析 specRefs/acceptanceRefs/method
3. method=tdd 时先写失败测试，再实现，再重构
4. 跑 verification.commands，用 nova checkpoint task 记录 tests/filesChanged/traceIds evidence
5. 失败时问用户：abort / skip / retry
6. 全部完成后运行 nova guard implement verify，再用 nova checkpoint phase implement --status done
\`\`\`

### Phase 4: Verify (验证)
\`\`\`
对已修改的文件做 spec conformance + code review + security review：
1. Spec conformance: evidence 是否覆盖 specRefs/acceptanceRefs
2. Code review: 正确性、错误处理、类型安全、测试覆盖
3. Security review: 注入、密钥暴露、路径遍历
4. 写入 docs/reports/verification-report.md
5. 用 nova checkpoint phase verify --status done 记录完成
\`\`\`

### Phase 5: Archive (归档)
\`\`\`
运行 nova archive 合并产物并清理
\`\`\`

### Iteration (回退)
\`\`\`
我想回退到 {propose/design/implement} 阶段重新做
\`\`\`

## Key Rules

- Always read \`.nova.yaml\` before any action
- Use \`nova next\`, \`nova validate\`, and \`nova checkpoint\` for deterministic workflow decisions and state writes
- After each task, run task verification commands, then project checks when needed
- Do not mark a task done without spec/acceptance evidence
- Never leave TODOs or stubs
- Update \`.nova.yaml\` status after each phase transition
`;

export class CodexAdapter implements EnvironmentAdapter {
  name = 'codex';

  async setup(cwd: string, options?: AdapterSetupOptions) {
    await this.writeCodexInstructions(cwd);
    await this.writeSkills(cwd, options);
  }

  private async writeCodexInstructions(cwd: string) {
    const filePath = path.join(cwd, 'CODEX.md');
    try {
      await fs.access(filePath);
      return; // don't overwrite
    } catch {}
    await fs.writeFile(filePath, genericAgentInstructions('codex'), 'utf-8');
  }

  private async writeSkills(cwd: string, options?: AdapterSetupOptions) {
    const skillsDir = options?.skillsDir === 'user'
      ? await this.prepareUserSkillsDir(options.homeDir)
      : path.join(cwd, '.agents', 'skills');

    for (const [skillName, content] of Object.entries(CODEX_SKILLS)) {
      const skillDir = path.join(skillsDir, skillName);
      await fs.mkdir(skillDir, { recursive: true });
      await this.writeSkillFile(path.join(skillDir, 'SKILL.md'), content);
    }
  }

  private async prepareUserSkillsDir(homeDir = os.homedir()) {
    const agentsSkillsDir = path.join(homeDir, '.agents', 'skills');
    const codexSkillsDir = path.join(homeDir, '.codex', 'skills');
    await fs.mkdir(agentsSkillsDir, { recursive: true });

    try {
      await fs.lstat(codexSkillsDir);
    } catch {
      await fs.mkdir(path.dirname(codexSkillsDir), { recursive: true });
      try {
        await fs.symlink(agentsSkillsDir, codexSkillsDir, 'dir');
      } catch {
        await fs.mkdir(codexSkillsDir, { recursive: true });
      }
    }

    return codexSkillsDir;
  }

  private async writeSkillFile(filePath: string, content: string) {
    const newHash = crypto.createHash('md5').update(content).digest('hex');
    try {
      const existing = await fs.readFile(filePath, 'utf-8');
      const oldHash = crypto.createHash('md5').update(existing).digest('hex');
      if (oldHash === newHash) return;
    } catch {}
    await fs.writeFile(filePath, content, 'utf-8');
  }
}

const CODEX_SKILLS: Record<string, string> = {
  'nova': `---
description: Nova — unified entry point for Codex. Shows progress and suggests next action.
---

# Nova

Read \`.nova.yaml\` and present a compact overview with the next action.
Prefer \`nova next\` when available.

## Step 1: Read State
Run \`nova next\`. If \`.nova.yaml\` does not exist, tell the user to run
\`nova init\` first.

## Step 2: Suggest Next Action
Use the command returned by \`nova next\`:

- \`/nova-propose\`
- \`/nova-design\`
- \`/nova-implement\`
- \`/nova-verify\`
- \`/nova-archive\`

## Step 3: Act
Ask whether to run the suggested action unless the user already asked to
continue or execute the next phase.
`,

  'nova-propose': `---
description: Nova propose phase — specify an OpenSpec-compatible change contract
---

# Nova Propose Phase

## Step 1: Verify State
Read \`.nova.yaml\`. If propose is pending, run:

\`\`\`bash
nova checkpoint phase propose --status in-progress
\`\`\`

## Step 2: Gather Context
Read \`AGENTS.md\`, \`CODEX.md\`, \`README.md\`, package metadata, and relevant
source files.

## Step 3: Explore Requirements
Clarify the problem, alternatives, risks, success criteria, change mode, and test
strategy. For Figma links, run \`nova detect --agent codex --json\` and record
traceability or limitations.

## Step 4: Write Artifacts
Write compatible artifacts:

- \`.openspec/changes/<change-id>/proposal.md\`
- \`.openspec/changes/<change-id>/specs/...\`
- \`docs/proposals/proposal.md\`

Include change mode and test strategy.

## Step 5: Update State
Run \`nova checkpoint artifacts --proposal docs/proposals/proposal.md --spec-delta <spec-ref-or-path> --active-change <change-id> --change-mode existing|incremental|new --test-strategy '<json>'\`.
Then run \`nova validate\` and \`nova checkpoint phase propose --status done\`.
`,

  'nova-design': `---
description: Nova design phase — plan spec-bound work from an approved change
---

# Nova Design Phase

## Step 1: Verify State
Read \`.nova.yaml\`. Require propose to be done. Run:

\`\`\`bash
nova checkpoint phase design --status in-progress
\`\`\`

## Step 2: Load Context
Read the proposal/spec delta, \`AGENTS.md\`, \`CODEX.md\`, \`CLAUDE.md\`,
\`README.md\`, package metadata, and relevant source files. Also read
project-local rule files when present, including \`.cursorrules\`,
\`.cursor/rules/\`, and closer directory-specific \`AGENTS.md\` or instruction
files for affected areas.

Before planning tasks, extract mandatory project rules, forbidden patterns,
required libraries/frameworks, and verification commands. Project rules override
generic Nova guidance. Include a \`## Project Rules / Conventions\` summary in
\`docs/designs/design.md\`.

Also identify project type best practices from \`.nova.yaml.projectType\`,
project metadata such as \`package.json\`, \`go.mod\`, \`pyproject.toml\`, or
equivalent files, and the existing codebase. Capture architecture boundaries,
framework idioms, error handling, test strategy, security defaults, and
performance considerations for this project type. Include a
\`## Project Type Best Practices\` summary in \`docs/designs/design.md\`. If a
project rule conflicts with a generic best practice, follow the project rule and
record the rationale.

## Step 3: Plan
Produce \`docs/designs/design.md\` and
\`docs/superpowers/plans/<change-id>.md\`. Tasks must include concrete files,
method, specRefs, acceptanceRefs, acceptance criteria, and verification commands.
Tasks must also reference the relevant project rules/conventions they must obey
when touching code, plus the project type best practices they must follow. Any
planned deviation from either must include a clear rationale.
For existing changes, perform and record legacyPreflight before task planning.

## Step 4: Update State
Run \`nova checkpoint artifacts --design-doc docs/designs/design.md\`, include
\`--legacy-preflight '<json>'\` when required, then run \`nova validate\` and
\`nova checkpoint phase design --status done\`.
`,

  'nova-implement': `---
description: Nova implement phase — execute spec-bound tasks with evidence
---

# Nova Implement Phase

## Step 1: Verify State
Read \`.nova.yaml\`. Require design to be done. Run:

\`\`\`bash
nova checkpoint phase implement --status in-progress
\`\`\`

## Step 2: Execute Tasks
For each task, run \`nova context --task-id <id>\`. Before editing files, read
and obey the project-local instruction files that apply to the repository and
target paths: \`AGENTS.md\`, \`CODEX.md\`, \`CLAUDE.md\`, \`README.md\`,
\`.cursorrules\`, \`.cursor/rules/\`, and any closer directory-specific rule
files. If these rules conflict with generic Nova instructions, follow the
project rules.

Also read the design document's \`Project Type Best Practices\` section and
apply the best practices for the current \`.nova.yaml.projectType\` and detected
stack. If implementation must deviate from a project rule or best practice,
record a specific rationale in the task evidence; weak or missing rationale
will be rejected in verify.

Implement only the scoped work, run the task verification commands, confirm the
work follows applicable project rules/conventions and project type best
practices, and record evidence with \`nova checkpoint task <task-id>\`. Include
in the task summary/evidence which project rules, project type best practices,
and verification commands were followed. List any deviations with rationale.

## Step 3: Finish
Run project checks, \`nova guard implement verify\`, then
\`nova checkpoint phase implement --status done\`.
`,

  'nova-verify': `---
description: Nova verify phase — run spec conformance, code, and security review
---

# Nova Verify Phase

## Step 1: Verify State
Read \`.nova.yaml\`. Require implement to be done. Run:

\`\`\`bash
nova checkpoint phase verify --status in-progress
\`\`\`

## Step 2: Review
Review task evidence against specRefs/acceptanceRefs, inspect changed files for
correctness, and perform a security review. Also read applicable project-local
instruction files and the design document's \`Project Rules / Conventions\` and
\`Project Type Best Practices\` sections.

For each changed file and task, verify conformance with project-local rules
(\`AGENTS.md\`, \`CODEX.md\`, \`CLAUDE.md\`, \`README.md\`, \`.cursorrules\`,
\`.cursor/rules/\`, and closer directory-specific rules) and project type best
practices from \`.nova.yaml.projectType\`, project metadata, existing code
patterns, and the design document.

If code deviates from project rules or best practices, accept it only when the
task evidence or implementation notes provide a specific, sufficient rationale.
Weak, missing, or convenience-only rationale is \`CHANGES_REQUESTED\`; do not
allow verify to pass.

## Step 3: Report
Write \`docs/reports/verification-report.md\`, then run:

\`\`\`bash
nova checkpoint artifacts --verification-report docs/reports/verification-report.md
nova validate
nova checkpoint phase verify --status done
\`\`\`

Only mark verify done when spec conformance, project rules conformance, project
type best-practice conformance, code review, and security review all pass or
have sufficient documented rationale for every deviation. The report must list
every deviation, the stated rationale, and whether it was accepted.
`,

  'nova-archive': `---
description: Nova archive phase — finalize specs and clean source artifacts
---

# Nova Archive Phase

Use this skill when the Nova workflow is ready to archive.

## Step 1: Verify State
Read \`.nova.yaml\`. Require \`phases.verify.status: done\`. Run:

\`\`\`bash
nova guard verify archive
\`\`\`

Stop and report the guard failure if it fails.

## Step 2: Archive
Run:

\`\`\`bash
nova archive
\`\`\`

The CLI copies proposal, design, OpenSpec change, and verification artifacts into
\`docs/specs/\`, updates \`.nova.yaml\` to point at archived copies, removes
source artifacts recorded in state, removes recorded OpenSpec/Superpowers
planning artifacts, and clears temporary Nova contexts.

## Step 3: Confirm Completion
Run \`nova next\` or read \`.nova.yaml\` to confirm the workflow is complete.
Summarize the archived files and cleaned artifacts from the CLI output.

## Constraints
- Do not manually delete source code files.
- If \`nova archive\` fails, report the exact artifact or guard issue.
`,

  'nova-iterate': `---
description: Nova iterate — roll back to a previous phase for iteration
---

# Nova Iterate

Read \`.nova.yaml\`, identify the current phase and valid rollback target, ask
the user which phase to return to, then reset that phase and later phases while
preserving source files unless the user explicitly asks to discard work.
`,

  'nova-status': `---
description: Nova status — display phase progress and issues
---

# Nova Status

Run \`nova status\` or read \`.nova.yaml\`. Show each phase status, key
artifacts, task completion, and any missing or stale evidence.
`,

  'nova-detect': `---
description: Nova detect — check installation status of tools and integrations
---

# Nova Detect

Run:

\`\`\`bash
nova detect --agent codex
\`\`\`

Use \`--json\` when structured output helps. Report required, recommended, and
optional tool status without auto-installing anything.
`,
};
