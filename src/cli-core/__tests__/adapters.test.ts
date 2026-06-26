import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeAdapter } from '../adapters/claude-code';
import { CodexAdapter } from '../adapters/codex';
import { OpenClawAdapter } from '../adapters/openclaw';
import { HermesAgentAdapter } from '../adapters/hermes-agent';
import { OpenCodeAdapter } from '../adapters/opencode';
import { PiCodingAgentAdapter } from '../adapters/pi-coding-agent';

describe('Environment Adapters', () => {
  let testDir: string;
  let originalHome: string | undefined;

  function expectTestStrategyChecklist(content: string) {
    expect(content).toContain('[ ] 自动化 UI 测试');
    expect(content).toContain('[ ] UI 还原度测试');
    expect(content).toContain('[ ] 单元测试');
    expect(content).toContain('testStrategy');
    expect(content).toContain('uiFidelityTesting');
    expect(content).toContain('uiFidelityTargets');
    expect(content).toMatch(/Do not skip|不得自行跳过|MUST/);
  }

  function expectUiFidelityVerification(content: string) {
    expect(content).toContain('testStrategy');
    expect(content).toContain('uiFidelityTesting');
    expect(content).toContain('uiFidelityTargets');
    expect(content).toContain('uiFlows');
    expect(content).toContain('artifacts.figmaTraceability');
    expect(content).toContain('routeOrScreen');
    expect(content).toContain('entryPoint');
    expect(content).toContain('designRef');
    expect(content).toMatch(/capture a fresh screenshot|截图当前实现|截图/);
    expect(content).toMatch(/Figma\/designRef\/reference screenshot|和 Figma|Figma\/designRef/);
    expect(content).toContain('blockedReason');
  }

  function expectLegacyPreflightRules(content: string) {
    expect(content).toContain('changeMode');
    expect(content).toContain('legacyPreflight');
    expect(content).toContain('[ ] 仅完成本次需求，不做重构');
    expect(content).toContain('[ ] 做最小必要重构，只处理会阻塞本次需求的部分');
    expect(content).toContain('[ ] 将相关模块一起重构到项目规范');
  }

  function expectProjectRulesInDesign(content: string) {
    expect(content).toContain('AGENTS.md');
    expect(content).toContain('CODEX.md');
    expect(content).toContain('CLAUDE.md');
    expect(content).toContain('.cursor/rules/');
    expect(content).toContain('Project Rules / Conventions');
    expect(content).toMatch(/Project rules override|higher priority/);
  }

  function expectBestPracticesInDesign(content: string) {
    expect(content).toContain('Project Type Best Practices');
    expect(content).toContain('.nova.yaml.projectType');
    expect(content).toMatch(/project metadata|package\.json/);
    expect(content).toContain('best practices');
    expect(content).toContain('rationale');
  }

  function expectProjectContextContractInDesign(content: string) {
    expect(content).toContain('Project Context Contract');
    expect(content).toContain('projectContext');
    expect(content).toContain('--project-context');
    expect(content).toContain('complianceRefs');
    expect(content).toContain('resolution');
    expect(content).toMatch(/project-rule.*best-practice.*case-by-case/s);
    expect(content).toMatch(/OpenSpec-compatible requirement|OpenSpec-compatible requirement\/acceptance|OpenSpec-compatible requirement and acceptance/);
  }

  function expectUiPlanningRulesInDesign(content: string) {
    expect(content).toMatch(/screen.*major component.*state|screen\/major component\/state/s);
    expect(content).toContain('UICollectionView');
    expect(content).toContain('UITableView');
    expect(content).toContain('UIScrollView');
    expect(content).toMatch(/project UI rules|项目规范/);
    expect(content).toMatch(/existing code preference|既有相邻代码偏好/);
    expect(content).toMatch(/platform best practices|平台最佳实践/);
  }

  function expectProjectRulesInImplement(content: string) {
    expect(content).toMatch(/[Bb]efore editing files/);
    expect(content).toContain('AGENTS.md');
    expect(content).toContain('CODEX.md');
    expect(content).toContain('CLAUDE.md');
    expect(content).toContain('.cursor/rules/');
    expect(content).toMatch(/[Ii]f these\s+rules conflict/);
    expect(content).toContain('task summary/evidence');
  }

  function expectBestPracticesInImplement(content: string) {
    expect(content).toContain('Project Type Best Practices');
    expect(content).toContain('.nova.yaml.projectType');
    expect(content).toContain('best practices');
    expect(content).toMatch(/deviat|deviation/);
    expect(content).toContain('rationale');
  }

  function expectProjectContextContractInImplement(content: string) {
    expect(content).toContain('Project Context Contract');
    expect(content).toContain('context.projectContext');
    expect(content).toContain('complianceRefs');
    expect(content).toContain('--compliance');
  }

  function expectRulesAndBestPracticesInVerify(content: string) {
    expect(content).toMatch(/Project Rules\s*\/\s*Conventions|Project Rules \/ Best Practices/);
    expect(content).toContain('Project Type Best Practices');
    expect(content).toContain('.nova.yaml.projectType');
    expect(content).toMatch(/project-local rules|Project rules conformance/);
    expect(content).toContain('best practices');
    expect(content).toContain('CHANGES_REQUESTED');
    expect(content).toMatch(/Weak, missing, or convenience-only rationale|理由不充分/);
    expect(content).toMatch(/do not\s+allow verify to pass|Only mark verify done|Only set phases\.verify\.status = done|只有当/i);
  }

  function expectProjectContextContractInVerify(content: string) {
    expect(content).toContain('Project Context Contract');
    expect(content).toContain('projectRulesVerdict');
    expect(content).toContain('bestPracticesVerdict');
    expect(content).toContain('reviewIndependence');
    expect(content).toContain('--review-independence');
    expect(content).toContain('--verification-commands');
    expect(content).toContain('verificationCommands');
    expect(content).toMatch(/build|compile|typecheck/);
    expect(content).toMatch(/subagent|子智能体/);
    expect(content).toContain('fresh-context');
    expect(content).toContain('same-session-fallback');
  }

  function expectDetectInstallGuidance(content: string, agent: string) {
    expect(content).toContain(`nova detect --agent ${agent}`);
    expect(content).toContain(`nova detect --agent ${agent} --json`);
    expect(content).toContain('without asking for a second confirmation');
    expect(content).toMatch(/show\s+commands|show\s+the commands/i);
    expect(content).toContain('npm install -g @fission-ai/openspec@latest');
    expect(content).toContain('ecc-install typescript');
    expect(content).toContain('Superpowers');
    expect(content).toMatch(/manual|手动|plugin|插件/i);
  }

  const expectedNovaSkills = [
    'nova',
    'nova-propose',
    'nova-design',
    'nova-implement',
    'nova-verify',
    'nova-archive',
    'nova-iterate',
    'nova-status',
    'nova-detect',
  ];

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-adapter-'));
    originalHome = process.env.HOME;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('CodexAdapter', () => {
    test('creates CODEX.md with instructions', async () => {
      const adapter = new CodexAdapter();
      expect(adapter.name).toBe('codex');

      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'CODEX.md'), 'utf-8');
      expect(content).toContain('Nova Workflow');
      expect(content).toContain('.nova.yaml');
    });

    test('does not overwrite existing CODEX.md', async () => {
      const existing = '# My Custom Instructions';
      await fs.writeFile(path.join(testDir, 'CODEX.md'), existing, 'utf-8');

      const adapter = new CodexAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'CODEX.md'), 'utf-8');
      expect(content).toBe(existing);
    });

    test('includes Figma propose intake rules', async () => {
      const adapter = new CodexAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'CODEX.md'), 'utf-8');
      expect(content).toContain('Figma 链接');
      expect(content).toContain('nova detect --agent codex --json');
      expect(content).toContain('存量页面修改还是增量新页面');
      expect(content).toContain('切图/图片/icon 资产');
    });

    test('includes test strategy checklist', async () => {
      const adapter = new CodexAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'CODEX.md'), 'utf-8');
      expectTestStrategyChecklist(content);
      expectLegacyPreflightRules(content);
    });

    test('nova-propose asks for test strategy checklist', async () => {
      const adapter = new CodexAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const propose = await fs.readFile(path.join(testDir, '.agents', 'skills', 'nova-propose', 'SKILL.md'), 'utf-8');
      expectTestStrategyChecklist(propose);
      expect(propose).toContain('--test-strategy');
    });

    test('creates all Nova skills in project agents skills', async () => {
      const adapter = new CodexAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      for (const skill of expectedNovaSkills) {
        const content = await fs.readFile(path.join(testDir, '.agents', 'skills', skill, 'SKILL.md'), 'utf-8');
        expect(content).toContain('description:');
      }
    });

    test('nova-detect guides detect install flow for Codex', async () => {
      const adapter = new CodexAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const content = await fs.readFile(path.join(testDir, '.agents', 'skills', 'nova-detect', 'SKILL.md'), 'utf-8');
      expectDetectInstallGuidance(content, 'codex');
      expect(content).toContain('/plugins');
    });

    test('design, implement, and verify skills enforce project rules and best practices', async () => {
      const adapter = new CodexAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const design = await fs.readFile(path.join(testDir, '.agents', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      const implement = await fs.readFile(path.join(testDir, '.agents', 'skills', 'nova-implement', 'SKILL.md'), 'utf-8');
      const verify = await fs.readFile(path.join(testDir, '.agents', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expectProjectRulesInDesign(design);
      expectBestPracticesInDesign(design);
      expectProjectContextContractInDesign(design);
      expectUiPlanningRulesInDesign(design);
      expectProjectRulesInImplement(implement);
      expectBestPracticesInImplement(implement);
      expectProjectContextContractInImplement(implement);
      expectRulesAndBestPracticesInVerify(verify);
      expectProjectContextContractInVerify(verify);
    });

    test('nova-verify runs selected UI fidelity checks from strategy and Figma traceability', async () => {
      const adapter = new CodexAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const verify = await fs.readFile(path.join(testDir, '.agents', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expectUiFidelityVerification(verify);
    });

    test('creates all Nova skills in user Codex skills', async () => {
      const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-codex-home-'));

      const adapter = new CodexAdapter();
      await adapter.setup(testDir, { skillsDir: 'user', homeDir });

      const codexSkillsStat = await fs.lstat(path.join(homeDir, '.codex', 'skills'));
      expect(codexSkillsStat.isSymbolicLink()).toBe(true);
      expect(await fs.readlink(path.join(homeDir, '.codex', 'skills'))).toBe(path.join(homeDir, '.agents', 'skills'));

      for (const skill of expectedNovaSkills) {
        const content = await fs.readFile(path.join(homeDir, '.codex', 'skills', skill, 'SKILL.md'), 'utf-8');
        expect(content).toContain('description:');
        await expect(fs.access(path.join(homeDir, '.agents', 'skills', skill, 'SKILL.md'))).resolves.toBeUndefined();
      }

      await fs.rm(homeDir, { recursive: true, force: true });
    });

    test('does not replace an existing user Codex skills directory', async () => {
      const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-codex-home-'));
      const codexSkillsDir = path.join(homeDir, '.codex', 'skills');
      await fs.mkdir(codexSkillsDir, { recursive: true });
      await fs.writeFile(path.join(codexSkillsDir, 'custom.txt'), 'keep', 'utf-8');

      const adapter = new CodexAdapter();
      await adapter.setup(testDir, { skillsDir: 'user', homeDir });

      const codexSkillsStat = await fs.lstat(codexSkillsDir);
      expect(codexSkillsStat.isDirectory()).toBe(true);
      expect(codexSkillsStat.isSymbolicLink()).toBe(false);
      await expect(fs.readFile(path.join(codexSkillsDir, 'custom.txt'), 'utf-8')).resolves.toBe('keep');
      for (const skill of expectedNovaSkills) {
        await expect(fs.access(path.join(codexSkillsDir, skill, 'SKILL.md'))).resolves.toBeUndefined();
      }

      await fs.rm(homeDir, { recursive: true, force: true });
    });
  });

  describe('OpenClawAdapter', () => {
    test('creates .openclaw/instructions.md', async () => {
      const adapter = new OpenClawAdapter();
      expect(adapter.name).toBe('openclaw');

      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, '.openclaw', 'instructions.md'), 'utf-8');
      expect(content).toContain('Nova Workflow');
    });

    test('does not overwrite existing instructions', async () => {
      const dir = path.join(testDir, '.openclaw');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'instructions.md'), 'custom', 'utf-8');

      const adapter = new OpenClawAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(dir, 'instructions.md'), 'utf-8');
      expect(content).toBe('custom');
    });

    test('includes test strategy checklist', async () => {
      const adapter = new OpenClawAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, '.openclaw', 'instructions.md'), 'utf-8');
      expectTestStrategyChecklist(content);
      expectLegacyPreflightRules(content);
      expectBestPracticesInDesign(content);
      expectProjectContextContractInDesign(content);
      expectBestPracticesInImplement(content);
      expectProjectContextContractInImplement(content);
      expectRulesAndBestPracticesInVerify(content);
      expectProjectContextContractInVerify(content);
    });
  });

  describe('HermesAgentAdapter', () => {
    test('creates HERMES.md', async () => {
      const adapter = new HermesAgentAdapter();
      expect(adapter.name).toBe('hermes-agent');

      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'HERMES.md'), 'utf-8');
      expect(content).toContain('Nova Workflow');
    });

    test('does not overwrite existing HERMES.md', async () => {
      await fs.writeFile(path.join(testDir, 'HERMES.md'), 'custom', 'utf-8');

      const adapter = new HermesAgentAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'HERMES.md'), 'utf-8');
      expect(content).toBe('custom');
    });

    test('includes test strategy checklist', async () => {
      const adapter = new HermesAgentAdapter();
      await adapter.setup(testDir);

      const content = await fs.readFile(path.join(testDir, 'HERMES.md'), 'utf-8');
      expectTestStrategyChecklist(content);
      expectLegacyPreflightRules(content);
      expectBestPracticesInDesign(content);
      expectProjectContextContractInDesign(content);
      expectBestPracticesInImplement(content);
      expectProjectContextContractInImplement(content);
      expectRulesAndBestPracticesInVerify(content);
      expectProjectContextContractInVerify(content);
    });
  });

  describe('OpenCodeAdapter', () => {
    test('creates opencode.json with instructions', async () => {
      const adapter = new OpenCodeAdapter();
      expect(adapter.name).toBe('opencode');

      await adapter.setup(testDir);

      const raw = await fs.readFile(path.join(testDir, 'opencode.json'), 'utf-8');
      const config = JSON.parse(raw);
      expect(config.instructions).toContain('Nova Workflow');
    });

    test('does not overwrite existing opencode.json', async () => {
      const existing = { model: 'claude-sonnet-4-6' };
      await fs.writeFile(path.join(testDir, 'opencode.json'), JSON.stringify(existing), 'utf-8');

      const adapter = new OpenCodeAdapter();
      await adapter.setup(testDir);

      const raw = await fs.readFile(path.join(testDir, 'opencode.json'), 'utf-8');
      const config = JSON.parse(raw);
      expect(config.model).toBe('claude-sonnet-4-6');
    });

    test('includes test strategy checklist', async () => {
      const adapter = new OpenCodeAdapter();
      await adapter.setup(testDir);

      const raw = await fs.readFile(path.join(testDir, 'opencode.json'), 'utf-8');
      const instructions = JSON.parse(raw).instructions;
      expectTestStrategyChecklist(instructions);
      expectLegacyPreflightRules(instructions);
      expectBestPracticesInDesign(instructions);
      expectProjectContextContractInDesign(instructions);
      expectBestPracticesInImplement(instructions);
      expectProjectContextContractInImplement(instructions);
      expectRulesAndBestPracticesInVerify(instructions);
      expectProjectContextContractInVerify(instructions);
    });
  });

  describe('ClaudeCodeAdapter MCP injection', () => {
    test('injects Figma step into nova-design when figma MCP configured', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project', mcpServers: { figma: { configured: true, serverName: 'figma-mcp' } } });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Figma MCP detected');
      expect(content).toContain('Design Tokens');
    });

    test('injects Mobile step into nova-verify when mobile MCP configured', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project', mcpServers: { mobile: { configured: true, serverName: 'mobile-mcp' } } });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Mobile MCP detected');
      expect(content).toContain('UI Verification');
      expect(content).toContain('Do not hardcode an iOS simulator model');
      expect(content).toContain('iPhone 16');
      expect(content).toContain('available compatible simulator');
    });

    test('nova-detect delegates to nova detect CLI', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-detect', 'SKILL.md'), 'utf-8');
      expect(content).toContain('nova detect');
      expect(content).toContain('--agent claude-code');
      expect(content).toContain('Superpowers');
      expect(content).toContain('manual Agent/plugin setup');
      expect(content).toContain('npx uipro-cli init --ai claude');
      expect(content).toContain('Recommended');
      expect(content).toContain('Optional');
      expect(content).not.toContain('which openspec');
    });

    test('creates nova-archive skill', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-archive', 'SKILL.md'), 'utf-8');
      expect(content).toContain('nova archive');
      expect(content).toContain('Docs/specs/completed/');
      expect(content).toContain('source artifacts');
    });

    test('nova-propose handles Figma links before generating specs', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-propose', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Handle Figma Links');
      expect(content).toContain('nova detect --agent claude-code --json');
      expect(content).toContain('Existing page modification');
      expect(content).toContain('Incremental new page');
      expect(content).toContain('cut/export assets');
    });

    test('nova-propose asks for test strategy checklist', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const propose = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-propose', 'SKILL.md'), 'utf-8');
      const design = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      expectTestStrategyChecklist(propose);
      expectLegacyPreflightRules(`${propose}\n${design}`);
    });

    test('nova-verify runs selected UI fidelity checks from strategy and Figma traceability', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const verify = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expectUiFidelityVerification(verify);
    });

    test('design, implement, and verify skills enforce project rules and best practices', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const design = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      const implement = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-implement', 'SKILL.md'), 'utf-8');
      const verify = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expectProjectRulesInDesign(design);
      expectBestPracticesInDesign(design);
      expectProjectContextContractInDesign(design);
      expectUiPlanningRulesInDesign(design);
      expectProjectRulesInImplement(implement);
      expectBestPracticesInImplement(implement);
      expectProjectContextContractInImplement(implement);
      expectRulesAndBestPracticesInVerify(verify);
      expectProjectContextContractInVerify(verify);
    });

    test('no MCP steps when no MCP configured', async () => {
      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const design = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      const verify = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expect(design).not.toContain('Figma MCP detected');
      expect(verify).not.toContain('Mobile MCP detected');
    });

    test('creates shared skills directory and Claude skills symlink for user install', async () => {
      const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-adapter-home-'));
      process.env.HOME = homeDir;

      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'user', homeDir });

      const agentsSkillsDir = path.join(homeDir, '.agents', 'skills');
      const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
      const claudeSkillsStat = await fs.lstat(claudeSkillsDir);

      expect(claudeSkillsStat.isSymbolicLink()).toBe(true);
      expect(await fs.readlink(claudeSkillsDir)).toBe(agentsSkillsDir);
      await expect(fs.access(path.join(agentsSkillsDir, 'nova', 'SKILL.md'))).resolves.toBeUndefined();

      await fs.rm(homeDir, { recursive: true, force: true });
    });

    test('does not replace an existing Claude skills directory for user install', async () => {
      const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-adapter-home-'));
      process.env.HOME = homeDir;
      const claudeSkillsDir = path.join(homeDir, '.claude', 'skills');
      await fs.mkdir(claudeSkillsDir, { recursive: true });
      await fs.writeFile(path.join(claudeSkillsDir, 'custom.txt'), 'keep', 'utf-8');

      const adapter = new ClaudeCodeAdapter();
      await adapter.setup(testDir, { skillsDir: 'user', homeDir });

      const claudeSkillsStat = await fs.lstat(claudeSkillsDir);
      expect(claudeSkillsStat.isDirectory()).toBe(true);
      expect(claudeSkillsStat.isSymbolicLink()).toBe(false);
      await expect(fs.readFile(path.join(claudeSkillsDir, 'custom.txt'), 'utf-8')).resolves.toBe('keep');
      await expect(fs.access(path.join(homeDir, '.agents', 'skills', 'nova', 'SKILL.md'))).resolves.toBeUndefined();

      await fs.rm(homeDir, { recursive: true, force: true });
    });
  });

  describe('PiCodingAgentAdapter', () => {
    test('nova-propose handles Figma links before generating proposal', async () => {
      const adapter = new PiCodingAgentAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-propose', 'SKILL.md'), 'utf-8');
      expect(content).toContain('Handle Figma Links');
      expect(content).toContain('nova detect --agent pi-coding-agent --json');
      expect(content).toContain('existing page modification');
      expect(content).toContain('incremental new page');
      expect(content).toContain('cut/export assets');
    });

    test('nova-propose asks for test strategy checklist', async () => {
      const adapter = new PiCodingAgentAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const propose = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-propose', 'SKILL.md'), 'utf-8');
      const design = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      expectTestStrategyChecklist(propose);
      expectLegacyPreflightRules(`${propose}\n${design}`);
    });

    test('nova-verify runs selected UI fidelity checks from strategy and Figma traceability', async () => {
      const adapter = new PiCodingAgentAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const verify = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expectUiFidelityVerification(verify);
    });

    test('design, implement, and verify skills enforce project rules and best practices', async () => {
      const adapter = new PiCodingAgentAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const design = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-design', 'SKILL.md'), 'utf-8');
      const implement = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-implement', 'SKILL.md'), 'utf-8');
      const verify = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-verify', 'SKILL.md'), 'utf-8');
      expectProjectRulesInDesign(design);
      expectBestPracticesInDesign(design);
      expectProjectContextContractInDesign(design);
      expectUiPlanningRulesInDesign(design);
      expectProjectRulesInImplement(implement);
      expectBestPracticesInImplement(implement);
      expectProjectContextContractInImplement(implement);
      expectRulesAndBestPracticesInVerify(verify);
      expectProjectContextContractInVerify(verify);
    });

    test('creates nova-archive skill', async () => {
      const adapter = new PiCodingAgentAdapter();
      await adapter.setup(testDir, { skillsDir: 'project' });

      const content = await fs.readFile(path.join(testDir, '.claude', 'skills', 'nova-archive', 'SKILL.md'), 'utf-8');
      expect(content).toContain('nova archive');
      expect(content).toContain('Docs/specs/completed/');
      expect(content).toContain('Superpowers');
    });
  });
});
