import * as fs from 'fs/promises';
import * as path from 'path';

const TYPE_SIGNALS: Record<string, string> = {
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
    if (files.includes('package.json')) return 'node';
    for (const f of files) {
      if (TYPE_SIGNALS[f]) return TYPE_SIGNALS[f];
    }
  } catch {}
  return '';
}
