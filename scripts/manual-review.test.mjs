import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('review gates reject missing/stale approval and accept the reviewed commit', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'blog-review-'));
  const script = resolve('scripts/manual-review.mjs');
  const run = (exe, args, input) => spawnSync(exe, args, { cwd, input, encoding: 'utf8' });
  const git = (...args) => {
    const result = run('git', args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const gate = (mode, input) => run(process.execPath, [script, mode], input).status;
  try {
    git('init');
    git('config', 'user.name', 'Review Test');
    git('config', 'user.email', 'review@example.invalid');
    git('config', 'core.hooksPath', '.unused-hooks');
    git('config', 'commit.gpgSign', 'false');
    writeFileSync(join(cwd, 'feature.txt'), 'initial');
    git('add', '.');
    git('commit', '-m', 'initial');
    assert.equal(gate('check-commit'), 1);
    writeFileSync(join(cwd, 'feature.txt'), 'reviewed');
    assert.equal(gate('approve'), 1);
    git('add', '.');
    assert.equal(gate('approve'), 0);
    assert.equal(gate('check-commit'), 0);
    writeFileSync(join(cwd, 'feature.txt'), 'modified');
    git('add', '.');
    assert.equal(gate('check-commit'), 1);
    writeFileSync(join(cwd, 'feature.txt'), 'reviewed');
    git('add', '.');
    git('commit', '-m', 'reviewed');
    const oid = git('rev-parse', 'HEAD');
    const update = `refs/heads/main ${oid} refs/heads/main ${'0'.repeat(40)}\n`;
    assert.equal(gate('check-push', update), 0);
    assert.equal(gate('check-commit'), 1);
    git('commit', '--allow-empty', '-m', 'unreviewed');
    assert.equal(gate('check-push', update.replace(oid, git('rev-parse', 'HEAD'))), 1);
    assert.equal(gate('check-push', `refs/heads/main ${'0'.repeat(40)} refs/heads/main ${oid}\n`), 1);
  } finally {
    // mkdtemp creates this specific fixture directory under the OS temp directory.
    assert.ok(cwd.startsWith(join(tmpdir(), 'blog-review-')));
    rmSync(cwd, { recursive: true, force: true });
  }
});
