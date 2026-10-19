import { afterEach, expect, it } from 'vitest';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkContentGitTree } from '../../src/lib/content-git-tree.mjs';
import { parseDocument } from 'yaml';

// 합성 저장소에서만 승인·커밋·push를 시험함. 실제 Blog의 승인 파일·Git 참조는 변경하지 않음.
const repository = fileURLToPath(new URL('../../', import.meta.url));
const base = join(repository, '.fragment-test');
const roots: string[] = [];
const postPath = 'src/content/blog/example/index.md';
const post = '---\ntitle: Example\ndescription: Description\ncategory: AI\npubDate: 2026-10-19\n---\nBody\n';
const gitEnvironment = { ...process.env };
for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete gitEnvironment[key];
function run(root: string, command: string, args: string[], input = '') {
  return spawnSync(command, args, { cwd: root, env: gitEnvironment, encoding: 'utf8', input, timeout: 20000, windowsHide: true });
}
function git(root: string, ...args: string[]) {
  const result = run(root, 'git', args); expect(result.status, result.stderr || result.stdout).toBe(0); return result.stdout.trim();
}
function put(root: string, path: string, source: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), source);
}
function copy(root: string, path: string) {
  if (!existsSync(join(repository, path))) return;
  mkdirSync(dirname(join(root, path)), { recursive: true }); copyFileSync(join(repository, path), join(root, path));
}
function approve(root: string) {
  const result = run(root, process.execPath, ['scripts/manual-review.mjs', 'approve']);
  expect(result.status, result.stderr).toBe(0);
}
function fixture() {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'content-gates-')); roots.push(root);
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'commit.gpgsign', 'false'); git(root, 'config', 'core.autocrlf', 'false'); git(root, 'config', 'core.hooksPath', '.githooks');
  // 기존 승인기는 HEAD를 요구함. 합성 저장소에만 빈 부모 객체를 준비함.
  const empty = git(root, 'mktree'); const seed = git(root, 'commit-tree', empty, '-m', 'Synthetic root'); git(root, 'update-ref', 'HEAD', seed);
  for (const file of ['.githooks/pre-commit', '.githooks/pre-push', 'scripts/manual-review.mjs', 'scripts/git-gates.mjs', 'src/lib/content-git-tree.mjs']) copy(root, file);
  for (const file of readdirSync(join(repository, 'src/lib'))) if (file.endsWith('.mjs')) copy(root, `src/lib/${file}`);
  for (const file of ['.githooks/pre-commit', '.githooks/pre-push']) chmodSync(join(root, file), 0o755);
  put(root, postPath, post);
  put(root, 'src/content/fragments/alpha.md', '---\nid: alpha\ntitle: Alpha\nsummary: Summary\ncategory: AI\n---\nBody\n');
  put(root, 'src/consts.ts', 'export const CATEGORIES = { AI: "#007FFF" };\n');
  put(root, 'config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n');
  git(root, 'add', '.'); approve(root); git(root, 'commit', '-qm', 'Fixture baseline');
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const path = relative(base, root);
    if (path.startsWith('..') || !path.startsWith('content-gates-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});

it('the real pre-commit hook rejects invalid staged content even when the working copy is valid', () => {
  const root = fixture(); const before = git(root, 'rev-parse', 'HEAD');
  put(root, postPath, post.replace('category: AI', 'category: Unregistered'));
  git(root, 'add', '--', postPath); approve(root);
  put(root, postPath, post); // 승인된 인덱스와 작업 폴더를 의도적으로 다르게 만듦.
  const result = run(root, 'git', ['commit', '-m', 'Invalid staged fixture']);
  expect(result.status).toBe(1);
  expect(result.stderr + result.stdout).toContain('category.unregistered');
  expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
  expect(readFileSync(join(root, postPath), 'utf8')).toBe(post);
  expect(git(root, 'show', `:${postPath}`)).toContain('Unregistered');
});

it('valid staged content can commit while an invalid working copy is preserved', () => {
  const root = fixture(); const reviewed = post.replace('title: Example', 'title: Reviewed');
  put(root, postPath, reviewed); git(root, 'add', '--', postPath); approve(root);
  const unreviewed = reviewed.replace('category: AI', 'category: Unregistered'); put(root, postPath, unreviewed);
  const result = run(root, 'git', ['commit', '-m', 'Valid staged fixture']);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout + result.stderr).toContain('Manual review gate passed');
  expect(result.stdout + result.stderr).toContain('콘텐츠 Git 검사 통과');
  expect(git(root, 'show', `HEAD:${postPath}`)).toBe(reviewed.trim());
  expect(readFileSync(join(root, postPath), 'utf8')).toBe(unreviewed);
});

it('untracked content is outside the staged tree and is left untouched', () => {
  const root = fixture(); put(root, postPath, post.replace('title: Example', 'title: Reviewed'));
  git(root, 'add', '--', postPath); approve(root);
  const path = 'src/content/blog/untracked/index.md'; put(root, path, 'Untracked invalid fixture');
  expect(run(root, 'git', ['commit', '-m', 'Reviewed tracked fixture']).status).toBe(0);
  expect(readFileSync(join(root, path), 'utf8')).toBe('Untracked invalid fixture');
  expect(run(root, 'git', ['ls-files', '--error-unmatch', path]).status).not.toBe(0);
});

it.each(['missing', 'changed-tree'])('the %s user approval still blocks the real pre-commit hook', state => {
  const root = fixture(); const before = git(root, 'rev-parse', 'HEAD');
  put(root, postPath, post.replace('title: Example', 'title: Reviewed')); git(root, 'add', '--', postPath); approve(root);
  if (state === 'missing') unlinkSync(join(root, git(root, 'rev-parse', '--git-path', 'manual-review.json')));
  else { put(root, postPath, post.replace('title: Example', 'title: Different')); git(root, 'add', '--', postPath); }
  const result = run(root, 'git', ['commit', '-m', 'Unapproved fixture']);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Manual review gate blocked');
  expect(result.stdout).not.toContain('콘텐츠 Git 검사 통과');
  expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
});

function remote(root: string) {
  const path = join(root, 'remote.git'); git(root, 'init', '--bare', '-q', path); return path;
}
it('the real pre-push hook checks the approved outgoing commit and ignores invalid working/index data', () => {
  const root = fixture(); const target = remote(root); const head = git(root, 'rev-parse', 'HEAD');
  put(root, postPath, post.replace('category: AI', 'category: Unregistered')); git(root, 'add', '--', postPath);
  put(root, 'src/consts.ts', 'invalid current configuration'); put(root, 'config/content-policy-baseline.json', '{invalid');
  const index = git(root, 'write-tree'); const result = run(root, 'git', ['push', target, 'HEAD:refs/heads/valid']);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('Manual review gate passed');
  expect(result.stdout).toContain('콘텐츠 Git 검사 통과');
  expect(git(root, '--git-dir', target, 'rev-parse', 'refs/heads/valid')).toBe(head);
  expect(git(root, 'write-tree')).toBe(index);
  expect(readFileSync(join(root, 'config/content-policy-baseline.json'), 'utf8')).toBe('{invalid');
});

it('the real pre-push hook rejects invalid outgoing content even with a valid HEAD and working copy', () => {
  const root = fixture(); const target = remote(root); const head = git(root, 'rev-parse', 'HEAD');
  put(root, postPath, post.replace('category: AI', 'category: Unregistered')); git(root, 'add', '--', postPath); approve(root);
  // 예전 정책 없이 생성된 커밋을 합성 Git 객체로 재현함. 실제 저장소 참조/보호 절차와 무관함.
  const tree = git(root, 'write-tree'); const outgoing = git(root, 'commit-tree', tree, '-p', head, '-m', 'Historical invalid fixture');
  git(root, 'read-tree', head); put(root, postPath, post);
  const result = run(root, 'git', ['push', target, `${outgoing}:refs/heads/invalid`]);
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain('Manual review gate passed');
  expect(result.stderr + result.stdout).toContain('category.unregistered');
  expect(run(root, 'git', ['--git-dir', target, 'rev-parse', '--verify', 'refs/heads/invalid']).status).not.toBe(0);
  expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  expect(readFileSync(join(root, postPath), 'utf8')).toBe(post);
});

it('multiple outgoing refs preserve the full pre-push input and check each unique tree', () => {
  const root = fixture(); const target = remote(root); const head = git(root, 'rev-parse', 'HEAD');
  const result = run(root, 'git', ['push', target, 'HEAD:refs/heads/one', 'HEAD:refs/heads/two']);
  expect(result.status, result.stderr).toBe(0);
  expect(git(root, '--git-dir', target, 'rev-parse', 'refs/heads/one')).toBe(head);
  expect(git(root, '--git-dir', target, 'rev-parse', 'refs/heads/two')).toBe(head);
});

it('the existing ref deletion prohibition still blocks a real push', () => {
  const root = fixture(); const target = remote(root); git(root, 'push', target, 'HEAD:refs/heads/keep');
  const before = git(root, '--git-dir', target, 'rev-parse', 'refs/heads/keep');
  const result = run(root, 'git', ['push', target, '--delete', 'keep']);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Ref deletion requires separate review');
  expect(git(root, '--git-dir', target, 'rev-parse', 'refs/heads/keep')).toBe(before);
});

it('a push with no updates is harmless and the gate runner cannot record approval', () => {
  const root = fixture(); const path = join(root, git(root, 'rev-parse', '--git-path', 'manual-review.json'));
  const before = readFileSync(path);
  expect(run(root, process.execPath, ['scripts/git-gates.mjs', 'check-push']).status).toBe(0);
  expect(run(root, process.execPath, ['scripts/git-gates.mjs', 'approve']).status).toBe(2);
  expect(readFileSync(path)).toEqual(before);
});

it.each(['120000', '160000'])('Git mode %s in a content path is rejected without following it', mode => {
  const root = fixture();
  const oid = mode === '160000' ? git(root, 'rev-parse', 'HEAD') : run(root, 'git', ['hash-object', '-w', '--stdin'], '../outside').stdout.trim();
  git(root, 'update-index', '--add', '--cacheinfo', mode, oid, 'src/content/blog/linked');
  const tree = git(root, 'write-tree');
  expect(() => checkContentGitTree(root, tree)).toThrow('git.snapshot');
  expect(readFileSync(join(root, postPath), 'utf8')).toBe(post);
});

it('Unicode and space-containing tracked paths retain exact diagnostics', () => {
  const root = fixture(); const path = 'src/content/blog/한글 경로/index.md';
  put(root, path, post.replace('category: AI', 'category: Unregistered')); git(root, 'add', '--', path); approve(root);
  const result = run(root, 'git', ['commit', '-m', 'Invalid Unicode fixture']);
  expect(result.status).toBe(1);
  expect(result.stderr + result.stdout).toContain(path);
  expect(readFileSync(join(root, path), 'utf8')).toContain('Unregistered');
});

it.each(['missing', 'different-parent'])('the %s approval also blocks a real push', state => {
  const root = fixture(); const target = remote(root); const head = git(root, 'rev-parse', 'HEAD');
  let outgoing = head;
  if (state === 'missing') unlinkSync(join(root, git(root, 'rev-parse', '--git-path', 'manual-review.json')));
  else outgoing = git(root, 'commit-tree', git(root, 'rev-parse', 'HEAD^{tree}'), '-p', head, '-m', 'Unreviewed extra fixture');
  const result = run(root, 'git', ['push', target, `${outgoing}:refs/heads/unapproved`]);
  expect(result.status).not.toBe(0);
  expect(result.stderr + result.stdout).toContain('Manual review gate blocked');
  expect(run(root, 'git', ['--git-dir', target, 'rev-parse', '--verify', 'refs/heads/unapproved']).status).not.toBe(0);
});

it('shared CI runs content policy and real operation builds before publishing the verified artifact', () => {
  const workflow = parseDocument(readFileSync(join(repository, '.github/workflows/verify.yml'), 'utf8'));
  expect(workflow.errors).toEqual([]);
  const verify = workflow.toJS() as { jobs: { checks: { steps: { run?: string; uses?: string }[] } } };
  const steps = verify.jobs.checks.steps; const commands = steps.filter(step => step.run).map(step => step.run);
  expect(commands).toContain('npm run content:check');
  expect(commands).toContain('npm run test:content-ops:build');
  expect(commands.indexOf('npm run content:check')).toBeLessThan(commands.indexOf('npm run build'));
  expect(commands.indexOf('npm run test:content-ops:build')).toBeLessThan(commands.indexOf('npm run build'));
  expect(steps.findIndex(step => step.uses?.startsWith('actions/upload-pages-artifact@'))).toBeGreaterThan(steps.findIndex(step => step.run === 'npm run build'));
  for (const file of ['ci.yml', 'deploy.yml']) {
    const parsed = parseDocument(readFileSync(join(repository, '.github/workflows', file), 'utf8'));
    expect(parsed.errors).toEqual([]);
    const caller = parsed.toJS() as { jobs: { verify: { uses: string }; deploy?: { needs: string } } };
    expect(caller.jobs.verify.uses).toBe('./.github/workflows/verify.yml');
    if (file === 'deploy.yml') expect(caller.jobs.deploy?.needs).toBe('verify');
  }
});

it('duplicate staged Fragment IDs are checked from the Git tree', () => {
  const root = fixture(); const path = 'src/content/fragments/duplicate.md';
  put(root, path, '---\nid: alpha\ntitle: Duplicate\nsummary: Summary\ncategory: AI\n---\nBody\n');
  git(root, 'add', '--', path); approve(root);
  const result = run(root, 'git', ['commit', '-m', 'Duplicate Fragment fixture']);
  expect(result.status).toBe(1);
  expect(result.stderr + result.stdout).toContain(path);
  expect(result.stderr + result.stdout).toContain('alpha');
});

it('staged category removal cannot be hidden by restoring the working configuration', () => {
  const root = fixture(); const path = 'src/consts.ts'; const before = readFileSync(join(root, path), 'utf8');
  put(root, path, 'export const CATEGORIES = {};\n'); git(root, 'add', '--', path); approve(root); put(root, path, before);
  const result = run(root, 'git', ['commit', '-m', 'Invalid category fixture']);
  expect(result.status).toBe(1);
  expect(result.stderr + result.stdout).toContain('category.unregistered');
  expect(readFileSync(join(root, path), 'utf8')).toBe(before);
});

it('baseline exceptions are read from the reviewed tree and cannot permit a new path', () => {
  const root = fixture(); const baseline = 'config/content-policy-baseline.json';
  const allowed = JSON.stringify({ version: 1, exceptions: [{ rule: 'category.unregistered', path: postPath, value: 'Legacy' }] });
  put(root, postPath, post.replace('category: AI', 'category: Legacy')); put(root, baseline, allowed);
  git(root, 'add', '--', postPath, baseline); approve(root); put(root, baseline, '{"version":1,"exceptions":[]}');
  expect(run(root, 'git', ['commit', '-m', 'Exact legacy exception fixture']).status).toBe(0);
  put(root, baseline, allowed);
  const path = 'src/content/blog/new-legacy/index.md'; put(root, path, post.replace('category: AI', 'category: Legacy'));
  git(root, 'add', '--', path); approve(root);
  const result = run(root, 'git', ['commit', '-m', 'New unregistered fixture']);
  expect(result.status).toBe(1);
  expect(result.stderr + result.stdout).toContain('category.unregistered');
  expect(result.stderr + result.stdout).toContain(path);
}, 15000);

it('flat blog Markdown remains outside the collection rules', () => {
  const root = fixture(); const path = 'src/content/blog/uncollected.md'; put(root, path, 'Not a collected post');
  git(root, 'add', '--', path); approve(root);
  expect(run(root, 'git', ['commit', '-m', 'Uncollected flat fixture']).status).toBe(0);
  expect(readFileSync(join(root, path), 'utf8')).toBe('Not a collected post');
});

it('a missing staged policy baseline is a failure rather than an empty exception list', () => {
  const root = fixture(); git(root, 'rm', '--', 'config/content-policy-baseline.json'); approve(root);
  const result = run(root, 'git', ['commit', '-m', 'Missing policy fixture']);
  expect(result.status).toBe(1);
  expect(result.stderr + result.stdout).toContain('config/content-policy-baseline.json');
});

it('the repository tracks executable hooks so fresh Linux checkouts do not silently skip them', () => {
  const result = run(repository, 'git', ['ls-files', '--stage', '--', '.githooks/pre-commit', '.githooks/pre-push']);
  expect(result.status, result.stderr).toBe(0);
  const entries = result.stdout.trim().split('\n'); expect(entries).toHaveLength(2);
  for (const entry of entries) expect(entry).toMatch(/^100755 /);
});
