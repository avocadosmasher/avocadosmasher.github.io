import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import { fixtureRoot } from '../../scripts/ai-content-fixtures.mjs';

interface FrozenRequest<T> {
  request_id: string;
  resource: string;
  operation: string;
  target: { path?: string; id?: string; selector?: unknown };
  baseline?: { file_sha?: string; observed_content?: string };
  content: T;
}

export const fileSha = (source: string) => createHash('sha1')
  .update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest('hex');

// 테스트 전용 파일 저장소와 HTTP 경계다. 작성 규약을 대신 실행하는 엔진이 아니다.
export function isolatedSession() {
  const parent = join(fixtureRoot, '.fragment-test');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'handoff-'));
  let puts = 0;
  let localWrites = 0;
  let loseResponse = false;
  let unavailable = false;
  const absolute = (path: string) => {
    const target = resolve(root, path);
    if (!target.startsWith(`${resolve(root)}${sep}`)) throw new Error('격리 폴더 밖의 경로입니다.');
    return target;
  };
  const write = (path: string, source: string | Buffer) => {
    const target = absolute(path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
    localWrites++;
  };
  const read = (path: string) => readFileSync(absolute(path), 'utf8');
  const snapshot = () => {
    const files: Record<string, string> = {};
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else files[relative(root, path).split(sep).join('/')] = createHash('sha256').update(readFileSync(path)).digest('hex');
      }
    };
    walk(root);
    return files;
  };
  const saveRequest = <T>(request: FrozenRequest<T>) => {
    const source = stringify(request);
    write('requests/confirmed.yaml', source);
    write('handoff.yaml', stringify({ request_id: request.request_id, confirmed_request: 'requests/confirmed.yaml',
      confirmed_request_sha256: createHash('sha256').update(source).digest('hex'),
      actual_target: { repository: 'fixture-owner/ai-content-scenarios', branch: 'scenario-draft', ...request.target },
      baseline: request.baseline ?? {}, existing_work_log: 'docs/log/fixture.md',
      approval: { state: 'pending', scope: null, evidence: null },
      confirmed_result: { local_prepared: false, commit_sha: null, push_verified: false,
        saved_id: null, saved_path: null, published_commit: null, deployment_verified: false },
      unknowns: [], next_action: '현재 원본을 조회하고 확정 입력과 비교' }));
    write('docs/log/fixture.md', '# 중단된 예시 작업\n');
    write('STATUS.md', '고정된 예시 상태\n');
  };
  const readRequest = <T>(): FrozenRequest<T> => {
    const handoff = parse(read('handoff.yaml'));
    const source = read(handoff.confirmed_request);
    if (createHash('sha256').update(source).digest('hex') !== handoff.confirmed_request_sha256) {
      throw new Error('확정 입력의 원문이 달라져 인계 충돌이 발생했습니다.');
    }
    const request = parse(source);
    if (request.request_id !== handoff.request_id) throw new Error('요청 식별자가 다릅니다.');
    return request;
  };
  const upstream: typeof fetch = async (input, init = {}) => {
    if (unavailable) throw new Error('격리 조회 실패');
    const url = new URL(String(input));
    const prefix = '/repos/fixture-owner/ai-content-scenarios';
    if (url.origin !== 'https://api.github.com' || !url.pathname.startsWith(prefix)) throw new Error('예상하지 않은 API');
    const method = init.method ?? 'GET';
    if (url.pathname === prefix && method === 'GET') return Response.json({
      full_name: 'fixture-owner/ai-content-scenarios', private: false, permissions: { push: true },
    });
    const path = url.pathname.slice(`${prefix}/contents/`.length);
    if (!url.pathname.startsWith(`${prefix}/contents/`) || !/^src\/content\/fragments\/[a-z0-9-]+\.md$/.test(path)) {
      throw new Error('예상하지 않은 콘텐츠 경로');
    }
    const target = absolute(path);
    if (method === 'GET') {
      if (url.searchParams.get('ref') !== 'scenario-draft') throw new Error('예상하지 않은 브랜치');
      if (!existsSync(target)) return new Response(null, { status: 404 });
      const source = read(path);
      return Response.json({ type: 'file', path, sha: fileSha(source), encoding: 'base64', content: Buffer.from(source).toString('base64') });
    }
    if (method !== 'PUT' || typeof init.body !== 'string') throw new Error('예상하지 않은 쓰기');
    const payload = JSON.parse(init.body);
    if (payload.branch !== 'scenario-draft') throw new Error('예상하지 않은 쓰기 브랜치');
    const existing = existsSync(target);
    if ((existing && payload.sha !== fileSha(read(path))) || (!existing && payload.sha)) return new Response(null, { status: 409 });
    write(path, Buffer.from(payload.content, 'base64'));
    puts++;
    if (loseResponse) { loseResponse = false; throw new Error('저장 응답 유실'); }
    return Response.json({ content: { path }, commit: { sha: createHash('sha1').update(`fixture-write-${puts}`).digest('hex') } },
      { status: existing ? 200 : 201 });
  };
  return { root, write, read, snapshot, saveRequest, readRequest, upstream,
    writes: () => puts, localWrites: () => localWrites, loseNextWriteResponse: () => { loseResponse = true; },
    failReads: () => { unavailable = true; } };
}
