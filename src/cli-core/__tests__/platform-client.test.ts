import { EventEmitter } from 'events';
import * as child_process from 'child_process';

// Mock child_process before importing platform-client
jest.mock('child_process');

import {
  ClaudeCodeClient,
  CodexClient,
  OpenClawClient,
  HermesAgentClient,
  OpenCodeClient,
  resolvePlatformClient,
} from '../platform-client';

function createMockChild(exitCode: number = 0, stdout: string = 'mock output', stderr: string = '') {
  const child = new EventEmitter() as any;
  child.stdin = { write: jest.fn(), end: jest.fn() };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 12345;

  process.nextTick(() => {
    child.stdout.emit('data', Buffer.from(stdout));
    child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', exitCode);
  });

  return child;
}

describe('PlatformClient implementations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CodexClient', () => {
    test('calls codex --quiet via stdin', async () => {
      const child = createMockChild(0, 'codex response');
      (child_process.spawn as jest.Mock).mockReturnValue(child);

      const client = new CodexClient();
      const result = await client.sendPrompt('test prompt');

      expect(child_process.spawn).toHaveBeenCalledWith(
        'codex',
        ['--quiet'],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      expect(child.stdin.write).toHaveBeenCalledWith('test prompt');
      expect(child.stdin.end).toHaveBeenCalled();
      expect(result.content).toBe('codex response');
    });

    test('passes --model flag when specified', async () => {
      const child = createMockChild(0, 'output');
      (child_process.spawn as jest.Mock).mockReturnValue(child);

      const client = new CodexClient();
      await client.sendPrompt('prompt', { model: 'o4-mini' });

      expect(child_process.spawn).toHaveBeenCalledWith(
        'codex',
        ['--quiet', '--model', 'o4-mini'],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
    });

    test('rejects on non-zero exit code', async () => {
      const child = createMockChild(1, '', 'error message');
      (child_process.spawn as jest.Mock).mockReturnValue(child);

      const client = new CodexClient();
      await expect(client.sendPrompt('prompt')).rejects.toThrow('Codex CLI exit 1');
    });

    test('rejects on spawn error', async () => {
      const child = new EventEmitter() as any;
      child.stdin = { write: jest.fn(), end: jest.fn() };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      (child_process.spawn as jest.Mock).mockReturnValue(child);

      process.nextTick(() => child.emit('error', new Error('ENOENT')));

      const client = new CodexClient();
      await expect(client.sendPrompt('prompt')).rejects.toThrow('ENOENT');
    });
  });

  describe('OpenClawClient', () => {
    test('calls openclaw --print via stdin', async () => {
      const child = createMockChild(0, 'openclaw response');
      (child_process.spawn as jest.Mock).mockReturnValue(child);

      const client = new OpenClawClient();
      const result = await client.sendPrompt('test prompt');

      expect(child_process.spawn).toHaveBeenCalledWith(
        'openclaw',
        ['--print'],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      expect(result.content).toBe('openclaw response');
    });

    test('rejects on non-zero exit code', async () => {
      const child = createMockChild(1, '', 'err');
      (child_process.spawn as jest.Mock).mockReturnValue(child);

      const client = new OpenClawClient();
      await expect(client.sendPrompt('p')).rejects.toThrow('OpenClaw CLI exit 1');
    });
  });

  describe('HermesAgentClient', () => {
    test('calls hermes-agent --print via stdin', async () => {
      const child = createMockChild(0, 'hermes response');
      (child_process.spawn as jest.Mock).mockReturnValue(child);

      const client = new HermesAgentClient();
      const result = await client.sendPrompt('test prompt');

      expect(child_process.spawn).toHaveBeenCalledWith(
        'hermes-agent',
        ['--print'],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      expect(result.content).toBe('hermes response');
    });
  });

  describe('OpenCodeClient', () => {
    test('calls opencode with run subcommand (not stdin)', async () => {
      const child = createMockChild(0, 'opencode response');
      (child_process.spawn as jest.Mock).mockReturnValue(child);

      const client = new OpenCodeClient();
      const result = await client.sendPrompt('test prompt');

      expect(child_process.spawn).toHaveBeenCalledWith(
        'opencode',
        ['run', 'test prompt'],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      expect(child.stdin.write).not.toHaveBeenCalled();
      expect(result.content).toBe('opencode response');
    });

    test('rejects on non-zero exit code', async () => {
      const child = createMockChild(1, '', 'err');
      (child_process.spawn as jest.Mock).mockReturnValue(child);

      const client = new OpenCodeClient();
      await expect(client.sendPrompt('p')).rejects.toThrow('OpenCode CLI exit 1');
    });
  });
});

describe('resolvePlatformClient', () => {
  const fs = require('fs/promises');

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('returns ClaudeCodeClient by default', async () => {
    jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
    const client = await resolvePlatformClient('/tmp');
    expect(client).toBeInstanceOf(ClaudeCodeClient);
  });

  test('returns CodexClient when environment is codex', async () => {
    jest.spyOn(fs, 'readFile').mockResolvedValue(
      'version: 1\nenvironment:\n  - codex\n'
    );
    const client = await resolvePlatformClient('/tmp');
    expect(client).toBeInstanceOf(CodexClient);
  });

  test('throws on unsupported environment', async () => {
    jest.spyOn(fs, 'readFile').mockResolvedValue(
      'version: 1\nenvironment:\n  - unknown-platform\n'
    );
    await expect(resolvePlatformClient('/tmp')).rejects.toThrow('Unsupported environment');
  });
});
