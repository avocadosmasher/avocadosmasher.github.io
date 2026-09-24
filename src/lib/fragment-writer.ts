import { parseDocument } from 'yaml';
import { prepareFragmentSave, validateFragments } from './fragments';

export interface WriterConfig { repo: string; branch: string; origin: string; production?: true; publish?: string }
export type WriterDraft = ReturnType<typeof prepareFragmentSave>;
export type WriterErrorCode = 'auth' | 'permission' | 'conflict' | 'network' | 'snapshot' | 'rate-limit' | 'relation';
export class WriterError extends Error {
  constructor(public code: WriterErrorCode, message: string) { super(message); }
}

export const BLOG_REPO = 'avocadosmasher/avocadosmasher.github.io';
export const PUBLISHED_BRANCH = 'main';
export const DRAFT_BRANCH = 'fragments-draft';

/** Test saving must name a repository and branch of its own, never the blog's. */
function createTestWriterConfig(input: { repo?: string; branch?: string; origin?: string }): WriterConfig {
  const { repo = '', branch = '', origin = '' } = input;
  requireHttpsOrigin(origin);
  if (!/^[\w-]+\/[\w.-]+$/.test(repo) || repo.toLowerCase() === BLOG_REPO.toLowerCase()) {
    throw new Error('운영 저장소와 다른 테스트 저장소를 설정하세요.');
  }
  if (!/^[\w/-]+$/.test(branch) || ['main', 'master'].includes(branch.toLowerCase()) ||
      branch.startsWith('/') || branch.endsWith('/') || branch.includes('//')) {
    throw new Error('별도 테스트 브랜치를 설정하세요.');
  }
  return { repo, branch, origin };
}

function requireHttpsOrigin(origin: string) {
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error('OAuth 서버 주소를 설정하세요.'); }
  if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('OAuth 서버의 HTTPS origin을 입력하세요.');
}

// Production writes need an explicit flag and may target only the blog repository's main branch.
export function createWriterConfig(input: { repo?: string; branch?: string; origin?: string; production?: boolean; publish?: string }): WriterConfig {
  if (input.production !== true) return createTestWriterConfig(input);
  const { repo = '', branch = '', origin = '' } = input;
  requireHttpsOrigin(origin);
  // Saves land on the draft branch; the published branch changes only when the author presses 발행.
  if (repo !== BLOG_REPO || branch !== DRAFT_BRANCH || input.publish !== PUBLISHED_BRANCH) {
    throw new Error(`운영 저장은 블로그 저장소의 ${DRAFT_BRANCH} 브랜치에만 허용합니다.`);
  }
  return { repo, branch, origin, publish: input.publish, production: true };
}

/** Build-time choice: the isolated test repository, the production blog, or no saving. */
export function writerConfigFromEnv(env: Record<string, string | undefined>): { config?: WriterConfig; error: string } {
  const test = env.FRAGMENT_CMS_OAUTH_TEST === '1', productionOrigin = env.FRAGMENT_WRITER_OAUTH_ORIGIN;
  if (!test && !productionOrigin) return { error: '' };
  try {
    if (test && productionOrigin) throw new Error('Conflicting modes');
    return { error: '', config: test
      ? createWriterConfig({ repo: env.FRAGMENT_CMS_TEST_REPO, branch: env.FRAGMENT_CMS_TEST_BRANCH, origin: env.FRAGMENT_CMS_OAUTH_ORIGIN })
      : createWriterConfig({ repo: BLOG_REPO, branch: DRAFT_BRANCH, publish: PUBLISHED_BRANCH, origin: productionOrigin, production: true }) };
  } catch { return { error: test ? '테스트 저장 설정을 확인해주세요.' : '저장 설정을 확인해주세요.' }; }
}

export function draftFromFields(input: Record<string, string>, existing?: WriterDraft): WriterDraft {
  const list = (value = '') => [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
  return prepareFragmentSave({ title: input.title, summary: input.summary, category: input.category,
    aliases: existing && input.aliases === existing.aliases.join(', ') ? existing.aliases : list(input.aliases),
    tags: existing && input.tags === existing.tags.join(', ') ? existing.tags : list(input.tags),
    body: input.body ?? '', relations: input.relations === undefined ? existing?.relations ?? [] : JSON.parse(input.relations) }, existing?.id);
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

/** Pin relation checks and branch writes to the same revision. */
async function mutationSnapshot(config: WriterConfig, token: string, upstream: typeof fetch) {
  const sha = (value: unknown): string => {
    if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new WriterError('network', '파일 버전과 작업 결과를 확인하지 못했습니다. 다시 시도해주세요.');
    return value;
  };
  const request = api(config, token, upstream);
  await verifyWriter(config, token, upstream);
  const json = async (endpoint: string, method?: string, body?: unknown) => {
    const response = await request(endpoint, method ? { method, body: JSON.stringify(body) } : {});
    if ([409, 422].includes(response.status)) throw new WriterError('conflict', '다른 곳에서 저장소가 변경되어 작업을 중단했습니다. 다시 시도하면 최신 관계를 확인합니다.');
    requireResponse(response);
    return responseJson(response);
  };
  const branch = config.branch.split('/').map(encodeURIComponent).join('/');
  const ref = await json(`/git/ref/heads/${branch}`);
  if (ref.ref !== `refs/heads/${config.branch}` || ref.object?.type !== 'commit') throw new WriterError('conflict', '작업할 브랜치를 확인할 수 없습니다.');
  const head = sha(ref.object.sha);
  const commit = await json(`/git/commits/${head}`);
  if (commit.sha !== head) throw new WriterError('conflict', '저장소 버전이 일치하지 않습니다.');
  const baseTree = sha(commit.tree?.sha);
  const { loadFragmentSnapshot } = await import('./fragment-snapshot');
  let snapshot: ExistingFragment[];
  try {
    const root = `https://api.github.com/repos/${config.repo}`;
    snapshot = await loadFragmentSnapshot(config, async url => {
      const address = String(url);
      if (!address.startsWith(`${root}/git/`)) throw new Error('Unexpected snapshot URL');
      const response = await request(address.slice(root.length));
      requireResponse(response);
      return response;
    }, head);
  } catch (error) {
    if (error instanceof WriterError && ['auth', 'permission', 'rate-limit'].includes(error.code)) throw error;
    throw new WriterError('snapshot', '최신 카드와 관계를 조회·검증하지 못해 저장·삭제 요청을 보내지 않았습니다. 입력은 유지됩니다. 잠시 후 다시 시도하고, 계속 실패하면 저장소의 카드 원문과 관계 대상을 확인해주세요.');
  }
  const publish = async (entry: { path: string; content: string } | { path: string; sha: null }, message: string) => {
    const tree = await json('/git/trees', 'POST', { base_tree: baseTree, tree: [{ ...entry, mode: '100644', type: 'blob' }] });
    const commit = await json('/git/commits', 'POST', { message, tree: sha(tree.sha), parents: [head] });
    const committedSha = sha(commit.sha);
    const updated = await json(`/git/refs/heads/${branch}`, 'PATCH', { sha: committedSha, force: false });
    if (updated.ref !== `refs/heads/${config.branch}` || updated.object?.sha !== committedSha) throw new WriterError('network', '작업 결과를 확인하지 못했습니다. 다시 시도해주세요.');
    return `https://github.com/${config.repo}/commit/${committedSha}`;
  };
  return { snapshot, head, publish };
}

/** Relation edits must not race with deletion of a selected target. */
export async function saveRelationChanges(config: WriterConfig, token: string, draft: WriterDraft, existing?: ExistingFragment, upstream: typeof fetch = fetch) {
  const path = filePath(existing?.path ?? `src/content/fragments/${draft.id}.md`);
  if (existing && (existing.draft.id !== draft.id || !/^[a-f0-9]{40}$/.test(existing.sha))) throw new WriterError('conflict', '원래 카드 ID와 버전을 유지해주세요.');
  const markdown = markdownForDraft(draft);
  const keys = draft.relations.map(relation => relation.target);
  if (new Set(keys).size !== keys.length) throw new WriterError('relation', '같은 두 카드 사이에는 방향·유형과 무관하게 관계 하나만 허용합니다. 중복 관계를 제거해주세요.');
  const { snapshot, head, publish } = await mutationSnapshot(config, token, upstream);
  const current = snapshot.find(card => card.path === path);
  if (current && markdownForDraft(current.draft) === markdown) return { recovered: true, url: `https://github.com/${config.repo}/commit/${head}` };
  if (existing ? !current || current.sha !== existing.sha || current.draft.id !== draft.id : !!current) throw new WriterError('conflict', '다른 곳에서 카드가 변경되었습니다. 필요한 입력을 복사한 뒤 새로고침하고 다시 수정해주세요.');
  const reverse = snapshot.find(card => keys.includes(card.draft.id) && card.draft.relations.some(relation => relation.target === draft.id));
  if (reverse) throw new WriterError('relation', `“${reverse.draft.title}” 카드에서 이미 이 카드로 연결되어 있습니다. 같은 두 카드 사이에는 관계 하나만 허용합니다. 추가한 관계를 제거하거나 해당 카드에서 기존 관계를 제거·저장한 뒤 다시 시도해주세요.`);
  try { validateFragments([...snapshot.filter(card => card.path !== path).map(card => card.draft), draft]); }
  catch { throw new WriterError('conflict', '관계 대상이 없어졌거나 자기 자신을 참조합니다. 입력을 복사한 뒤 새로고침하여 관계 대상을 다시 확인해주세요.'); }
  return { recovered: false, url: await publish({ path, content: markdown }, `feat(fragments): save relations for ${draft.id}`) };
}

/** Delete against one complete revision, then publish only as a fast-forward. */
export async function deleteFragment(config: WriterConfig, token: string, existing: ExistingFragment, upstream: typeof fetch = fetch) {
  const path = filePath(existing.path);
  if (!/^[a-f0-9]{40}$/.test(existing.sha)) throw new WriterError('conflict', '카드 버전을 확인할 수 없습니다.');
  const { snapshot, head, publish } = await mutationSnapshot(config, token, upstream);
  const current = snapshot.find(card => card.path === path);
  const url = `https://github.com/${config.repo}/commit/`;
  if (!current) {
    if (snapshot.some(card => card.draft.id === existing.draft.id)) throw new WriterError('conflict', '카드 파일이 이동되었습니다. 새로고침 후 다시 확인해주세요.');
    return { recovered: true, url: url + head, snapshot };
  }
  if (current.sha !== existing.sha || current.draft.id !== existing.draft.id) throw new WriterError('conflict', '다른 곳에서 카드가 변경되었습니다. 필요한 입력을 복사한 뒤 새로고침하고 다시 삭제해주세요.');
  const references = snapshot.filter(card => card.draft.relations.some(relation => relation.target === existing.draft.id));
  if (references.length) throw new WriterError('conflict', `이 카드를 참조하는 카드가 있어 삭제할 수 없습니다: ${references.map(card => card.draft.title).join(', ')}. 해당 카드 수정 → 이 카드로 향하는 관계 제거 → 수정 저장 → 이 카드 삭제 재시도 순서로 진행해주세요.`);
  return { recovered: false, url: await publish({ path, sha: null }, `feat(fragments): delete ${existing.draft.id}`), snapshot: snapshot.filter(card => card.path !== path) };
}

function encode(value: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function api(config: WriterConfig, token: string, upstream: typeof fetch) {
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
export function requireResponse(response: Response) {
  if (response.ok) return;
  if (response.status === 429 || (response.status === 403 && (response.headers.get('X-RateLimit-Remaining') === '0' || response.headers.has('Retry-After')))) {
    throw new WriterError('rate-limit', 'GitHub 요청 한도에 도달했습니다. 입력은 유지됩니다. 잠시 기다린 뒤 같은 작업을 다시 시도해주세요.');
  }
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
