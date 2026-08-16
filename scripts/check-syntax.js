/**
 * Syntax-check every JS file in the repo (deterministic lint substitute,
 * zero dependencies). Exits non-zero with details on the first failure.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['src', 'test', 'scripts'];
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.js')) files.push(full);
  }
}

for (const root of roots) walk(root);

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed++;
    process.stderr.write(`SYNTAX FAIL ${relative(process.cwd(), file)}\n${result.stderr}`);
  } else {
    console.log(`ok ${relative(process.cwd(), file)}`);
  }
}

if (failed > 0) {
  process.stderr.write(`${failed} file(s) failed syntax check\n`);
  process.exit(1);
}
console.log(`checked ${files.length} files`);
