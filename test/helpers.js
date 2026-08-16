import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function fixture(name) {
  return readFileSync(join(here, 'fixtures', name), 'utf8');
}

export function golden(name) {
  return readFileSync(join(here, 'golden', name), 'utf8');
}
