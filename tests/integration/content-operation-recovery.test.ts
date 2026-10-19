import { afterEach, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { hostname } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { applyProjectOperation, planProjectOperation } from '../../src/lib/content-project-ops.mjs';
import { createOperationReceipt, parseOperationCommand, sha256 } from '../../src/lib/content-operation-contract.mjs';
import { recoverOperation } from '../../src/lib/content-operation-recovery.mjs';
import { applyCategoryOperation, planCategoryOperation } from '../../src/lib/content-category-ops.mjs';
import { applyBlogCreate, planBlogCreate } from '../../src/lib/content-blog-create.mjs';
import { applyBlogUpdate, planBlogUpdate } from '../../src/lib/content-blog-update.mjs';
import { applyFragmentOperation, planFragmentOperation } from '../../src/lib/content-fragment-ops.mjs';

const fault = vi.hoisted(() => ({ rename: false, receipt: false }));
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, openSync: (...args: Parameters<typeof fs.openSync>) => {
    if (fault.receipt && String(args[0]).replaceAll('\\', '/').includes('/.content-ops/receipts/')) {
      throw Object.assign(new Error('receipt fixture denied'), { code: 'EACCES' });
    }
    return fs.openSync(...args);
  }, renameSync: (...args: Parameters<typeof fs.renameSync>) => {
    if (fault.rename) throw Object.assign(new Error('occupied fixture file'), { code: 'EBUSY' });
    return fs.renameSync(...args);
  } };
});

const repository = fileURLToPath(new URL('../../', import.meta.url));
const base = join(repository, '.fragment-test');
const roots: string[] = [];
const children: ChildProcess[] = [];
const original = 'export const CATEGORIES = { AI: "#007FFF" };\nexport const PROJECTS = [];\n';
const lock = '.content-ops/local/apply.lock';
function put(root: string, path: string, bytes: string | Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes);
}
function fixture() {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'operation-recovery-')); roots.push(root);
  mkdirSync(join(root, 'src/content/blog'), { recursive: true }); mkdirSync(join(root, 'src/content/fragments'), { recursive: true });
  put(root, 'src/consts.ts', original); put(root, 'config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n');
  return root;
}
const request = () => ({ version: 1, request_id: 'recovery-project', resource: 'project', operation: 'create',
  target: { path: 'src/consts.ts' }, baseline: { sha256: sha256(original) }, content: { name: 'Project', description: 'Description' } });
function projectPlan(root: string, input = request()) {
  const prepared = planProjectOperation(root, input);
  if (!('plan' in prepared) || !prepared.plan) throw new Error('Expected plan');
  return prepared.plan;
}
function recover(root: string, input: unknown, plan: { plan_hash: string }) {
  put(root, 'request.json', JSON.stringify(input)); put(root, '.content-ops/local/plan.json', JSON.stringify(plan));
  const result = spawnSync(process.execPath, [join(repository, 'scripts/content-ops.mjs'), 'recover', '--request', 'request.json',
    '--plan', '.content-ops/local/plan.json', '--expect-plan', plan.plan_hash, '--root', root, '--json'],
  { cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true });
  return { ...result, report: result.stdout ? JSON.parse(result.stdout) : null };
}
afterEach(async () => {
  fault.rename = false; fault.receipt = false;
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
    const ended = once(child, 'close'); child.kill('SIGKILL'); await ended;
  }
  for (const root of roots.splice(0)) {
    const path = relative(base, root);
    if (path.startsWith('..') || !path.startsWith('operation-recovery-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});

it('a failed replacement retains a recovery journal while preserving the original', () => {
  const root = fixture(); const input = request(); const plan = projectPlan(root);
  fault.rename = true;
  expect(() => applyProjectOperation(root, input, plan, plan.plan_hash)).toThrow('write.failed');
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
  expect(existsSync(join(root, `.content-ops/local/journals/${input.request_id}.json`))).toBe(true);
  expect(existsSync(join(root, lock))).toBe(false);
});

it('explicit recovery resumes a failed replacement and replay leaves content and receipt unchanged', () => {
  const root = fixture(); const input = request(); const plan = projectPlan(root);
  fault.rename = true;
  expect(() => applyProjectOperation(root, input, plan, plan.plan_hash)).toThrow('write.failed');
  fault.rename = false;
  const result = recover(root, input, plan);
  expect(result.report).toMatchObject({ ok: true, status: 'applied', recovered: true });
  expect(result.status).toBe(0);
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toContain('Project');
  expect(existsSync(join(root, `.content-ops/receipts/${input.request_id}.json`))).toBe(true);
  expect(existsSync(join(root, `.content-ops/local/journals/${input.request_id}.json`))).toBe(false);
  expect(applyProjectOperation(root, input, plan, plan.plan_hash)).toMatchObject({ status: 'unchanged', written: [] });
});

it('recovery can reclaim a lock only after its same-host owner process has exited', () => {
  const root = fixture(); const input = request(); const plan = projectPlan(root);
  fault.rename = true;
  expect(() => applyProjectOperation(root, input, plan, plan.plan_hash)).toThrow('write.failed');
  fault.rename = false;
  const child = spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
  expect(child.status).toBe(0);
  put(root, `${lock}/owner.json`, JSON.stringify({ version: 1, token: randomUUID(), pid: child.pid, host: hostname() }));
  expect(recover(root, input, plan).report).toMatchObject({ ok: true, status: 'applied', recovered: true });
  expect(existsSync(join(root, lock))).toBe(false);
});

it('a live repository lock blocks apply without touching content or its owner', () => {
  const root = fixture(); const input = request(); const plan = projectPlan(root);
  const owner = JSON.stringify({ version: 1, token: randomUUID(), pid: process.pid, host: hostname() });
  put(root, `${lock}/owner.json`, owner);
  expect(() => applyProjectOperation(root, input, plan, plan.plan_hash)).toThrow('lock.busy');
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
  expect(readFileSync(join(root, `${lock}/owner.json`), 'utf8')).toBe(owner);
  expect(readdirSync(join(root, '.content-ops/local'))).toEqual(['apply.lock']);
});

const blogSource = '---\ntitle: Existing\ndescription: Description\ncategory: AI\npubDate: 2026-10-19\n---\nBody\n';
const fragmentSource = (id: string, relations: unknown[] = []) => `---\nid: ${id}\ntitle: ${id}\nsummary: Summary\ncategory: AI\nrelations: ${JSON.stringify(relations)}\n---\nBody\n`;
const variants = [
  { name: 'blog create with asset', build(root: string) {
    put(root, 'input/image.svg', '<svg/>');
    return { prepare: planBlogCreate, apply: applyBlogCreate, input: { version: 1, request_id: 'recover-blog-create', resource: 'blog', operation: 'create',
      target: { path: 'src/content/blog/new-post/index.md' }, baseline: { sha256: null }, content: { source: blogSource },
      assets: [{ source: 'input/image.svg', target: 'src/content/blog/new-post/image.svg', sha256: sha256('<svg/>') }] } };
  } },
  { name: 'blog update', build(root: string) {
    put(root, 'src/content/blog/existing/index.md', blogSource);
    return { prepare: planBlogUpdate, apply: applyBlogUpdate, input: { version: 1, request_id: 'recover-blog-update', resource: 'blog', operation: 'update',
      target: { path: 'src/content/blog/existing/index.md' }, baseline: { sha256: sha256(blogSource) }, changes: { title: 'Updated' } } };
  } },
  { name: 'Fragment create', build(_root: string) {
    return { prepare: planFragmentOperation, apply: applyFragmentOperation, input: { version: 1, request_id: 'recover-fragment-create', resource: 'fragment', operation: 'create',
      target: { path: 'src/content/fragments/new-card.md', id: 'new-card' }, baseline: { sha256: null }, content: { source: fragmentSource('new-card') } } };
  } },
  { name: 'Fragment update with related file', build(root: string) {
    const primary = fragmentSource('alpha'); const related = fragmentSource('beta', [{ target: 'alpha', type: 'related' }]);
    put(root, 'src/content/fragments/alpha.md', primary); put(root, 'src/content/fragments/beta.md', related);
    return { prepare: planFragmentOperation, apply: applyFragmentOperation, input: { version: 1, request_id: 'recover-fragment-update', resource: 'fragment', operation: 'update',
      target: { path: 'src/content/fragments/alpha.md', id: 'alpha' }, baseline: { sha256: sha256(primary) }, changes: { relations: [{ target: 'beta', type: 'related' }] },
      related_targets: [{ path: 'src/content/fragments/beta.md', id: 'beta', sha256: sha256(related) }] } };
  } },
  { name: 'category create', build(_root: string) {
    return { prepare: planCategoryOperation, apply: applyCategoryOperation, input: { version: 1, request_id: 'recover-category-create', resource: 'category', operation: 'create',
      target: { path: 'src/consts.ts', key: 'New' }, baseline: { sha256: sha256(original) }, content: { color: '#123456' } } };
  } },
  { name: 'project create', build(_root: string) { return { prepare: planProjectOperation, apply: applyProjectOperation, input: request() }; } },
];

it.each(variants)('$name uses the same repository lock', variant => {
  const root = fixture(); const { input, prepare, apply } = variant.build(root); const prepared = prepare(root, input);
  if (!('plan' in prepared) || !prepared.plan) throw new Error('Expected plan');
  put(root, `${lock}/owner.json`, JSON.stringify({ version: 1, token: randomUUID(), pid: process.pid, host: hostname() }));
  expect(() => apply(root, input, prepared.plan, prepared.plan.plan_hash)).toThrow('lock.busy');
});

it.each(variants)('$name recovers a lost receipt without rewriting completed content', variant => {
  const root = fixture(); const { input, prepare, apply } = variant.build(root); const prepared = prepare(root, input);
  if (!('plan' in prepared) || !prepared.plan) throw new Error('Expected plan');
  const plan = prepared.plan;
  fault.receipt = true;
  expect(() => apply(root, input, plan, plan.plan_hash)).toThrow('write.failed');
  fault.receipt = false;
  const state = plan.files.map((file: { path: string }) => ({ path: file.path, bytes: readFileSync(join(root, file.path)).toString('base64'), mtime: statSync(join(root, file.path)).mtimeMs }));
  const result = recover(root, input, plan);
  expect(result.report).toMatchObject({ ok: true, status: 'applied', recovered: true, written: [`.content-ops/receipts/${input.request_id}.json`] });
  expect(plan.files.map((file: { path: string }) => ({ path: file.path, bytes: readFileSync(join(root, file.path)).toString('base64'), mtime: statSync(join(root, file.path)).mtimeMs }))).toEqual(state);
  expect(apply(root, input, plan, plan.plan_hash)).toMatchObject({ status: 'unchanged', written: [] });
});

function interrupted(root: string) {
  const input = request(); const plan = projectPlan(root);
  fault.rename = true;
  expect(() => applyProjectOperation(root, input, plan, plan.plan_hash)).toThrow('write.failed');
  fault.rename = false;
  const path = `.content-ops/local/journals/${input.request_id}.json`;
  const journal = JSON.parse(readFileSync(join(root, path), 'utf8'));
  return { input, plan, path, journal };
}
it('pending work blocks another apply instead of silently merging partial state', () => {
  const root = fixture(); interrupted(root);
  const input = { ...request(), request_id: 'another-project' }; const plan = projectPlan(root, input);
  expect(() => applyProjectOperation(root, input, plan, plan.plan_hash)).toThrow('recovery.required');
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
});
it('recovery preserves an external edit and retains its journal', () => {
  const root = fixture(); const { input, plan, path } = interrupted(root);
  const external = original + '// External edit\n'; put(root, 'src/consts.ts', external);
  expect(recover(root, input, plan).report.diagnostics[0].rule).toBe('recovery.conflict');
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(external);
  expect(existsSync(join(root, path))).toBe(true);
});
it.each(['missing', 'changed'])('recovery rejects %s staging bytes before any content write', mode => {
  const root = fixture(); const { input, plan, journal } = interrupted(root);
  const path = `.content-ops/local/stages/${journal.stage_id}/0.bin`;
  if (mode === 'missing') unlinkSync(join(root, path)); else put(root, path, 'Forged staging');
  expect(recover(root, input, plan).report.diagnostics[0].rule).toBe('recovery.staging');
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
});
it.each(['request_hash', 'plan_hash', 'stage_id', 'extra'])('recovery rejects invalid journal field %s', field => {
  const root = fixture(); const { input, plan, path, journal } = interrupted(root);
  journal[field] = field === 'stage_id' ? '../escape' : '0'.repeat(64); put(root, path, JSON.stringify(journal));
  expect(recover(root, input, plan).report.ok).toBe(false);
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
});
it.each(['live', 'foreign-host', 'invalid-owner', 'prior-recovery'])('recovery retains a %s lock', kind => {
  const root = fixture(); const { input, plan } = interrupted(root);
  const child = spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
  const owner = JSON.stringify({ version: 1, token: randomUUID(), pid: kind === 'live' ? process.pid : child.pid,
    host: kind === 'foreign-host' ? hostname() + '-other' : hostname() });
  put(root, `${lock}/owner.json`, kind === 'invalid-owner' ? '{}' : owner);
  if (kind === 'prior-recovery') put(root, `${lock}/recovery.json`, owner);
  expect(recover(root, input, plan).report.ok).toBe(false);
  expect(readFileSync(join(root, `${lock}/owner.json`), 'utf8')).toBe(kind === 'invalid-owner' ? '{}' : owner);
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
});
it('recovery revalidates current repository policy before resuming', () => {
  const root = fixture(); const { input, plan } = interrupted(root);
  put(root, 'src/content/blog/invalid/index.md', blogSource.replace('category: AI', 'category: Unregistered'));
  expect(recover(root, input, plan).report.diagnostics[0].rule).toBe('content.invalid');
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
});

async function pauseApply(root: string, input: { request_id: string }, plan: { plan_hash: string }, point: 'journal' | 'replacement' | 'receipt' | 'new-content') {
  put(root, 'frozen-request.json', JSON.stringify(input)); put(root, '.content-ops/local/frozen-plan.json', JSON.stringify(plan));
  const gate = join(root, 'continue-gate');
  // 실제 CLI 프로세스의 I/O 경계에서 정지함. 운영 명령에는 테스트용 옵션·환경 분기를 넣지 않음.
  put(root, 'pause.mjs', `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const gate = ${JSON.stringify(gate)}, point = ${JSON.stringify(point)}, id = ${JSON.stringify(input.request_id)};
let stopped = false; const descriptors = new Map();
const pause = () => { if(stopped) return; stopped = true; process.send({paused:true}); while(!fs.existsSync(gate)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20); };
const link = fs.linkSync; fs.linkSync = (...args) => { const result = link(...args); if(point==='journal' && String(args[1]).replaceAll('\\\\','/').endsWith('/journals/'+id+'.json')) pause(); return result; };
const rename = fs.renameSync; fs.renameSync = (...args) => { const result = rename(...args); if(point==='replacement' && String(args[1]).replaceAll('\\\\','/').endsWith('/alpha.md')) pause(); return result; };
const open = fs.openSync; fs.openSync = (...args) => { const fd = open(...args); descriptors.set(fd,String(args[0]).replaceAll('\\\\','/')); return fd; };
const sync = fs.fsyncSync; fs.fsyncSync = fd => { const result = sync(fd); const path = descriptors.get(fd) || ''; if(point==='receipt' && path.endsWith('/receipts/'+id+'.json')) pause(); if(point==='new-content' && path.endsWith('/new-post/index.md')) pause(); return result; };
syncBuiltinESMExports();`);
  const child = spawn(process.execPath, ['--import', pathToFileURL(join(root, 'pause.mjs')).href, join(repository, 'scripts/content-ops.mjs'),
    'apply', '--request', 'frozen-request.json', '--plan', '.content-ops/local/frozen-plan.json', '--expect-plan', plan.plan_hash, '--root', root, '--json'],
  { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  children.push(child);
  let stdout = ''; let stderr = ''; child.stdout?.on('data', value => { stdout += value; }); child.stderr?.on('data', value => { stderr += value; });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Child pause timed out: ' + stderr + stdout)), 12000);
    child.once('message', () => { clearTimeout(timer); resolve(); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Child exited before pause: ' + stderr + stdout)); });
  });
  return { child, async finish() { const closed = once(child, 'close'); put(root, 'continue-gate', 'continue'); await closed; return JSON.parse(stdout); },
    async kill() { const closed = once(child, 'close'); child.kill('SIGKILL'); await closed; } };
}

it('two real CLI processes cannot apply concurrently and the later stale plan is rejected', async () => {
  const root = fixture(); const input = request(); const plan = projectPlan(root);
  const other = { ...request(), request_id: 'other-project', content: { name: 'Other', description: 'Other description' } };
  const otherPlan = projectPlan(root, other);
  const paused = await pauseApply(root, input, plan, 'journal');
  put(root, 'other-request.json', JSON.stringify(other)); put(root, '.content-ops/local/other-plan.json', JSON.stringify(otherPlan));
  const result = spawnSync(process.execPath, [join(repository, 'scripts/content-ops.mjs'), 'apply', '--request', 'other-request.json',
    '--plan', '.content-ops/local/other-plan.json', '--expect-plan', otherPlan.plan_hash, '--root', root, '--json'],
  { cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true });
  expect(JSON.parse(result.stdout).diagnostics[0].rule).toBe('lock.busy');
  expect(result.status).toBe(1);
  expect(await paused.finish()).toMatchObject({ ok: true, status: 'applied' });
  expect(() => applyProjectOperation(root, other, otherPlan, otherPlan.plan_hash)).toThrow('baseline.conflict');
});
it('an external edit during preparation is preserved and reported as a conflict', async () => {
  const root = fixture(); const input = request(); const plan = projectPlan(root);
  const paused = await pauseApply(root, input, plan, 'journal');
  const external = original + '// New external value\n'; put(root, 'src/consts.ts', external);
  expect((await paused.finish()).diagnostics[0].rule).toBe('baseline.conflict');
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(external);
  expect(recover(root, input, plan).report.diagnostics[0].rule).toBe('recovery.conflict');
});
it('a killed multi-file Fragment apply resumes only the remaining related file', async () => {
  const root = fixture(); const { input, prepare } = variants[3].build(root); const prepared = prepare(root, input);
  if (!('plan' in prepared) || !prepared.plan) throw new Error('Expected plan');
  const plan = prepared.plan; const paused = await pauseApply(root, input, plan, 'replacement');
  const primary = readFileSync(join(root, input.target.path)); const mtime = statSync(join(root, input.target.path)).mtimeMs;
  expect(primary.toString()).toContain('beta');
  expect(readFileSync(join(root, 'src/content/fragments/beta.md'), 'utf8')).toContain('alpha');
  await paused.kill();
  expect(recover(root, input, plan).report).toMatchObject({ ok: true, status: 'applied', recovered: true,
    written: ['src/content/fragments/beta.md', `.content-ops/receipts/${input.request_id}.json`] });
  expect(readFileSync(join(root, input.target.path))).toEqual(primary);
  expect(statSync(join(root, input.target.path)).mtimeMs).toBe(mtime);
  expect(readFileSync(join(root, 'src/content/fragments/beta.md'), 'utf8')).not.toContain('"alpha"');
});
it('a killed blog creation resumes the missing asset without rewriting the completed Markdown', async () => {
  const root = fixture(); const { input, prepare } = variants[0].build(root); const prepared = prepare(root, input);
  if (!('plan' in prepared) || !prepared.plan) throw new Error('Expected plan');
  const plan = prepared.plan; const paused = await pauseApply(root, input, plan, 'new-content');
  const source = readFileSync(join(root, input.target.path)); const mtime = statSync(join(root, input.target.path)).mtimeMs;
  expect(existsSync(join(root, 'src/content/blog/new-post/image.svg'))).toBe(false);
  await paused.kill();
  expect(recover(root, input, plan).report).toMatchObject({ ok: true, recovered: true,
    written: ['src/content/blog/new-post/image.svg', `.content-ops/receipts/${input.request_id}.json`] });
  expect(readFileSync(join(root, input.target.path))).toEqual(source);
  expect(statSync(join(root, input.target.path)).mtimeMs).toBe(mtime);
});
it('a killed completed receipt is recognized and only local recovery materials are removed', async () => {
  const root = fixture(); const input = request(); const plan = projectPlan(root);
  const paused = await pauseApply(root, input, plan, 'receipt'); await paused.kill();
  const target = join(root, input.target.path); const receipt = join(root, `.content-ops/receipts/${input.request_id}.json`);
  const state = [target, receipt].map(path => ({ bytes: readFileSync(path).toString('base64'), mtime: statSync(path).mtimeMs }));
  expect(recover(root, input, plan).report).toMatchObject({ ok: true, status: 'unchanged', recovered: true, written: [] });
  expect([target, receipt].map(path => ({ bytes: readFileSync(path).toString('base64'), mtime: statSync(path).mtimeMs }))).toEqual(state);
});

it('recovery refuses a receipt whose content was never applied', () => {
  const root = fixture(); const { input, plan } = interrupted(root);
  const path = `.content-ops/receipts/${input.request_id}.json`;
  const receipt = JSON.stringify(createOperationReceipt(input, plan)); put(root, path, receipt);
  expect(recover(root, input, plan).report.diagnostics[0].rule).toBe('receipt.state-mismatch');
  expect(readFileSync(join(root, path), 'utf8')).toBe(receipt);
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
});
it('recovery preserves a malformed receipt rather than replacing it', () => {
  const root = fixture(); const { input, plan } = interrupted(root);
  const path = `.content-ops/receipts/${input.request_id}.json`; put(root, path, '{incomplete');
  expect(recover(root, input, plan).report.diagnostics[0].rule).toBe('input.json');
  expect(readFileSync(join(root, path), 'utf8')).toBe('{incomplete');
});
it('recovery refuses a partially written new document instead of deleting or overwriting it', () => {
  const root = fixture(); const { input, prepare, apply } = variants[0].build(root); const prepared = prepare(root, input);
  if (!('plan' in prepared) || !prepared.plan) throw new Error('Expected plan');
  fault.receipt = true;
  expect(() => apply(root, input, prepared.plan, prepared.plan.plan_hash)).toThrow('write.failed'); fault.receipt = false;
  put(root, input.target.path, 'Partial bytes');
  expect(recover(root, input, prepared.plan).report.diagnostics[0].rule).toBe('recovery.conflict');
  expect(readFileSync(join(root, input.target.path), 'utf8')).toBe('Partial bytes');
});
it('another failed recovery retains materials and a later retry can still finish', () => {
  const root = fixture(); const { input, plan, path } = interrupted(root);
  fault.rename = true;
  expect(() => recoverOperation(root, input, plan, plan.plan_hash)).toThrow('write.failed'); fault.rename = false;
  expect(existsSync(join(root, path))).toBe(true);
  expect(existsSync(join(root, lock))).toBe(false);
  expect(recover(root, input, plan).report).toMatchObject({ ok: true, status: 'applied', recovered: true });
});
it('recovery rejects a staging junction without writing through it', () => {
  const root = fixture(); const { input, plan, journal } = interrupted(root);
  const path = join(root, `.content-ops/local/stages/${journal.stage_id}`); const saved = path + '.saved';
  renameSync(path, saved); symlinkSync(saved, path, 'junction');
  expect(recover(root, input, plan).report.diagnostics[0].rule).toBe('path.symlink');
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
});
it('completed recovery preserves externally changed staging bytes and reports cleanup pending', () => {
  const root = fixture(); const input = request(); const plan = projectPlan(root);
  fault.receipt = true;
  expect(() => applyProjectOperation(root, input, plan, plan.plan_hash)).toThrow('write.failed'); fault.receipt = false;
  const path = `.content-ops/local/journals/${input.request_id}.json`; const journal = JSON.parse(readFileSync(join(root, path), 'utf8'));
  put(root, `.content-ops/receipts/${input.request_id}.json`, JSON.stringify(createOperationReceipt(input, plan)));
  const stage = `.content-ops/local/stages/${journal.stage_id}/0.bin`; put(root, stage, 'Externally changed material');
  const result = recover(root, input, plan);
  expect(result.report).toMatchObject({ ok: true, status: 'unchanged', recovered: true, written: [] });
  expect(result.report.cleanup_pending).toContain(stage);
  expect(readFileSync(join(root, stage), 'utf8')).toBe('Externally changed material');
});
it('recovery requires original input, plan and expected hash and cannot force a conflict', () => {
  const root = fixture(); const { input, plan } = interrupted(root);
  const changed = { ...input, content: { ...input.content, description: 'Changed input' } };
  expect(() => recoverOperation(root, changed, plan, plan.plan_hash)).toThrow();
  expect(() => recoverOperation(root, input, plan, '0'.repeat(64))).toThrow();
  expect(() => parseOperationCommand(['recover', '--request', 'request.json', '--plan', '.content-ops/local/plan.json'])).toThrow('command.invalid');
  expect(() => parseOperationCommand(['recover', '--request', 'request.json', '--plan', '.content-ops/local/plan.json', '--expect-plan', plan.plan_hash, '--force'])).toThrow('command.invalid');
  expect(readFileSync(join(root, 'src/consts.ts'), 'utf8')).toBe(original);
});
