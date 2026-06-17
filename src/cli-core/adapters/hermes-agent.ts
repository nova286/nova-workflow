import * as fs from 'fs/promises';
import * as path from 'path';
import { EnvironmentAdapter } from '../types';
import { genericAgentInstructions } from './skill-templates';

const HERMES_INSTRUCTIONS = `# Nova Workflow

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
   - 如果需求里有 Figma 链接，先运行 nova detect --agent hermes-agent --json 检查 Figma MCP
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
1. 读 proposal/spec delta 和实际源码/工程结构了解架构；不要假设一定存在 src/，iOS/Swift/XcodeGen 项目应读取 project.yml、*.xcodeproj、Sources/、App/、Tests/ 等真实目录
2. 写入 docs/designs/design.md 和 docs/superpowers/plans/<change>.md
3. 任务必须包含 method, specRefs, acceptanceRefs, verification.commands；specRefs/acceptanceRefs 必须引用 OpenSpec-compatible requirement/acceptance id，不能留空或只写自然语言
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

## Key Rules

- Always read \`.nova.yaml\` before any action
- Use \`nova next\`, \`nova validate\`, and \`nova checkpoint\` for deterministic workflow decisions and state writes
- After each task, run task verification commands, then project checks when needed
- Do not mark a task done without spec/acceptance evidence
- Never leave TODOs or stubs
- Update \`.nova.yaml\` status after each phase transition
`;

export class HermesAgentAdapter implements EnvironmentAdapter {
  name = 'hermes-agent';

  async setup(cwd: string) {
    const filePath = path.join(cwd, 'HERMES.md');
    try {
      await fs.access(filePath);
      return;
    } catch {}
    await fs.writeFile(filePath, genericAgentInstructions('hermes-agent'), 'utf-8');
  }
}
