import { expect, it, vi } from 'vitest';
import { deleteFragment, markdownForDraft, draftFromFields } from '../../src/lib/fragment-writer';

const config = { repo: 'tester/fragment-cms-auth-test', branch: 'cms-test', origin: 'https://oauth.example' };
const path = 'src/content/fragments/legacy.md';
const draft = draftFromFields({ title: '삭제 대상', summary: '설명', category: 'Infra' });
const existing = { path, sha: 'a'.repeat(40), draft };
function remote(mode = '') {
  let absent = mode === 'absent';
  const writes: { path: string; body: any }[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(url).split(`/repos/${config.repo}`)[1];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (init?.method) {
      writes.push({ path: endpoint, body });
      if (endpoint === '/git/trees') return Response.json({ sha: 'd'.repeat(40) }, { status: 201 });
      if (endpoint === '/git/commits') return Response.json({ sha: 'e'.repeat(40) }, { status: 201 });
      if (mode === 'race') return Response.json({}, { status: 422 });
      absent = true;
      if (mode === 'lost') throw new Error('response lost');
      return Response.json({ ref: 'refs/heads/cms-test', object: { sha: 'e'.repeat(40) } });
    }
    if (!endpoint) return Response.json({ full_name: config.repo, private: false, permissions: { push: mode !== 'permission' } });
    if (endpoint.includes('/git/ref/')) return Response.json({ ref: 'refs/heads/cms-test', object: { type: 'commit', sha: 'b'.repeat(40) } });
    if (endpoint.includes('/git/commits/')) return Response.json({ sha: 'b'.repeat(40), tree: { sha: 'c'.repeat(40) } });
    if (endpoint.includes('/git/trees/')) {
      expect(endpoint).toBe(`/git/trees/${'b'.repeat(40)}?recursive=1`);
      return Response.json({ truncated: mode === 'truncated', tree: absent ? [] : [
        { path, type: 'blob', sha: mode === 'stale' ? 'f'.repeat(40) : existing.sha },
        ...(mode === 'reference' ? [{ path: 'src/content/fragments/ref.md', type: 'blob', sha: '9'.repeat(40) }] : []),
      ] });
    }
    const sha = endpoint.split('/').at(-1)!;
    const content = markdownForDraft(sha[0] === '9' ? { ...draft, id: 'ref', title: '참조 카드', relations: [{ target: draft.id, type: 'related' }] } : draft);
    return Response.json({ sha, encoding: 'base64', content: Buffer.from(content).toString('base64') });
  });
  return { fetcher, writes };
}
it('deletes only the selected file and publishes without forcing over concurrent changes', async () => {
  const { fetcher, writes } = remote();
  const result = await deleteFragment(config, 'token', existing, fetcher);
  expect(result.recovered).toBe(false);
  expect(result.snapshot).toEqual([]);
  expect(writes).toEqual([
    { path: '/git/trees', body: { base_tree: 'c'.repeat(40), tree: [{ path, mode: '100644', type: 'blob', sha: null }] } },
    { path: '/git/commits', body: { message: `feat(fragments): delete ${draft.id}`, tree: 'd'.repeat(40), parents: ['b'.repeat(40)] } },
    { path: '/git/refs/heads/cms-test', body: { sha: 'e'.repeat(40), force: false } },
  ]);
});
it.each(['reference', 'stale', 'truncated', 'permission'])('refuses %s without creating objects or updating the branch', async mode => {
  const { fetcher, writes } = remote(mode);
  await expect(deleteFragment(config, 'token', existing, fetcher)).rejects.toThrow(mode === 'reference' ? '참조 카드' : undefined);
  expect(writes).toEqual([]);
});
it('reports concurrent branch changes as conflicts', async () => {
  const { fetcher } = remote('race');
  await expect(deleteFragment(config, 'token', existing, fetcher)).rejects.toMatchObject({ code: 'conflict' });
});
it('recovers a lost response by reading the complete current snapshot without another write', async () => {
  const { fetcher, writes } = remote('lost');
  await expect(deleteFragment(config, 'token', existing, fetcher)).rejects.toThrow();
  const count = writes.length;
  expect((await deleteFragment(config, 'token', existing, fetcher)).recovered).toBe(true);
  expect(writes).toHaveLength(count);
});
