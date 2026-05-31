import * as fs from 'fs/promises';
import * as path from 'path';
import { EnvironmentAdapter } from '../types';

const OPENCLAW_INSTRUCTIONS = `# Nova Workflow

This project uses Nova — an AI-assisted development workflow with 5 phases.
Nova orchestrates OpenSpec-compatible specs, Superpowers-compatible execution,
and ECC (Everything Claude Code) compatible review. All state is in \`.nova.yaml\`. Always read it first.

## How to Use

### Check Status
\`\`\`
读取 .nova.yaml，告诉我当前在哪个阶段，下一步该做什么
\`\`\`

### Phase 1: Propose (提案)
\`\`\`
帮我为"{你的需求描述}"创建 OpenSpec-compatible change。
1. 先读 .nova.yaml 和已有代码了解项目
2. 问 3-4 个澄清问题
3. 写入 .openspec/changes/<change-id>/proposal.md 和 specs
4. 更新 .nova.yaml: activeChange, artifacts.*, phases.propose.status = done
\`\`\`

### Phase 2: Design (设计)
\`\`\`
读取 activeChange 对应的 OpenSpec-compatible change，生成执行计划。
1. 读 proposal/spec delta 和 src/ 了解架构
2. 写入 docs/designs/design.md 和 docs/superpowers/plans/<change>.md
3. 任务必须包含 method, specRefs, acceptanceRefs, verification.commands
4. 更新 .nova.yaml: phases.design.status = done, tasks = 解析后的列表
\`\`\`

### Phase 3: Implement (实现)
\`\`\`
读取 .nova.yaml 中的 spec-bound tasks，逐个实现：
1. 按 priority/dependency 排序执行
2. 每个任务先解析 specRefs/acceptanceRefs/method
3. method=tdd 时先写失败测试，再实现，再重构
4. 跑 verification.commands，记录 tests/filesChanged/traceIds evidence
5. 失败时问用户：abort / skip / retry
6. 全部完成后更新 phases.implement.status = done
\`\`\`

### Phase 4: Verify (验证)
\`\`\`
对已修改的文件做 spec conformance + code review + security review：
1. Spec conformance: evidence 是否覆盖 specRefs/acceptanceRefs
2. Code review: 正确性、错误处理、类型安全、测试覆盖
3. Security review: 注入、密钥暴露、路径遍历
4. 写入 docs/reports/verification-report.md
5. 更新 phases.verify.status = done
\`\`\`

### Phase 5: Archive (归档)
\`\`\`
运行 nova archive 合并产物并清理
\`\`\`

## Key Rules

- Always read \`.nova.yaml\` before any action
- After each task, run task verification commands, then project checks when needed
- Do not mark a task done without spec/acceptance evidence
- Never leave TODOs or stubs
- Update \`.nova.yaml\` status after each phase transition
`;

export class OpenClawAdapter implements EnvironmentAdapter {
  name = 'openclaw';

  async setup(cwd: string) {
    const dir = path.join(cwd, '.openclaw');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'instructions.md');
    try {
      await fs.access(filePath);
      return;
    } catch {}
    await fs.writeFile(filePath, OPENCLAW_INSTRUCTIONS, 'utf-8');
  }
}
