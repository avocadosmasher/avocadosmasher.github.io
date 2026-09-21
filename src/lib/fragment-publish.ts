import { api, requireResponse, WriterError, type WriterConfig } from './fragment-writer';

const cardFile = /^src\/content\/fragments\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/;

/** Drafts live on their own branch, so publishing is a merge the author asks for. */
function branches(config: WriterConfig) {
  if (!config.publish || config.publish === config.branch) {
    throw new WriterError('conflict', '이 환경에서는 발행할 수 없습니다. 운영 저장 설정을 확인해주세요.');
  }
  return { base: config.publish, head: config.branch };
}

export async function countPendingDrafts(config: WriterConfig, token: string, upstream: typeof fetch = fetch) {
  const { base, head } = branches(config);
  const response = await api(config, token, upstream)(`/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  requireResponse(response);
  const comparison = await response.json().catch(() => { throw new WriterError('network', '발행 대기 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.'); });
  const ahead = comparison?.ahead_by;
  if (typeof ahead !== 'number' || !Array.isArray(comparison.files)) {
    throw new WriterError('network', '발행 대기 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.');
  }
  const cards = comparison.files
    .filter((file: any) => typeof file?.filename === 'string' && cardFile.test(file.filename))
    .map((file: any) => ({ path: file.filename as string, id: file.filename.split('/').pop()!.replace(/\.md$/, ''), status: String(file.status ?? 'modified') }));
  return { ahead, cards };
}

export async function publishDrafts(config: WriterConfig, token: string, upstream: typeof fetch = fetch) {
  const { base, head } = branches(config);
  const response = await api(config, token, upstream)('/merges', {
    method: 'POST', body: JSON.stringify({ base, head, commit_message: `chore(fragments): publish drafts from ${head}` }),
  });
  if (response.status === 204) return { published: false };
  requireResponse(response);
  const merge = await response.json().catch(() => ({}));
  if (response.status !== 201 || !/^[a-f0-9]{40}$/.test(merge?.sha ?? '')) {
    throw new WriterError('network', '발행 결과를 확인하지 못했습니다. 저장소의 커밋을 확인한 뒤 다시 시도해주세요.');
  }
  return { published: true, url: `https://github.com/${config.repo}/commit/${merge.sha}` };
}

/** Take one card out of the waiting list by restoring it to whatever the live site holds. */
export async function discardDraftChange(config: WriterConfig, token: string, path: string, upstream: typeof fetch = fetch) {
  const { base, head } = branches(config);
  if (!cardFile.test(path)) throw new WriterError('conflict', '카드 파일만 되돌릴 수 있습니다.');
  const request = api(config, token, upstream);
  const read = async (ref: string) => {
    const response = await request(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
    if (response.status === 404) return undefined;
    requireResponse(response);
    const file = await response.json();
    if (file?.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' || !/^[a-f0-9]{40}$/.test(file.sha ?? '')) {
      throw new WriterError('conflict', '되돌릴 카드의 현재 내용을 확인하지 못했습니다. 새로고침 후 다시 시도해주세요.');
    }
    return { sha: file.sha as string, content: decode(file.content) };
  };
  const published = await read(base);
  const draft = await read(head);
  if (!published && !draft) throw new WriterError('conflict', '이미 정리된 변경입니다. 발행 대기 목록을 새로 불러와주세요.');
  if (published && draft && published.content === draft.content) return { removed: false, unchanged: true };
  if (!published && draft) {
    const response = await request(`/contents/${path}`, { method: 'DELETE', body: JSON.stringify({
      message: `revert(fragments): drop draft ${path.split('/').pop()}`, branch: head, sha: draft.sha,
    }) });
    requireResponse(response);
    return { removed: true };
  }
  const response = await request(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({
    message: `revert(fragments): restore published ${path.split('/').pop()}`, branch: head,
    content: encode(published!.content), ...(draft ? { sha: draft.sha } : {}),
  }) });
  requireResponse(response);
  return { removed: false };
}

function decode(value: string) {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encode(value: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
