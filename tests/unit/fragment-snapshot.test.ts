import { expect, it, vi } from 'vitest';
import { loadFragmentSnapshot } from '../../src/lib/fragment-snapshot';

const config = { repo: 'tester/fragment-cms-auth-test', branch: 'cms-test', origin: 'https://oauth.example' };
const sha = 'a'.repeat(40);
const source = '---\nid: stable-id\ntitle: 최신 제목\nsummary: 최신 요약\ncategory: DevOps\n---\n**본문**\n';
const tree = (extra = {}) => Response.json({ sha, truncated: false, tree: [{ path: 'src/content/fragments/legacy.md', type: 'blob', sha }], ...extra });
const blob = (text = source) => Response.json({ sha, encoding: 'base64', content: Buffer.from(text).toString('base64') });
it('reads a complete snapshot by immutable blob IDs without authentication or writes', async () => {
  const upstream = vi.fn().mockResolvedValueOnce(tree()).mockResolvedValueOnce(blob());
  const snapshot = await loadFragmentSnapshot(config, upstream);
  expect(snapshot[0]).toMatchObject({ path: 'src/content/fragments/legacy.md', draft: { id: 'stable-id', title: '최신 제목', body: '**본문**\n' } });
  expect(upstream.mock.calls[1][0]).toBe(`https://api.github.com/repos/${config.repo}/git/blobs/${sha}`);
  expect(upstream.mock.calls.every(([, options]) => !options.headers.Authorization && !options.method)).toBe(true);
});
it('rejects truncated, unavailable and invalid relation snapshots instead of returning partial cards', async () => {
  await expect(loadFragmentSnapshot(config, vi.fn().mockResolvedValue(tree({ truncated: true })))).rejects.toThrow();
  await expect(loadFragmentSnapshot(config, vi.fn().mockResolvedValue(new Response(null, { status: 403 })))).rejects.toThrow();
  const invalid = source.replace('category: DevOps', 'category: DevOps\nrelations: [{target: missing, type: related}]');
  await expect(loadFragmentSnapshot(config, vi.fn().mockResolvedValueOnce(tree()).mockResolvedValueOnce(blob(invalid)))).rejects.toThrow();
});
it('accepts an empty collection and rejects duplicate IDs', async () => {
  expect(await loadFragmentSnapshot(config, vi.fn().mockResolvedValue(tree({ tree: [] })))).toEqual([]);
  const entries = ['one', 'two'].map(name => ({ path: `src/content/fragments/${name}.md`, type: 'blob', sha }));
  await expect(loadFragmentSnapshot(config, vi.fn().mockResolvedValueOnce(tree({ tree: entries })).mockImplementation(async () => blob()))).rejects.toThrow();
});
