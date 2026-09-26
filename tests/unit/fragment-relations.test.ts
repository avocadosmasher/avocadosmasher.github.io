import { expect, it, vi } from 'vitest';
import { draftFromFields, markdownForDraft, saveRelationChanges } from '../../src/lib/fragment-writer';

const config = { repo: 'tester/fragment-cms-auth-test', branch: 'cms-test', origin: 'https://oauth.example' };
const a = { ...draftFromFields({ title: 'A', summary: '설명', category: 'Infra' }), id: 'a' };
const b = { ...a, id: 'b', title: 'B' };
const existing = { path: 'src/content/fragments/legacy.md', sha: 'a'.repeat(40), draft: a };
const changed = { ...a, relations: [{ target: 'b', type: 'related' as const }] };
function remote(mode = '') {
  let saved = false;
  const writes: any[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(url).split(`/repos/${config.repo}`)[1];
    if (init?.method) {
      const body = JSON.parse(String(init.body)); writes.push({ endpoint, body });
      if (endpoint === '/git/trees') return Response.json({ sha: 'd'.repeat(40) });
      if (endpoint === '/git/commits') return Response.json({ sha: 'e'.repeat(40) });
      if (mode === 'race') return Response.json({}, { status: 422 });
      saved = true;
      if (mode === 'lost') throw new Error('lost');
      return Response.json({ ref: 'refs/heads/cms-test', object: { sha: 'e'.repeat(40) } });
    }
    if (!endpoint) return Response.json({ full_name: config.repo, private: false, permissions: { push: true } });
    if (endpoint.includes('/git/ref/')) return Response.json({ ref: 'refs/heads/cms-test', object: { type: 'commit', sha: 'c'.repeat(40) } });
    if (endpoint.includes('/git/commits/')) return Response.json({ sha: 'c'.repeat(40), tree: { sha: 'd'.repeat(40) } });
    if (endpoint.includes('/git/trees/')) return Response.json({ truncated: mode === 'truncated', tree: [
      ...(mode === 'new' ? [] : [{ path: existing.path, type: 'blob', sha: (saved ? 'e' : mode === 'stale' ? 'f' : 'a').repeat(40) }]),
      ...(mode === 'missing' ? [] : [{ path: 'src/content/fragments/b.md', type: 'blob', sha: 'b'.repeat(40) }]),
    ] });
    const sha = endpoint.split('/').at(-1)!;
    return Response.json({ sha, encoding: 'base64', content: Buffer.from(markdownForDraft(sha[0] === 'b' ? (mode === 'reverse' ? { ...b, relations: [{ target: 'a', type: 'part-of' as const }] } : b) : saved || mode === 'linked' ? changed : a)).toString('base64') });
  });
  return { fetcher, writes };
}
it('accepts explicit relation replacement and removal while preserving omitted relations', () => {
  const fields = { title: a.title, summary: a.summary, category: a.category };
  expect(draftFromFields({ ...fields, relations: JSON.stringify(changed.relations) }, a).relations).toEqual(changed.relations);
  expect(draftFromFields(fields, changed).relations).toEqual(changed.relations);
  expect(draftFromFields({ ...fields, relations: '[]' }, changed).relations).toEqual([]);
});
it('stores ID-based relations in the same file and publishes against the inspected revision', async () => {
  const { fetcher, writes } = remote();
  await saveRelationChanges(config, 'token', changed, existing, fetcher);
  expect(writes[0].body).toEqual({ base_tree: 'd'.repeat(40), tree: [{ path: existing.path, mode: '100644', type: 'blob', content: markdownForDraft(changed) }] });
  expect(writes[1].body.parents).toEqual(['c'.repeat(40)]);
  expect(writes[2].body.force).toBe(false);
});
it('supports a new card with relations', async () => {
  const { fetcher, writes } = remote('new');
  await saveRelationChanges(config, 'token', changed, undefined, fetcher);
  expect(writes[0].body.tree[0].path).toBe('src/content/fragments/a.md');
});
it.each(['add', 'remove'])('uses the writer session to %s relations when anonymous reads are limited', async action => {
  const { fetcher, writes } = remote(action === 'remove' ? 'linked' : '');
  const limited: typeof fetch = async (url, init) => {
    if (/\/git\/(trees|blobs)\//.test(String(url)) && new Headers(init?.headers).get('Authorization') !== 'Bearer token') {
      return Response.json({}, { status: 403, headers: { 'X-RateLimit-Remaining': '0' } });
    }
    return fetcher(url, init);
  };
  const before = action === 'remove' ? { ...existing, draft: changed } : existing;
  const after = action === 'remove' ? a : changed;
  await expect(saveRelationChanges(config, 'token', after, before, limited)).resolves.toMatchObject({ recovered: false });
  expect(writes).toHaveLength(3);
  expect(writes[0].body.tree[0].content).toBe(markdownForDraft(after));
});
it.each([401, 403, 429, 500])('reports snapshot HTTP %s before any write', async status => {
  const { fetcher, writes } = remote();
  const failing: typeof fetch = async (url, init) => String(url).includes('/git/trees/')
    ? Response.json({}, { status, headers: status === 403 ? { 'X-RateLimit-Remaining': '0' } : {} }) : fetcher(url, init);
  await expect(saveRelationChanges(config, 'token', changed, existing, failing)).rejects.toMatchObject({
    code: status === 401 ? 'auth' : [403, 429].includes(status) ? 'rate-limit' : 'snapshot',
  });
  expect(writes).toHaveLength(0);
});
it.each(['missing', 'stale', 'truncated'])('refuses %s without any write', async mode => {
  const { fetcher, writes } = remote(mode);
  await expect(saveRelationChanges(config, 'token', changed, existing, fetcher)).rejects.toThrow();
  expect(writes).toEqual([]);
});
it('rejects self-reference and duplicate relation pairs before writing', async () => {
  for (const relations of [[{ target: 'a', type: 'related' as const }], [...changed.relations, ...changed.relations]]) {
    const { fetcher, writes } = remote();
    await expect(saveRelationChanges(config, 'token', { ...a, relations }, existing, fetcher)).rejects.toThrow();
    expect(writes).toEqual([]);
  }
});
it('rejects a second relation between two cards regardless of type or direction', async () => {
  for (const mode of ['', 'reverse']) {
    const { fetcher, writes } = remote(mode);
    const draft = mode ? changed : { ...changed, relations: [...changed.relations, { target: 'b', type: 'part-of' as const }] };
    await expect(saveRelationChanges(config, 'token', draft, existing, fetcher)).rejects.toMatchObject({ code: 'relation' });
    expect(writes).toHaveLength(0);
  }
});
it('preserves concurrent commits and recovers a lost successful response without duplicate writes', async () => {
  const race = remote('race');
  await expect(saveRelationChanges(config, 'token', changed, existing, race.fetcher)).rejects.toMatchObject({ code: 'conflict' });
  const lost = remote('lost');
  await expect(saveRelationChanges(config, 'token', changed, existing, lost.fetcher)).rejects.toThrow();
  expect((await saveRelationChanges(config, 'token', changed, existing, lost.fetcher)).recovered).toBe(true);
  expect(lost.writes).toHaveLength(3);
});
it('removes the other card\'s relation to this one in the same commit', async () => {
  const { fetcher, writes } = remote('reverse');
  await saveRelationChanges(config, 'token', a, existing, fetcher, ['b']);
  // A is untouched, so only the card that held the relation is rewritten — in one commit.
  expect(writes[0].body.tree).toEqual([{ path: 'src/content/fragments/b.md', mode: '100644', type: 'blob', content: markdownForDraft(b) }]);
  expect(writes[1].body.message).toContain('b');
  expect(writes.filter(write => write.endpoint === '/git/commits')).toHaveLength(1);
});
it('lets this card take over a relation the other card held', async () => {
  const { fetcher, writes } = remote('reverse');
  await saveRelationChanges(config, 'token', changed, existing, fetcher, ['b']);
  expect(writes[0].body.tree).toEqual([
    { path: existing.path, mode: '100644', type: 'blob', content: markdownForDraft(changed) },
    { path: 'src/content/fragments/b.md', mode: '100644', type: 'blob', content: markdownForDraft(b) },
  ]);
});
it('treats an already deleted card as detached and writes nothing more', async () => {
  const { fetcher, writes } = remote('missing');
  await expect(saveRelationChanges(config, 'token', a, existing, fetcher, ['b'])).resolves.toMatchObject({ recovered: true });
  expect(writes).toEqual([]);
});
it('does not overwrite a concurrent change to the other card', async () => {
  const { fetcher } = remote('race');
  await expect(saveRelationChanges(config, 'token', changed, existing, fetcher, ['b'])).rejects.toMatchObject({ code: 'conflict' });
});
