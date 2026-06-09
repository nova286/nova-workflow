import { McpServers } from '../types';

export const FIGMA_STEP = `
## Step 3.5: Read Figma Design (Figma MCP detected)

1. Use Figma MCP to get file metadata and pages
2. For each relevant frame/component:
   - Extract color tokens (fills, strokes → RGBA)
   - Extract typography (font family, size, weight, line height)
   - Extract spacing (auto-layout padding, item spacing)
   - Extract component properties and variants
3. Generate \`## Design Tokens\` section in \`docs/designs/design.md\`:
   - Color palette table
   - Typography scale table
   - Spacing system table
   - Component inventory with props
4. Reference Figma node IDs for traceability
`;

export const MOBILE_STEP = `
## Step 5.5: UI Verification (Mobile MCP detected)

1. Build and launch app in simulator via Mobile MCP
2. For each key user flow:
   - Navigate to screen
   - Take screenshot
   - Query accessibility tree (element labels, states)
   - Compare against design tokens from \`docs/designs/design.md\`
3. Fill \`## UI Verification\` section in \`docs/reports/verification-report.md\`:
   - Screenshot gallery with captions
   - Element state audit (missing labels, wrong states)
   - Design token compliance check
4. Flag discrepancies as UI findings with severity
`;

export type SkillTemplateFn = (mcp?: McpServers) => string;

export function genericAgentInstructions(agentId: string): string {
  return `# Nova Workflow

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
   - 如果需求里有 Figma 链接，先运行 nova detect --agent ${agentId} --json 检查 Figma MCP
   - 如果 Figma MCP 未配置，提示用户现在配置，并在用户配置后重新检测
   - Figma MCP 可用后，必须确认这是存量页面修改还是增量新页面
   - 存量页面要确认现有 route/screen/component；增量页面要确认新页面入口和跳转路径
   - spec 必须记录 Figma URL、node IDs、页面模式、入口路径，以及实现阶段需要按当前项目导出的切图/图片/icon 资产
3. 在生成 proposal 前，确认 changeMode：existing（修改存量业务/页面/组件/API）、incremental（新增但接入现有入口/流程）、new（独立新能力）。如果是 existing，记录 affectedAreas，并标记 design 阶段必须执行 legacyPreflight
4. 在生成 proposal 前，用 Markdown checklist 让用户确认本次测试策略：
   - [ ] 自动化 UI 测试
   - [ ] 单元测试
   如果选择自动化 UI 测试，先确定入口、跳转路径、关键步骤和成功断言；AI 能从代码/Figma/导航确定就自行确定，不能确定就问用户。
5. 写入 .openspec/changes/<change-id>/proposal.md 和 specs，并记录 changeMode、affectedAreas、testStrategy
6. 用 nova checkpoint artifacts --change-mode existing|incremental|new --test-strategy '<json>' 记录 proposal、specDelta、activeChange、changeMode 和 testStrategy
7. 运行 nova validate
8. 用 nova checkpoint phase propose --status done 记录完成
\`\`\`

### Phase 2: Design (设计)
\`\`\`
读取 activeChange 对应的 OpenSpec-compatible change，生成执行计划。
1. 读 proposal/spec delta 和 src/ 了解架构
2. 如果 changeMode=existing，先对 affectedAreas 做 legacyPreflight：检查架构边界、职责拆分、数据流、可测试性、验证命令、设计系统/项目规范、会影响本次需求的技术债
3. 如果 legacyPreflight.hasIssues=true，用 Markdown checklist 询问用户重构策略：
   - [ ] 仅完成本次需求，不做重构
   - [ ] 做最小必要重构，只处理会阻塞本次需求的部分
   - [ ] 将相关模块一起重构到项目规范
   并映射 refactorPolicy: none|minimal|full
4. 写入 docs/designs/design.md 和 docs/superpowers/plans/<change>.md，包含 Legacy Preflight 结论
5. 根据 testStrategy 生成测试用例：自动化 UI 测试要有 flow/testing task；单元测试要有 unit targets 和 test commands；未选择的测试类型不强制生成
6. 任务必须包含 method, specRefs, acceptanceRefs, verification.commands，并遵守 refactorPolicy
7. 用 nova checkpoint artifacts --design-doc 记录设计产物；existing 场景还要加 --legacy-preflight '<json>'
8. 运行 nova validate
9. 用 nova checkpoint phase design --status done 记录完成
\`\`\`

### Phase 3: Implement (实现)
\`\`\`
读取 .nova.yaml 中的 spec-bound tasks，逐个实现：
1. 按 priority/dependency 排序执行
2. 每个任务先运行 nova context --task-id <id> 获取上下文
3. method=tdd 时先写失败测试，再实现，再重构
4. 如果 context.designContext.legacyPreflight 存在，严格遵守 refactorPolicy，不临时扩大重构范围
5. 根据 testStrategy 编写被选择的单元测试或自动化 UI 脚本；未选择的测试类型不强制补写
6. 跑 verification.commands，用 nova checkpoint task 记录 tests/filesChanged/traceIds evidence
7. 失败时问用户：abort / skip / retry
8. 全部完成后运行 nova guard implement verify，再用 nova checkpoint phase implement --status done
\`\`\`

### Phase 4: Verify (验证)
\`\`\`
对已修改的文件做 spec conformance + code review + security review：
1. Spec conformance: evidence 是否覆盖 specRefs/acceptanceRefs
2. Code review: 正确性、错误处理、类型安全、测试覆盖
3. Security review: 注入、密钥暴露、路径遍历
4. 根据 testStrategy 执行已选择的测试：自动化 UI 测试优先用 Mobile MCP 或项目 E2E runner，单元测试运行对应命令；未选择的测试类型不作为失败条件
5. 写入 docs/reports/verification-report.md
6. 用 nova checkpoint artifacts --verification-report 记录验证报告
7. 用 nova checkpoint phase verify --status done 记录完成
\`\`\`

### Phase 5: Archive (归档)
\`\`\`
运行 /nova-archive 或 nova archive 合并产物并清理。archive 会把 proposal、design、verification 复制到 docs/specs/，更新 .nova.yaml 指向归档副本，并删除 state 中记录的源文档、OpenSpec change、Superpowers plan 和临时 contexts。
\`\`\`

## Key Rules

- Always read \`.nova.yaml\` before any action
- Use \`nova next\`, \`nova validate\`, \`nova guard\`, \`nova context\`, and \`nova checkpoint\` for deterministic workflow decisions and state writes
- After each task, run task verification commands, then project checks when needed
- Do not mark a task done without spec/acceptance evidence
- Never leave TODOs or stubs
- Update \`.nova.yaml\` status after each phase transition
`;
}

export const SKILL_DESCRIPTIONS: Record<string, string> = {
  'nova.md': 'Nova — unified entry point. Shows progress and suggests next action.',
  'nova-propose.md': 'Nova propose phase — specify an OpenSpec-compatible change contract',
  'nova-design.md': 'Nova design phase — plan spec-bound work from an approved change',
  'nova-implement.md': 'Nova implement phase — execute spec-bound tasks with evidence',
  'nova-verify.md': 'Nova verify phase — run spec conformance, code, and security review',
  'nova-archive.md': 'Nova archive phase — finalize specs and clean source artifacts',
  'nova-iterate.md': 'Nova iterate — roll back to a previous phase for iteration',
  'nova-status.md': 'Nova status — display phase progress, task completion, and stuck detection',
  'nova-detect.md': 'Nova detect — check installation status of CodeGraph, OpenSpec, Figma-mcp, Superpowers, affaan-m/ECC, mobile-mcp and provide install instructions',
};
