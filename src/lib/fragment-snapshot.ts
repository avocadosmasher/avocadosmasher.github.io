import { createWriterConfig, parseFragmentSource, type ExistingFragment, type WriterConfig } from './fragment-writer';
import { validateFragments } from './fragments';

/** Read one complete public Git tree; blob IDs keep all cards at the same revision. */
export async function loadFragmentSnapshot(config: WriterConfig, upstream: typeof fetch = fetch, revision = config.branch): Promise<ExistingFragment[]> {
  createWriterConfig(config);
  const read = async (path: string) => {
    const response = await upstream(`https://api.github.com/repos/${config.repo}${path}`, {
      redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) throw new Error(`카드 조회 실패 (${response.status})`);
    return response.json();
  };
  const tree = await read(`/git/trees/${encodeURIComponent(revision)}?recursive=1`);
  if (tree.truncated !== false || !Array.isArray(tree.tree)) throw new Error('전체 카드 목록을 확인하지 못했습니다.');
  const files = tree.tree.filter((entry: any) => typeof entry.path === 'string' && entry.path.startsWith('src/content/fragments/') && entry.path.endsWith('.md'));
  const cards: ExistingFragment[] = [];
  // Small batches avoid a burst of requests while retaining an atomic UI update.
  for (let offset = 0; offset < files.length; offset += 4) {
    const batch = await Promise.all(files.slice(offset, offset + 4).map(async (file: any): Promise<ExistingFragment> => {
      if (file.type !== 'blob' || !/^[a-f0-9]{40}$/.test(file.sha ?? '') ||
          !/^src\/content\/fragments\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/.test(file.path)) throw new Error('지원하지 않는 카드 파일입니다.');
      const blob = await read(`/git/blobs/${file.sha}`);
      if (blob.sha !== file.sha || blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new Error('카드 원문을 확인하지 못했습니다.');
      const source = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(blob.content.replace(/\s/g, '')), c => c.charCodeAt(0)));
      return { path: file.path, sha: file.sha, draft: parseFragmentSource(source) };
    }));
    cards.push(...batch);
  }
  validateFragments(cards.map(card => card.draft));
  return cards;
}
