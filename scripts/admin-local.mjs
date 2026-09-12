import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const project = fileURLToPath(new URL('../', import.meta.url));
const testing = process.argv.includes('--test');
const runs = path.join(project, '.fragment-test', 'cms-runs');
await mkdir(runs, { recursive: true });
const run = testing ? await mkdtemp(path.join(runs, 'run-')) : null;
const sandbox = run ? path.join(run, 'cms') : path.join(project, '.fragment-test', 'cms');
await mkdir(sandbox, { recursive: true });
// Refuse a junction/symlink that would redirect the proxy to another directory.
if ((await realpath(sandbox)).toLowerCase() !== path.resolve(sandbox).toLowerCase()) {
  throw new Error('CMS sandbox must be a real directory inside .fragment-test');
}
for (const port of [4400, 8082]) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
const content = path.join(sandbox, 'src/content/fragments');
await mkdir(content, { recursive: true });
await mkdir(path.join(sandbox, 'public/uploads'), { recursive: true });
if (testing) await writeFile(path.join(project, '.fragment-test', 'admin-run.json'), JSON.stringify({ sandbox, content }));
await writeFile(path.join(content, 'cms-connection.md'), `---
id: cms-connection
title: CMS 격리 연결 확인
summary: 운영 콘텐츠와 분리된 연결 확인용 카드
category: Test
---
연결 확인용 본문입니다.
`, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
if (testing) await writeFile(path.join(content, 'legacy-card.md'), `---
id: stable-existing-id
title: 기존 카드 저장 검증
summary: 파일명과 ID가 다른 기존 카드
category: Test
relations:
  - target: cms-connection
    type: related
---
기존 본문을 보존합니다.
`);

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
function start(script, args, cwd, env) {
  const child = spawn(process.execPath, [path.join(project, script), ...args], {
    cwd, env: { ...process.env, ...env }, stdio: 'inherit', windowsHide: true,
  });
  children.push(child);
  child.on('error', error => { console.error(error); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 1); });
}
start('node_modules/decap-server/dist/index.js', [], sandbox, {
  PORT: '8082', BIND_HOST: '127.0.0.1', MODE: 'fs', GIT_REPO_DIRECTORY: sandbox,
});
start('node_modules/astro/astro.js', ['dev', '--host', '127.0.0.1', '--port', '4400'], project, {
  FRAGMENT_CMS_LOCAL: '1', FRAGMENT_CONTENT_DIR: path.relative(project, content).split(path.sep).join('/'),
});
console.log(`Local CMS: http://127.0.0.1:4400/admin/ — data: ${sandbox}`);
