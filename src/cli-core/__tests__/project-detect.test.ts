import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { detectProjectEnvironment, detectProjectType } from '../project-detect';

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

  test('prefers ios-xcodegen over package.json when XcodeGen project.yml is present', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ name: 'tooling' }));
    await fs.writeFile(path.join(testDir, 'project.yml'), 'name: App\ntargets:\n  App:\n    type: application\n');
    expect(await detectProjectType(testDir)).toBe('ios-xcodegen');
  });

  test('returns ios for Xcode project bundles', async () => {
    await fs.mkdir(path.join(testDir, 'App.xcodeproj'));
    expect(await detectProjectType(testDir)).toBe('ios');
  });

  test('returns flutter for pubspec.yaml before package.json tooling', async () => {
    await fs.writeFile(path.join(testDir, 'package.json'), JSON.stringify({ name: 'tooling' }));
    await fs.writeFile(path.join(testDir, 'pubspec.yaml'), 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n');
    expect(await detectProjectType(testDir)).toBe('flutter');
  });

  test('detects iOS XcodeGen environment defaults', async () => {
    const env = await detectProjectEnvironment(testDir, 'ios-xcodegen');
    expect(env.language).toBe('Swift');
    expect(env.framework).toContain('UIKit');
    expect(env.buildTool).toContain('XcodeGen');
    expect(env.testFramework).toBe('XCTest');
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
