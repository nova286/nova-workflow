import * as fs from 'fs/promises';
import * as path from 'path';
import { EnvironmentAdapter } from '../types';

const HERMES_INSTRUCTIONS = `# Nova Workflow

This project uses Nova — an AI-assisted development workflow with 5 phases.
All state is in \`.nova.yaml\`. Always read it first.

## How to Use

### Check Status
\`\`\`
读取 .nova.yaml，告诉我当前在哪个阶段，下一步该做什么
\`\`\`

### Phase 1: Propose (提案)
\`\`\`
帮我为"{你的需求描述}"写一个 proposal。
1. 先读 .nova.yaml 和已有代码了解项目
2. 问 3-4 个澄清问题
3. 写入 docs/proposals/proposal.md
4. 更新 .nova.yaml: phases.open.status = done
\`\`\`

### Phase 2: Design (设计)
\`\`\`
读取 docs/proposals/proposal.md，生成技术设计文档。
1. 读 proposal 和 src/ 了解架构
2. 写入 docs/designs/design.md，包含架构、组件、YAML 任务列表
3. 更新 .nova.yaml: phases.design.status = done, tasks = 解析后的列表
\`\`\`

### Phase 3: Implement (实现)
\`\`\`
读取 .nova.yaml 中的 tasks，逐个实现：
1. 按 priority 排序执行
2. 每个任务：写代码 → tsc --noEmit → npm test → 更新 task status = done
3. 失败时问用户：abort / skip / retry
4. 全部完成后更新 phases.build.status = done
\`\`\`

### Phase 4: Verify (验证)
\`\`\`
对已修改的文件做 code review + security review：
1. Code review: 正确性、错误处理、类型安全、测试覆盖
2. Security review: 注入、密钥暴露、路径遍历
3. 写入 docs/designs/verification-report.md
4. 更新 phases.verify.status = done
\`\`\`

### Phase 5: Archive (归档)
\`\`\`
运行 nova archive 合并产物并清理
\`\`\`

## Key Rules

- Always read \`.nova.yaml\` before any action
- After each task, run \`npx tsc --noEmit\` and \`npm test\`
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
    await fs.writeFile(filePath, HERMES_INSTRUCTIONS, 'utf-8');
  }
}
