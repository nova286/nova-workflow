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
2. Do not hardcode an iOS simulator model such as iPhone 16 unless the user or
   project rules explicitly require it. Prefer the current project, XcodeBuildMCP,
   or Mobile MCP simulator default; otherwise choose an available compatible simulator.
3. For each key user flow:
   - Navigate to screen
   - Take screenshot
   - Query accessibility tree (element labels, states)
   - Compare against design tokens from \`docs/designs/design.md\`
4. Fill \`## UI Verification\` section in \`docs/reports/verification-report.md\`:
   - Screenshot gallery with captions
   - Element state audit (missing labels, wrong states)
   - Design token compliance check
5. Flag discrepancies as UI findings with severity
`;

export const UI_UX_PRO_MAX_WORKFLOW = `
## UI/UX Pro Max Gate

When the user's request changes UI, UX, visual design, layout, interaction,
frontend components, screens, flows, accessibility, or design-system behavior:

1. Run \`nova detect --json\` for the active Agent and check \`ui-ux-pro-max\`.
2. If UI UX Pro Max is missing or partial:
   - Show the install guidance from \`nova detect\`.
   - Ask whether the user wants to install it now.
   - If they install it, rerun \`nova detect --json\` before continuing.
   - If they continue without it, record this limitation in the current Nova artifact.
3. If UI UX Pro Max is available, use the **UI UX Pro Max skill** before
   finalizing UI requirements, design tasks, implementation, or verification.
4. Capture UI/UX decisions as concrete acceptance criteria: screen states,
   responsive behavior, accessibility, visual hierarchy, interaction states,
   design-system alignment, and regression risks.
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
   - 如果需求涉及 UI/UX、页面、组件、交互、视觉、可访问性或设计系统，先运行 nova detect --agent ${agentId} --json 检查 UI UX Pro Max；可用时必须激活该 skill，缺失时提示安装 nextlevelbuilder/ui-ux-pro-max-skill（npx uipro-cli init --ai ${agentId === 'claude-code' ? 'claude' : agentId}）并记录限制
   - 如果需求里有 Figma 链接，先运行 nova detect --agent ${agentId} --json 检查 Figma MCP
   - 如果 Figma MCP 未配置，提示用户现在配置，并在用户配置后重新检测
   - Figma MCP 可用后，必须确认这是存量页面修改还是增量新页面
   - 存量页面要确认现有 route/screen/component；增量页面要确认新页面入口和跳转路径
   - spec 必须记录 Figma URL、node IDs、页面模式、入口路径，以及实现阶段需要按当前项目导出的切图/图片/icon 资产
3. 在生成 proposal 前，确认 changeMode：existing（修改存量业务/页面/组件/API）、incremental（新增但接入现有入口/流程）、new（独立新能力）。如果是 existing，记录 affectedAreas，并标记 design 阶段必须执行 legacyPreflight
4. 做轻量 Project Context discovery：记录规则来源、projectType、主要技术栈和明显风险到 proposal；不要在 propose 阶段写正式 .nova.yaml.projectContext，正式 Project Context Contract 由 design 生成/刷新
5. 在生成 proposal 前，必须用 Markdown checklist 让用户确认本次测试策略，不得自行跳过：
   - [ ] 自动化 UI 测试
   - [ ] UI 还原度测试
   - [ ] 单元测试
   自动化 UI 测试用于和改版前/基线页面对比，适合逻辑修改时防止 UI 被改坏；如果选择它，先确定入口、跳转路径、关键步骤和成功断言；AI 能从代码/Figma/导航确定就自行确定，不能确定就问用户。
   UI 还原度测试用于和设计稿/Figma/参考图对比，适合视觉还原；如果选择它，先确定 designRef、routeOrScreen、关键状态、acceptanceThreshold，以及是否需要 Mobile MCP/Figma MCP。
   如果需求一次涉及多个页面/screen/route/tab/flow，先列出页面清单让用户确认范围；每个页面都要有自己的 routeOrScreen 和 designRef/Figma node/reference，不能用一个宽泛 UI 目标覆盖全部页面。
6. 写入 .openspec/changes/<change-id>/proposal.md 和 specs，并记录 changeMode、affectedAreas、testStrategy（必须包含 automatedUiTesting、uiFidelityTesting、unitTesting）
7. 用 nova checkpoint artifacts --change-mode existing|incremental|new --test-strategy '<json>' 记录 proposal、specDelta、activeChange、changeMode 和 testStrategy
8. 运行 nova validate
9. 用 nova checkpoint phase propose --status done 记录完成
\`\`\`

### Phase 2: Design (设计)
\`\`\`
读取 activeChange 对应的 OpenSpec-compatible change，生成执行计划。
1. 读 proposal/spec delta 和实际源码/工程结构了解架构；不要假设一定存在 src/，iOS/Swift/XcodeGen 项目应读取 project.yml、*.xcodeproj、Sources/、App/、Tests/ 等真实目录
2. 必须读取当前项目目录声明的规范文件（如 AGENTS.md、CLAUDE.md、CODEX.md、README.md、.cursorrules、.cursor/rules/），以及将要触碰子目录内更近的 AGENTS.md/规范文件；提取强制规则、禁止事项、验证命令和编码约定
3. 必须根据 .nova.yaml 的 projectType、package/go.mod/pyproject/project.yml/Package.swift/*.xcodeproj/pubspec.yaml 等项目元数据和现有代码，识别当前项目类型的最佳实践（架构边界、框架惯例、错误处理、测试策略、性能/安全默认项）；不得因为存在 package.json 就把非 Node 工程按前端/Node 项目处理；如果本地项目规范和通用最佳实践冲突，本地项目规范优先，但需要记录理由
4. 如果 changeMode=existing，先对 affectedAreas 做 legacyPreflight：检查架构边界、职责拆分、数据流、可测试性、验证命令、设计系统/项目规范、项目类型最佳实践、会影响本次需求的技术债
5. 如果 legacyPreflight.hasIssues=true，用 Markdown checklist 询问用户重构策略：
   - [ ] 仅完成本次需求，不做重构
   - [ ] 做最小必要重构，只处理会阻塞本次需求的部分
   - [ ] 将相关模块一起重构到项目规范
   并映射 refactorPolicy: none|minimal|full
6. 生成/刷新 Project Context Contract（.nova.yaml.projectContext，可同时引用 artifacts.projectContext），必须包含 rules.sources/must/mustNot/verificationCommands、bestPractices.projectType/sources/must/should/risks 和 conflicts；conflicts 必须是数组，空则写 []，每项必须含 projectRule、bestPractice、resolution、rationale，resolution 只能用 project-rule、best-practice 或 case-by-case
7. 写入 docs/designs/design.md 和 docs/superpowers/plans/<change>.md，包含 Project Rules/Conventions、Project Type Best Practices 摘要、Project Context Contract 摘要和 Legacy Preflight 结论；多页面 UI 任务必须先按 page/screen/route/tab/flow 拆分，再按 major component/state/asset-or-token/data-binding/navigation/verification 拆细。控件/组件选择优先级为项目规范 > 既有相邻代码偏好 > 平台最佳实践。iOS 重复列表/网格/feeds 默认优先 UICollectionView、UITableView、SwiftUI List、LazyVStack 或 LazyVGrid，除非项目规范或明确技术原因要求 UIScrollView。
8. 根据 testStrategy 生成测试用例：自动化 UI 测试要有 flow/testing task；UI 还原度测试要有 uiFidelityTargets 和 design/visual fidelity testing task；单元测试要有 unit targets 和 test commands；未选择的测试类型不强制生成
9. 任务必须包含 method, specRefs, acceptanceRefs, verification.commands, complianceRefs.projectRules, complianceRefs.bestPractices；specRefs/acceptanceRefs 必须引用 OpenSpec-compatible requirement/acceptance id，不能留空或只写自然语言；任务必须遵守项目规范、项目类型最佳实践和 refactorPolicy，任何偏离必须写明理由
10. 用 nova checkpoint artifacts --design-doc 记录设计产物，并用 --project-context '<json>' 记录 Project Context Contract；existing 场景还要加 --legacy-preflight '<json>'
11. 运行 nova validate
12. 用 nova checkpoint phase design --status done 记录完成
\`\`\`

### Phase 3: Implement (实现)
\`\`\`
读取 .nova.yaml 中的 spec-bound tasks，逐个实现：
1. 按 priority/dependency 排序执行
2. 每个任务先运行 nova context --task-id <id> 获取上下文
3. 在修改任何文件前，必须读取当前项目目录和目标文件子目录声明的规范文件（AGENTS.md、CLAUDE.md、CODEX.md、README.md、.cursorrules、.cursor/rules/ 等）；若规范与通用 Nova 指令冲突，优先遵守项目规范
4. 必须读取 context.projectContext（Project Context Contract）和 task complianceRefs，遵守 project rules 与 project type best practices；如果确实需要偏离，必须在 compliance.deviations/evidence/总结中写明充分理由
5. method=tdd 时先写失败测试，再实现，再重构
6. 如果 context.designContext.legacyPreflight 存在，严格遵守 refactorPolicy，不临时扩大重构范围
7. 根据 testStrategy 编写被选择的单元测试、自动化 UI 脚本或 UI 还原度测试；未选择的测试类型不强制补写
8. 如果任务涉及 UI/UX、页面、组件、交互、视觉、可访问性或设计系统，先运行 nova detect --agent ${agentId} --json 检查 UI UX Pro Max；可用时必须使用该 skill 指导实现，缺失时记录限制和安装提示
9. 跑 verification.commands，用 nova checkpoint task 记录 tests/filesChanged/traceIds evidence，并用 --compliance '<json>' 记录 compliance.followed 和 compliance.deviations；列出所有偏离及理由
10. 失败时问用户：abort / skip / retry
11. 全部完成后运行 nova guard implement verify，再用 nova checkpoint phase implement --status done
\`\`\`

### Phase 4: Verify (验证)
\`\`\`
对已修改的文件做 spec conformance + code review + security review：
1. 默认启动独立验证子智能体/独立 reviewer context；主智能体只负责编排、运行命令、写 checkpoint，不得自行给 PASS
2. 如果环境不支持子智能体，使用 fresh-context review：重新读取 artifacts/evidence/changed files，不沿用 implement 阶段的解释；仍不可用时才使用 same-session-fallback，并必须记录 rationale
3. Spec conformance: evidence 是否覆盖 specRefs/acceptanceRefs
4. Project rules conformance: 基于 Project Context Contract 校验当前项目声明的规范（AGENTS.md/CLAUDE.md/CODEX.md/README.md/.cursorrules/.cursor/rules/ 等）是否被遵守；不符合必须检查 compliance.deviations/evidence 中的偏离理由，理由不充分直接 CHANGES_REQUESTED
5. Project type best-practice conformance: 基于 Project Context Contract 校验当前项目类型最佳实践是否被遵守；不符合必须给出充分理由，理由不充分直接 CHANGES_REQUESTED
6. Code review: 正确性、错误处理、类型安全、测试覆盖
7. Security review: 注入、密钥暴露、路径遍历
8. 必须执行 Project Context Contract 中 rules.verificationCommands 的所有命令（包括 build/compile/typecheck/test）；任一命令失败或跳过，都不得 PASS
9. 根据 testStrategy 执行已选择的测试：自动化 UI 测试优先用 Mobile MCP 或项目 E2E runner 做基线/当前页面回归对比；UI 还原度测试必须读取 testStrategy.uiFidelityTargets、testStrategy.uiFlows、task.figma、phases.propose.figma 或 artifacts.figmaTraceability 中的 designRef、routeOrScreen、entryPoint 和跳转路径，自行启动/打开应用，按入口和步骤导航到目标页面，截图当前实现并与 Figma/designRef/reference screenshot 对照；只有路径、设计引用或工具配置缺失且无法从代码/设计文档推导时，才标记 BLOCKED 并写明 blockedReason；单元测试运行对应命令；未选择的测试类型不作为失败条件
10. 如果改动涉及 UI/UX，运行 nova detect --agent ${agentId} --json 检查 UI UX Pro Max；可用时必须用该 skill 做 UI/UX 验证 verdict（视觉层级、响应式、交互状态、可访问性、设计系统一致性），缺失时在报告中记录限制
11. 写入 docs/reports/verification-report.md，包含 reviewIndependence、verificationCommands、Project Context Contract verdicts: projectRulesVerdict 和 bestPracticesVerdict（PASS / CHANGES_REQUESTED / BLOCKED），以及所有偏离、理由和是否接受
12. 只有当 spec、本地项目规范、项目类型最佳实践、required verification commands、代码审查、安全审查都 PASS，才能用 nova checkpoint phase verify --status done；否则不要标记完成
13. 用 nova checkpoint artifacts --verification-report 记录验证报告，并记录 --project-rules-verdict PASS、--best-practices-verdict PASS（或包含 deviations 的 JSON verdict）、--review-independence '<json>' 和 --verification-commands '<json>'
\`\`\`

### Phase 5: Archive (归档)
\`\`\`
运行 /nova-archive 或 nova archive 合并产物并清理。archive 会把 proposal、design、verification 复制到 Docs/specs/completed/，把归档路径写入 .nova.yaml 的 metadata.history，删除 state 中记录或可由 activeChange 推导的源文档、OpenSpec change、Superpowers plan 和临时 contexts，然后重置当前 workflow 状态，避免下一轮继续指向旧任务文档。
\`\`\`

## Key Rules

- Always read \`.nova.yaml\` before any action
- Design must generate/refresh the Project Context Contract in \`.nova.yaml.projectContext\`; implement must consume it through \`nova context --task-id\`; verify must reject weak or missing deviation rationale
- Always obey project-local instruction files before Nova defaults: \`AGENTS.md\`, \`CLAUDE.md\`, \`CODEX.md\`, \`README.md\`, \`.cursorrules\`, \`.cursor/rules/\`, and closer directory-specific rule files for files you touch
- Always account for project type best practices from \`.nova.yaml.projectType\`, project metadata, and existing code; deviations require explicit, sufficient rationale and must be rejected in verify when the rationale is weak
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
  'nova-detect.md': 'Nova detect — check installation status of CodeGraph, OpenSpec, UI UX Pro Max, Figma-mcp, Superpowers, affaan-m/ECC, mobile-mcp and provide install instructions',
};
