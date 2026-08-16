#!/usr/bin/env node
/**
 * CLI: clean Markdown export from a DSH session-log artifact.
 *
 *   node src/cli.js <session.jsonl|session.jsonl.zstd|-> [output.md]
 *
 * Output defaults to stdout; stats always go to stderr. `.zstd` artifacts are
 * decompressed transparently when the `zstd` CLI is on PATH.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { exportConversation, SessionFormatError } from './index.js';

function usage() {
  return 'Usage: node src/cli.js <session.jsonl|session.jsonl.zstd|-> [output.md]';
}

function fail(message, code) {
  process.stderr.write(`dsh-conversation-exporter: ${message}\n`);
  process.exit(code);
}

function readInput(path) {
  if (path === '-') {
    try {
      return readFileSync(0, 'utf8');
    } catch (error) {
      fail(`cannot read stdin: ${error.message}`, 4);
    }
  }
  if (path.endsWith('.zstd')) {
    const result = spawnSync('zstd', ['-d', '-c', '--', path], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
    if (result.error !== undefined) {
      fail(`cannot decompress ${path}: is the 'zstd' CLI installed and on PATH? (${result.error.message})`, 4);
    }
    if (result.status !== 0) {
      fail(`zstd failed for ${path}: ${String(result.stderr).trim()}`, 4);
    }
    return result.stdout.toString('utf8');
  }
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`, 4);
  }
}

function main(argv) {
  if (argv.length < 1 || argv.length > 2 || argv[0] === '--help' || argv[0] === '-h') {
    process.stderr.write(`${usage()}\n`);
    process.exit(argv[0] === '--help' || argv[0] === '-h' ? 0 : 2);
  }
  const [input, output] = argv;
  const text = readInput(input);

  let result;
  try {
    result = exportConversation(text);
  } catch (error) {
    if (error instanceof SessionFormatError) fail(`session format: ${error.message}`, 3);
    fail(`unexpected error: ${error?.stack ?? error}`, 5);
  }

  const statsLine = JSON.stringify({ header: { id: result.header.id, version: result.header.version }, stats: result.stats });
  if (output !== undefined && output !== '-') {
    try {
      writeFileSync(output, result.markdown, 'utf8');
    } catch (error) {
      fail(`cannot write ${output}: ${error.message}`, 4);
    }
    process.stderr.write(`wrote ${output}\n${statsLine}\n`);
  } else {
    process.stdout.write(result.markdown);
    process.stderr.write(`${statsLine}\n`);
  }
}

main(process.argv.slice(2));
