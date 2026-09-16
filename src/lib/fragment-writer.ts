import { prepareFragmentSave } from './fragment-admin';
import { createOAuthTestConfig } from './fragment-admin-oauth';
import { parseDocument } from 'yaml';

export interface WriterConfig { repo: string; branch: string; origin: string }
export type WriterDraft = ReturnType<typeof prepareFragmentSave>;
export type WriterErrorCode = 'auth' | 'permission' | 'conflict' | 'network';
export class WriterError extends Error {
  constructor(public code: WriterErrorCode, message: string) { super(message); }
}

// Only explicit test configuration is enabled during the new UI acceptance phase.
export function createWriterConfig(input: { repo?: string; branch?: string; origin?: string }): WriterConfig {
  const { backend } = createOAuthTestConfig(input);
  return { repo: backend.repo, branch: backend.branch, origin: backend.base_url };
}

export function draftFromFields(input: Record<string, string>, existing?: WriterDraft): WriterDraft {
  const list = (value = '') => [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
  return prepareFragmentSave({ title: input.title, summary: input.summary, category: input.category,
    aliases: existing && input.aliases === existing.aliases.join(', ') ? existing.aliases : list(input.aliases),
    tags: existing && input.tags === existing.tags.join(', ') ? existing.tags : list(input.tags),
    body: input.body ?? '', relations: existing?.relations ?? [] }, existing?.id);
}

export interface ExistingFragment { path: string; sha: string; draft: WriterDraft }
function filePath(path: string) {
  if (!/^src\/content\/fragments\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/.test(path)) {
    throw new WriterError('conflict', '수정할 카드의 파일 경로를 확인할 수 없습니다.');
  }
  return path;
}
function readFile(file: any, path: string) {
  if (file.type !== 'file' || file.path !== path || !/^[a-f0-9]{40}$/.test(file.sha ?? '') ||
      file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new WriterError('conflict', '카드 원문과 파일 버전을 확인할 수 없습니다.');
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0))); }
  catch { throw new WriterError('conflict', '카드 원문을 읽을 수 없습니다.'); }
}
export async function loadFragment(config: WriterConfig, token: string, path: string, id: string, upstream: typeof fetch = fetch): Promise<ExistingFragment> {
  filePath(path);
  await verifyWriter(config, token, upstream);
  const response = await api(config, token, upstream)(`/contents/${path}?ref=${encodeURIComponent(config.branch)}`);
  requireResponse(response);
  const file = await responseJson(response);
  const source = readFile(file, path);
  return { path, sha: file.sha, draft: parseFragmentSource(source, id) };
}

export function parseFragmentSource(source: string, id?: string): WriterDraft {
  try {
    const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) throw new Error('frontmatter');
    const document = parseDocument(match[1], { uniqueKeys: true });
    if (document.errors.length) throw new Error('yaml');
    const metadata = document.toJS({ maxAliasCount: 50 });
    // Unknown fields must not be silently removed by the schema on save.
    const allowed = ['id', 'title', 'summary', 'category', 'aliases', 'tags', 'relations'];
    if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).some(key => !allowed.includes(key))) throw new Error('fields');
    if (typeof metadata.id !== 'string') throw new Error('missing id');
    const draft = prepareFragmentSave({ ...metadata, body: match[2] });
    if (id !== undefined && draft.id !== id) throw new Error('id');
    return draft;
  } catch { throw new WriterError('conflict', '카드 ID 또는 원문 형식을 확인할 수 없어 수정을 중단했습니다. GitHub 원문을 확인해주세요.'); }
}

/** Compare against the version read when opening; never create a replacement file. */
export async function saveExistingFragment(config: WriterConfig, token: string, existing: ExistingFragment, draft: WriterDraft, upstream: typeof fetch = fetch) {
  const path = filePath(existing.path);
  if (draft.id !== existing.draft.id || !/^[a-f0-9]{40}$/.test(existing.sha)) throw new WriterError('conflict', '원래 카드 ID와 버전을 유지해주세요.');
  const markdown = markdownForDraft(draft);
  const request = api(config, token, upstream);
  await verifyWriter(config, token, upstream);
  const current = await request(`/contents/${path}?ref=${encodeURIComponent(config.branch)}`);
  requireResponse(current);
  const file = await responseJson(current);
  const source = readFile(file, path);
  if (source === markdown) return { recovered: true, url: `https://github.com/${config.repo}/blob/${encodeURIComponent(config.branch)}/${path}` };
  if (file.sha !== existing.sha) throw new WriterError('conflict', '다른 곳에서 카드가 변경되었습니다. 입력은 보존했습니다. 필요한 내용을 복사한 뒤 페이지를 새로고침하고 다시 수정해주세요.');
  const response = await request(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({
    message: `fix(fragments): update ${draft.id}`, branch: config.branch, sha: existing.sha, content: encode(markdown),
  }) });
  requireResponse(response);
  const saved = await responseJson(response);
  if (response.status !== 200 || saved.content?.path !== path || !/^[a-f0-9]{40}$/.test(saved.commit?.sha ?? '')) {
    throw new WriterError('network', '저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장해주세요.');
  }
  return { recovered: false, url: `https://github.com/${config.repo}/commit/${saved.commit.sha}` };
}

export function markdownForDraft(draft: WriterDraft): string {
  const { body, ...metadata } = prepareFragmentSave(draft, draft.id);
  // JSON scalars/arrays are also valid YAML; escape line separators to prevent injected keys.
  const quote = (value: unknown) => JSON.stringify(value).replace(/[\u0085\u2028\u2029]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${quote(value)}`).join('\n')}\n---\n${body}${body.endsWith('\n') ? '' : '\n'}`;
}

function encode(value: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function api(config: WriterConfig, token: string, upstream: typeof fetch) {
  createWriterConfig(config);
  if (!/^[A-Za-z0-9_]{1,4096}$/.test(token)) throw new WriterError('auth', '다시 로그인해주세요.');
  return async (path = '', init: RequestInit = {}) => {
    try {
      return await upstream(`https://api.github.com/repos/${config.repo}${path}`, {
        ...init, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      });
    } catch { throw new WriterError('network', '응답을 확인하지 못했습니다. 입력을 유지한 채 다시 저장을 눌러 결과를 확인해주세요.'); }
  };
}
function requireResponse(response: Response) {
  if (response.ok) return;
  if (response.status === 401) throw new WriterError('auth', '로그인이 만료되었습니다. 다시 로그인해주세요.');
  if ([403, 404].includes(response.status)) throw new WriterError('permission', '저장소 쓰기 권한이나 브랜치 접근을 확인해주세요.');
  if ([409, 422].includes(response.status)) throw new WriterError('conflict', '저장이 거부되었습니다. 같은 내용으로 다시 저장해 결과를 확인해주세요.');
  throw new WriterError('network', 'GitHub 응답을 확인하지 못했습니다. 잠시 후 같은 내용으로 다시 저장해주세요.');
}

async function responseJson(response: Response) {
  try { return await response.json(); }
  catch { throw new WriterError('network', '응답을 읽지 못했습니다. 같은 내용으로 다시 시도해주세요.'); }
}

export async function verifyWriter(config: WriterConfig, token: string, upstream: typeof fetch = fetch) {
  const response = await api(config, token, upstream)();
  requireResponse(response);
  const repo = await responseJson(response);
  if (repo.full_name?.toLowerCase() !== config.repo.toLowerCase() || repo.private !== false ||
      repo.archived || repo.disabled || repo.permissions?.push !== true) {
    throw new WriterError('permission', '이 테스트 저장소에 카드를 작성할 권한이 없습니다.');
  }
}

/** Create only: never send an overwrite SHA. Retrying uses the caller's frozen ID and content. */
export async function saveNewFragment(config: WriterConfig, token: string, draft: WriterDraft, upstream: typeof fetch = fetch) {
  const markdown = markdownForDraft(draft);
  const path = `src/content/fragments/${draft.id}.md`;
  const request = api(config, token, upstream);
  await verifyWriter(config, token, upstream);
  const current = await request(`/contents/${path}?ref=${encodeURIComponent(config.branch)}`);
  if (current.status !== 404) {
    requireResponse(current);
    const file = await responseJson(current);
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' ||
        file.content.replace(/\s/g, '') !== encode(markdown)) {
      throw new WriterError('conflict', '같은 ID의 다른 파일이 있습니다. 기존 파일을 덮어쓰지 않았습니다.');
    }
    return { recovered: true, url: `https://github.com/${config.repo}/blob/${encodeURIComponent(config.branch)}/${path}` };
  }
  const response = await request(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({
    message: `feat(fragments): create ${draft.id}`, branch: config.branch, content: encode(markdown),
  }) });
  requireResponse(response);
  const saved = await responseJson(response);
  if (response.status !== 201 || saved.content?.path !== path || !/^[a-f0-9]{40}$/.test(saved.commit?.sha ?? '')) {
    throw new WriterError('network', '저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장해주세요.');
  }
  return { recovered: false, url: `https://github.com/${config.repo}/commit/${saved.commit.sha}` };
}
