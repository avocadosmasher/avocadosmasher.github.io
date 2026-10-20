import { afterEach, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { parseOperationRequest, sha256 } from '../../src/lib/content-operation-contract.mjs';

// Existing CLI compatibility scenarios; no new runtime behavior or artificial Red.
const repository = fileURLToPath(new URL('../../', import.meta.url));
const base = join(repository, '.fragment-test');
const roots: string[] = [];
const settings = 'export const CATEGORIES = { AI: "#007FFF" };\nexport const PROJECTS = [];\n';
const handoff = readFileSync(join(repository, 'templates/ai-content/workspace/HANDOFF.example.md'), 'utf8');
const draft = readFileSync(join(repository, 'templates/ai-content/workspace/draft.example.md'), 'utf8');
const workspace = (task: string) => `.content-ops/local/tasks/${task}`;
type Report = { ok: boolean; status?: string; written?: string[]; plan?: { plan_hash: string } };
type Prepared = { requestFile: string; planFile: string; hash: string };

function put(root: string, path: string, bytes: string | Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}
function fixture() {
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'content-workspace-'));
  roots.push(root);
  for (const path of ['src/content/blog', 'src/content/fragments']) mkdirSync(join(root, path), { recursive: true });
  put(root, 'src/consts.ts', settings);
  put(root, 'config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n');
  put(root, 'STATUS.md', 'Unrelated development review pending\n');
  put(root, 'docs/log/INDEX.md', 'Development index must remain unchanged\n');
  return root;
}
function task(root: string, name: string) {
  put(root, `${workspace(name)}/HANDOFF.md`, handoff.replace(/{{[^}]+}}/g, 'Not observed'));
  put(root, `${workspace(name)}/draft.md`, draft);
  put(root, `${workspace(name)}/notes/source.md`, `Source notes for ${name}\n`);
}
function blog(id: string, name: string, category = 'AI') {
  return { version: 1, request_id: id, resource: 'blog', operation: 'create',
    target: { path: `src/content/blog/${name}/index.md` }, baseline: { sha256: null },
    content: { source: `---\ntitle: ${name}\ndescription: Workspace fixture\ncategory: ${category}\npubDate: 2026-10-20\ndraft: true\n---\nBody\n` } };
}
function snapshot(root: string) {
  const files: Record<string, { bytes: string; mtime: number }> = {};
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files[relative(root, path).replaceAll('\\', '/')] = {
        bytes: readFileSync(path).toString('base64'), mtime: statSync(path).mtimeMs,
      };
    }
  }
  visit(root);
  return files;
}
function cli(root: string, args: string[], cwd = root) {
  const result = spawnSync(process.execPath, [join(repository, 'scripts/content-ops.mjs'), ...args, '--root', root, '--json'],
    { cwd, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  if (result.error) throw result.error;
  if (!result.stdout.trim()) throw new Error(`CLI returned no JSON: ${result.stderr}`);
  return { status: result.status, report: JSON.parse(result.stdout) as Report };
}
function prepare(root: string, name: string, input: unknown): Prepared {
  const request = parseOperationRequest(input);
  const prefix = `${workspace(name)}/requests/${request.request_id}`;
  const requestFile = `${prefix}/request.json`, planFile = `${prefix}/plan.json`;
  put(root, requestFile, JSON.stringify(input, null, 2) + '\n');
  const result = cli(root, ['plan', '--request', requestFile, '--out', planFile]);
  expect(result.status, JSON.stringify(result.report)).toBe(0);
  expect(result.report).toMatchObject({ ok: true, status: 'planned' });
  if (!result.report.plan) throw new Error('Expected saved plan');
  return { requestFile, planFile, hash: result.report.plan.plan_hash };
}
function apply(root: string, p: Prepared, cwd = root) {
  return cli(root, ['apply', '--request', join(root, p.requestFile), '--plan', p.planFile, '--expect-plan', p.hash], cwd);
}
function applied(root: string, p: Prepared) {
  const result = apply(root, p);
  expect(result.status, JSON.stringify(result.report)).toBe(0);
  expect(result.report).toMatchObject({ ok: true, status: 'applied' });
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const child = relative(base, root);
    if (child.startsWith('..') || !child.startsWith('content-workspace-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});

it('two workspace tasks preserve each other and development records across fresh CLI replays', () => {
  const root = fixture(); task(root, 'task-a'); task(root, 'task-b');
  const a = prepare(root, 'task-a', blog('workspace-create-a', 'workspace-a'));
  const b = prepare(root, 'task-b', blog('workspace-create-b', 'workspace-b'));
  const before = snapshot(root);
  applied(root, a); applied(root, b);
  const after = snapshot(root);
  for (const [path, original] of Object.entries(before)) expect(after[path], path).toEqual(original);
  for (const p of [a, b]) {
    expect(apply(root, p)).toMatchObject({ status: 0, report: { status: 'unchanged', written: [] } });
    expect(cli(root, ['plan', '--request', p.requestFile, '--out', p.planFile]))
      .toMatchObject({ status: 0, report: { status: 'unchanged' } });
  }
  expect(snapshot(root)).toEqual(after);
}, 20000);

it('one writing task preserves category, creation and follow-up requests independently', () => {
  const root = fixture(); task(root, 'writing');
  const category = prepare(root, 'writing', { version: 1, request_id: 'workspace-category', resource: 'category', operation: 'create',
    target: { path: 'src/consts.ts', key: 'Workspace' }, baseline: { sha256: sha256(settings) }, content: { color: '#abcdef' } });
  applied(root, category);
  const input = blog('workspace-post-create', 'workspace-post', 'Workspace');
  const created = prepare(root, 'writing', input); applied(root, created);
  const before = snapshot(root);
  const update = prepare(root, 'writing', { version: 1, request_id: 'workspace-post-update', resource: 'blog', operation: 'update',
    target: input.target, baseline: { sha256: sha256(readFileSync(join(root, input.target.path))) }, changes: { title: 'Updated title' } });
  applied(root, update);
  const source = readFileSync(join(root, input.target.path), 'utf8');
  const metadata = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  expect(metadata).toBeTruthy();
  expect(parseYaml(metadata!)).toMatchObject({ title: 'Updated title' });
  const after = snapshot(root);
  for (const [path, original] of Object.entries(before)) if (path !== input.target.path) expect(after[path], path).toEqual(original);
  for (const id of ['workspace-category', 'workspace-post-create', 'workspace-post-update'])
    expect(existsSync(join(root, `.content-ops/receipts/${id}.json`))).toBe(true);
  expect(apply(root, update)).toMatchObject({ status: 0, report: { status: 'unchanged' } });
  expect(snapshot(root)).toEqual(after);
}, 20000);

it('stale handoff text neither repeats a completed write nor hides external file edits', () => {
  const root = fixture(); task(root, 'stale');
  const input = blog('workspace-stale', 'workspace-stale');
  put(root, `${workspace('stale')}/HANDOFF.md`, 'Not applied yet\n');
  const p = prepare(root, 'stale', input); applied(root, p);
  const after = snapshot(root);
  expect(apply(root, p)).toMatchObject({ status: 0, report: { status: 'unchanged' } });
  expect(snapshot(root)).toEqual(after);
  put(root, `${workspace('stale')}/HANDOFF.md`, 'Everything completed\n');
  put(root, input.target.path, input.content.source.replace('Body', 'External edit'));
  const edited = snapshot(root);
  const result = apply(root, p);
  expect(result.status).toBe(1);
  expect(JSON.stringify(result.report)).toContain('receipt.state-mismatch');
  expect(snapshot(root)).toEqual(edited);
}, 20000);

it('a different frozen input with the same ID is rejected without losing the original request', () => {
  const root = fixture(); task(root, 'conflict');
  const input = blog('workspace-input-conflict', 'workspace-conflict');
  const p = prepare(root, 'conflict', input); applied(root, p);
  const alternate = `${workspace('conflict')}/alternate.json`;
  put(root, alternate, JSON.stringify({ ...input, content: { source: input.content.source.replace('Body', 'Different body') } }));
  const before = snapshot(root);
  const result = apply(root, { ...p, requestFile: alternate });
  expect(result.status).toBe(1);
  expect(JSON.stringify(result.report)).toContain('request.conflict');
  expect(snapshot(root)).toEqual(before);
}, 20000);

it('cross-copy handoff needs source assets and an explicit root even when request and plan exist', () => {
  const origin = fixture(), receiver = fixture(); task(origin, 'transfer');
  const id = 'workspace-asset-transfer';
  const source = `${workspace('transfer')}/requests/${id}/assets/diagram.png`;
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/t4sAAAAASUVORK5CYII=', 'base64');
  put(origin, source, bytes);
  const input = blog(id, 'workspace-transfer');
  const p = prepare(origin, 'transfer', { ...input,
    assets: [{ source, target: 'src/content/blog/workspace-transfer/diagram.png', sha256: sha256(bytes) }] });
  for (const path of [p.requestFile, p.planFile]) put(receiver, path, readFileSync(join(origin, path)));
  const originBefore = snapshot(origin), receiverBefore = snapshot(receiver);
  const failed = apply(receiver, p, origin);
  expect(failed.status).toBe(1);
  expect(JSON.stringify(failed.report)).toContain(source);
  expect(snapshot(receiver)).toEqual(receiverBefore);
  put(receiver, source, bytes);
  expect(apply(receiver, p, origin)).toMatchObject({ status: 0, report: { status: 'applied' } });
  expect(readFileSync(join(receiver, 'src/content/blog/workspace-transfer/diagram.png'))).toEqual(bytes);
  expect(existsSync(join(origin, input.target.path))).toBe(false);
  expect(snapshot(origin)).toEqual(originBefore);
}, 20000);

it('a transferred update cannot overwrite a receiver with a different baseline', () => {
  const origin = fixture(), receiver = fixture(); task(origin, 'baseline');
  const seed = blog('seed', 'workspace-baseline');
  put(origin, seed.target.path, seed.content.source);
  put(receiver, seed.target.path, seed.content.source.replace('Body', 'Receiver edit'));
  const p = prepare(origin, 'baseline', { version: 1, request_id: 'workspace-baseline-update', resource: 'blog', operation: 'update',
    target: seed.target, baseline: { sha256: sha256(seed.content.source) }, changes: { title: 'New title' } });
  for (const path of [p.requestFile, p.planFile]) put(receiver, path, readFileSync(join(origin, path)));
  const original = snapshot(origin), before = snapshot(receiver);
  const result = apply(receiver, p);
  expect(result.status).toBe(1);
  expect(JSON.stringify(result.report)).toContain('baseline.conflict');
  expect(snapshot(receiver)).toEqual(before);
  expect(snapshot(origin)).toEqual(original);
}, 20000);

it('nested request recovery refuses to invent a missing journal and preserves all files', () => {
  const root = fixture(); task(root, 'recover');
  const p = prepare(root, 'recover', blog('workspace-recover', 'workspace-recover'));
  const before = snapshot(root);
  const result = cli(root, ['recover', '--request', p.requestFile, '--plan', p.planFile, '--expect-plan', p.hash]);
  expect(result.status).toBe(1);
  expect(JSON.stringify(result.report)).toContain('recovery.missing');
  expect(snapshot(root)).toEqual(before);
}, 20000);
