import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '../../..');
// Written in two halves so that this file does not name the editor it keeps out of the code.
const WORD = ['flexi', 'livre'].join('');

/** The tracked files for which `git` answers: null outside a git checkout (a source archive). */
function git(args: string[]): string[] | null {
  const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  if (result.error || (result.status !== 0 && result.status !== 1)) return null;
  return result.stdout.split('\n').filter((line) => line !== '');
}

describe('the clean-room rule', () => {
  it('names the other editor in no tracked file', () => {
    const files = git(['grep', '-il', WORD]);
    if (files === null) return;
    expect(files).toEqual([]);
  });

  it('keeps its name out of every file name', () => {
    const files = git(['ls-files']);
    if (files === null) return;
    expect(files.filter((file) => file.toLowerCase().includes(WORD))).toEqual([]);
  });
});
