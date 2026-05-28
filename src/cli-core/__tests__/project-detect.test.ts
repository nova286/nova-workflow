import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { detectProjectType } from '../project-detect';

describe('detectProjectType', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-detect-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('returns node for package.json', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ name: 'test' }));
    expect(await detectProjectType(testDir)).toBe('node');
  });

  test('returns python for requirements.txt', async () => {
    await fs.writeFile(path.join(testDir, 'requirements.txt'), 'flask==2.0');
    expect(await detectProjectType(testDir)).toBe('python');
  });

  test('returns python for pyproject.toml', async () => {
    await fs.writeFile(path.join(testDir, 'pyproject.toml'), '[tool.poetry]\nname = "test"');
    expect(await detectProjectType(testDir)).toBe('python');
  });

  test('returns go for go.mod', async () => {
    await fs.writeFile(path.join(testDir, 'go.mod'), 'module example.com/app');
    expect(await detectProjectType(testDir)).toBe('go');
  });

  test('returns java for pom.xml', async () => {
    await fs.writeFile(path.join(testDir, 'pom.xml'), '<project></project>');
    expect(await detectProjectType(testDir)).toBe('java');
  });

  test('returns java for build.gradle', async () => {
    await fs.writeFile(path.join(testDir, 'build.gradle'), 'plugins { id("java") }');
    expect(await detectProjectType(testDir)).toBe('java');
  });

  test('returns rust for Cargo.toml', async () => {
    await fs.writeFile(path.join(testDir, 'Cargo.toml'), '[package]\nname = "test"');
    expect(await detectProjectType(testDir)).toBe('rust');
  });

  test('returns ruby for Gemfile', async () => {
    await fs.writeFile(path.join(testDir, 'Gemfile'), 'source "https://rubygems.org"');
    expect(await detectProjectType(testDir)).toBe('ruby');
  });

  test('returns php for composer.json', async () => {
    await fs.writeFile(path.join(testDir, 'composer.json'), JSON.stringify({ name: 'test' }));
    expect(await detectProjectType(testDir)).toBe('php');
  });

  test('returns cpp for CMakeLists.txt', async () => {
    await fs.writeFile(path.join(testDir, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.0)');
    expect(await detectProjectType(testDir)).toBe('cpp');
  });

  test('returns empty string for unknown project', async () => {
    expect(await detectProjectType(testDir)).toBe('');
  });
});
