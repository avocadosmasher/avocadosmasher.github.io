import { prepareFragmentSave } from './fragment-admin';
import { createOAuthTestConfig } from './fragment-admin-oauth';

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

export function draftFromFields(input: Record<string, string>): WriterDraft {
  const list = (value = '') => [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
  return prepareFragmentSave({ title: input.title, summary: input.summary, category: input.category,
    aliases: list(input.aliases), tags: list(input.tags), body: input.body ?? '', relations: [] });
}

export function markdownForDraft(draft: WriterDraft): string {
  const { body, ...metadata } = prepareFragmentSave(draft, draft.id);
  // JSON scalars/arrays are also valid YAML; escape line separators to prevent injected keys.
  const quote = (value: unknown) => JSON.stringify(value).replace(/[\u0085\u2028\u2029]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${quote(value)}`).join('\n')}\n---\n${body}\n`;
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
