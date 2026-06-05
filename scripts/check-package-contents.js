#!/usr/bin/env node
const { execFileSync } = require('child_process');

const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf-8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

const pack = JSON.parse(raw)[0];
const files = pack.files.map(file => file.path);
const forbidden = [
  /(^|\/)__tests__(\/|$)/,
  /\.test\.(js|d\.ts|map)$/,
  /(^|\/)\.nova\.yaml$/,
  /(^|\/)\.nova-backup-/,
  /(^|\/)\.codegraph(\/|$)/,
  /(^|\/)\.claude(\/|$)/,
  /^src\//,
];

const violations = files.filter(file => forbidden.some(pattern => pattern.test(file)));

if (violations.length > 0) {
  console.error('Package content check failed. Forbidden files:');
  for (const file of violations) console.error(`  ${file}`);
  process.exit(1);
}

console.log(`Package content check passed (${files.length} files).`);
