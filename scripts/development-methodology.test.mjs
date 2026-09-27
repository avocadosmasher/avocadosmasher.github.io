import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

// Test the downloadable example itself; never approve or commit in the Blog repo.
const html = readFileSync(new URL('../docs/guide/개발-방법론.html', import.meta.url), 'utf8');
const skill = html.match(/id="skill-src">([\s\S]*?)<\/script>/)[1];
const code = skill.match(/```js\r?\n([\s\S]*?)\r?\n```/)[1];

function repo(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'methodology-gate-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Gate Test');
  git('config', 'user.email', 'gate@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', join(cwd, 'isolated-hooks'));
  writeFileSync(join(cwd, 'gate.mjs'), code);
  const edit = (value) => writeFileSync(join(cwd, 'sample.txt'), value);
  edit('initial');
  git('add', '.');
  const gate = (mode, input = '') => spawnSync(process.execPath, ['gate.mjs', mode], { cwd, encoding: 'utf8', input });
  const expect = (mode, status, input) => {
    const result = gate(mode, input);
    assert.equal(result.status, status, result.stderr || result.stdout);
  };
  const push = (oid = git('rev-parse', 'HEAD')) => `refs/heads/work ${oid} refs/heads/work ${'0'.repeat(40)}\n`;
  return { cwd, git, edit, expect, push };
}

test('missing approval blocks commit and push', t => {
  const r = repo(t);
  r.expect('check-commit', 1);
  r.expect('check-push', 1, r.push('0'.repeat(40)));
});

test('first commit can be approved, committed and checked for push', t => {
  const r = repo(t);
  r.expect('approve', 0);
  r.expect('check-commit', 0);
  r.git('commit', '-qm', 'Initial reviewed content');
  r.expect('check-push', 0, r.push());
  r.expect('check-commit', 1); // Cannot reuse the old base for another commit.
});

test('normal commit can be approved and checked for push', t => {
  const r = repo(t);
  r.git('commit', '-qm', 'Baseline');
  r.edit('reviewed change'); r.git('add', '.');
  r.expect('approve', 0);
  r.expect('check-commit', 0);
  r.git('commit', '-qm', 'Reviewed change');
  r.expect('check-push', 0, r.push());
  r.git('commit', '--allow-empty', '-qm', 'Extra commit');
  r.expect('check-push', 1, r.push());
});

test('staged changes invalidate approval; unstaged edits are outside the gate', t => {
  const r = repo(t);
  r.expect('approve', 0);
  r.edit('unreviewed');
  r.expect('check-commit', 0);
  r.expect('approve', 1);
  r.git('add', '.');
  r.expect('check-commit', 1);
});

test('ref deletion is blocked after approval', t => {
  const r = repo(t);
  r.expect('approve', 0);
  r.expect('check-push', 1, r.push('0'.repeat(40)));
});

test('a different outgoing tree is blocked', t => {
  const r = repo(t);
  r.git('commit', '-qm', 'Baseline');
  r.edit('reviewed'); r.git('add', '.'); r.expect('approve', 0);
  r.edit('different'); r.git('add', '.'); r.git('commit', '-qm', 'Different tree');
  r.expect('check-push', 1, r.push());
});
