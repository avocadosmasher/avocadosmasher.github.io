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
  const cards = comparison.files.filter((file: any) => typeof file?.filename === 'string' && cardFile.test(file.filename)).length;
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
