import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectEnvironment } from './types';

const TYPE_SIGNALS: Record<string, string> = {
  'pubspec.yaml': 'flutter',
  'Podfile': 'ios',
  'Package.swift': 'swift',
  'requirements.txt': 'python',
  'pyproject.toml': 'python',
  'setup.py': 'python',
  'go.mod': 'go',
  'pom.xml': 'java',
  'build.gradle': 'java',
  'build.gradle.kts': 'java',
  'Cargo.toml': 'rust',
  'Gemfile': 'ruby',
  'composer.json': 'php',
  'CMakeLists.txt': 'cpp',
};

export async function detectProjectType(cwd: string): Promise<string> {
  try {
    const files = await fs.readdir(cwd);
    const appleType = await detectAppleProjectType(cwd, files);
    if (appleType) return appleType;
    if (files.includes('pubspec.yaml')) return 'flutter';
    if (files.includes('package.json')) return detectNodeProjectType(cwd);
    for (const f of files) {
      if (TYPE_SIGNALS[f]) return TYPE_SIGNALS[f];
    }
  } catch {}
  return '';
}

export async function detectProjectEnvironment(cwd: string, projectType?: string): Promise<ProjectEnvironment> {
  const type = projectType === 'node' ? await detectNodeProjectType(cwd) : projectType || await detectProjectType(cwd);
  if (type.startsWith('node')) return detectNodeEnvironment(cwd, type);

  const defaults: Record<string, ProjectEnvironment> = {
    'ios-xcodegen': { language: 'Swift', framework: 'UIKit/SwiftUI', buildTool: 'XcodeGen + xcodebuild', testFramework: 'XCTest', buildCommand: 'xcodegen generate && xcodebuild build', testCommand: 'xcodebuild test' },
    ios: { language: 'Swift', framework: 'UIKit/SwiftUI', buildTool: 'xcodebuild', testFramework: 'XCTest', buildCommand: 'xcodebuild build', testCommand: 'xcodebuild test' },
    swift: { language: 'Swift', framework: 'Swift Package', buildTool: 'swift', testFramework: 'XCTest', buildCommand: 'swift build', testCommand: 'swift test' },
    flutter: { language: 'Dart', framework: 'Flutter', buildTool: 'flutter', testFramework: 'flutter_test', buildCommand: 'flutter build', testCommand: 'flutter test' },
    python: { language: 'Python', framework: '', buildTool: 'pip', testFramework: 'pytest', testCommand: 'pytest' },
    go: { language: 'Go', framework: '', buildTool: 'go', testFramework: 'testing', testCommand: 'go test ./...' },
    java: { language: 'Java', framework: 'Spring Boot', buildTool: 'maven', testFramework: 'junit', testCommand: 'mvn test' },
    rust: { language: 'Rust', framework: '', buildTool: 'cargo', testFramework: 'cargo test', testCommand: 'cargo test' },
    ruby: { language: 'Ruby', framework: 'Rails', buildTool: 'bundler', testFramework: 'rspec', testCommand: 'bundle exec rspec' },
    php: { language: 'PHP', framework: 'Laravel', buildTool: 'composer', testFramework: 'phpunit', testCommand: 'vendor/bin/phpunit' },
    cpp: { language: 'C++', framework: '', buildTool: 'cmake', testFramework: 'ctest', testCommand: 'ctest' },
  };
  return defaults[type] || { language: '', framework: '', buildTool: '', testFramework: '' };
}

async function detectAppleProjectType(cwd: string, files: string[]): Promise<string> {
  if (files.includes('project.yml') && await looksLikeXcodeGenProject(path.join(cwd, 'project.yml'))) {
    return 'ios-xcodegen';
  }
  if (files.includes('project.yaml') && await looksLikeXcodeGenProject(path.join(cwd, 'project.yaml'))) {
    return 'ios-xcodegen';
  }
  if (files.some((file) => file.endsWith('.xcodeproj') || file.endsWith('.xcworkspace'))) {
    return 'ios';
  }
  if (files.includes('Podfile')) {
    return 'ios';
  }
  if (files.includes('Package.swift')) {
    return 'swift';
  }
  return '';
}

async function looksLikeXcodeGenProject(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return /\btargets\s*:/.test(content) || /\bsettings\s*:/.test(content) || /\boptions\s*:/.test(content);
  } catch {
    return false;
  }
}

async function detectNodeProjectType(cwd: string): Promise<string> {
  const pkg = await readPackageJson(cwd);
  const deps = dependencyNames(pkg);
  if (deps.has('next')) return 'node-next';
  if (deps.has('vite')) return deps.has('react') ? 'node-vite-react' : 'node-vite';
  if (deps.has('react')) return 'node-react';
  if (deps.has('vue')) return 'node-vue';
  if (deps.has('express')) return 'node-express';
  if (pkg?.bin) return 'node-cli';
  if (pkg?.types || pkg?.typings || pkg?.main || pkg?.exports) return 'node-library';
  return 'node';
}

async function detectNodeEnvironment(cwd: string, type: string): Promise<ProjectEnvironment> {
  const pkg = await readPackageJson(cwd);
  const scripts = pkg?.scripts || {};
  const hasTs = dependencyNames(pkg).has('typescript') || await exists(path.join(cwd, 'tsconfig.json'));
  const testFramework = detectNodeTestFramework(pkg);
  const buildCommand = typeof scripts.build === 'string' ? 'npm run build' : undefined;
  const testCommand = typeof scripts.test === 'string' ? 'npm test' : undefined;
  const base = {
    language: hasTs ? 'TypeScript' : 'JavaScript',
    buildTool: 'npm',
    testFramework,
    buildCommand,
    testCommand,
  };

  const frameworks: Record<string, string> = {
    'node-next': 'Next.js',
    'node-vite-react': 'Vite React',
    'node-vite': 'Vite',
    'node-react': 'React',
    'node-vue': 'Vue',
    'node-express': 'Express.js',
    'node-cli': 'Node CLI',
    'node-library': 'Node library',
    node: 'Node.js',
  };
  return { ...base, framework: frameworks[type] || 'Node.js' };
}

function detectNodeTestFramework(pkg: any): string {
  const deps = dependencyNames(pkg);
  if (deps.has('vitest')) return 'vitest';
  if (deps.has('jest')) return 'jest';
  if (deps.has('mocha')) return 'mocha';
  if (deps.has('playwright')) return 'playwright';
  return 'npm test';
}

async function readPackageJson(cwd: string): Promise<any> {
  try {
    return JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function dependencyNames(pkg: any): Set<string> {
  return new Set([
    ...Object.keys(pkg?.dependencies || {}),
    ...Object.keys(pkg?.devDependencies || {}),
    ...Object.keys(pkg?.peerDependencies || {}),
  ]);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
