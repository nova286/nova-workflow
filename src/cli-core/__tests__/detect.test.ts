import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { detectNovaEnvironment } from '../detect';

describe('detectNovaEnvironment', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-detect-cwd-'));
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-detect-home-'));
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  function commandExists(commands: string[]) {
    return async (cmd: string) => commands.includes(cmd);
  }

  test('fails only when required Nova state is missing', async () => {
    const result = await detectNovaEnvironment({
      cwd,
      homeDir,
      commandExists: commandExists([]),
    });

    expect(result.pass).toBe(false);
    expect(result.tools.find(t => t.id === 'nova-state')?.status).toBe('missing');
    expect(result.tools.find(t => t.id === 'openspec')?.status).toBe('missing');
  });

  test('passes with only .nova.yaml and reports compatible mode for missing recommended tools', async () => {
    await fs.writeFile(path.join(cwd, '.nova.yaml'), 'version: 1\n', 'utf-8');

    const result = await detectNovaEnvironment({
      cwd,
      homeDir,
      commandExists: commandExists([]),
    });

    expect(result.pass).toBe(true);
    expect(result.tools.find(t => t.id === 'nova-state')?.status).toBe('available');
    expect(result.tools.find(t => t.id === 'openspec')?.summary).toContain('compatible mode');
    expect(result.tools.find(t => t.id === 'superpowers')?.category).toBe('recommended');
    expect(result.tools.find(t => t.id === 'figma-mcp')?.category).toBe('optional');
  });

  test('reports partial status for tools with only CLI or project directory', async () => {
    await fs.writeFile(path.join(cwd, '.nova.yaml'), 'version: 1\n', 'utf-8');
    await fs.mkdir(path.join(cwd, '.openspec'), { recursive: true });

    const result = await detectNovaEnvironment({
      cwd,
      homeDir,
      commandExists: commandExists(['codegraph']),
    });

    expect(result.tools.find(t => t.id === 'openspec')?.status).toBe('partial');
    expect(result.tools.find(t => t.id === 'codegraph')?.status).toBe('partial');
  });

  test('detects ECC CLI, skills, and MCP settings', async () => {
    await fs.writeFile(path.join(cwd, '.nova.yaml'), 'version: 1\n', 'utf-8');
    await fs.mkdir(path.join(homeDir, '.agents', 'skills', 'brainstorming'), { recursive: true });
    await fs.mkdir(path.join(homeDir, '.claude', 'skills', 'configure-ecc'), { recursive: true });
    await fs.mkdir(path.join(cwd, '.claude'), { recursive: true });
    await fs.writeFile(
      path.join(cwd, '.claude', 'settings.json'),
      JSON.stringify({
        enabledPlugins: ['ecc@ecc'],
        mcpServers: {
          'figma-mcp': { command: 'npx' },
          'ios-simulator': { command: 'npx' },
        },
      }),
      'utf-8'
    );

    const result = await detectNovaEnvironment({
      cwd,
      homeDir,
      commandExists: commandExists(['ecc-install']),
    });

    expect(result.tools.find(t => t.id === 'superpowers')?.status).toBe('available');
    expect(result.tools.find(t => t.id === 'ecc')?.status).toBe('available');
    expect(result.tools.find(t => t.id === 'ecc')?.details.join('\n')).toContain('ecc-install CLI found');
    expect(result.tools.find(t => t.id === 'figma-mcp')?.status).toBe('available');
    expect(result.tools.find(t => t.id === 'mobile-mcp')?.status).toBe('available');
  });
});
