import { expect, it, vi } from 'vitest';
import { loadFragment, saveExistingFragment, draftFromFields, markdownForDraft } from '../../src/lib/fragment-writer';

const config = { repo: 'tester/fragment-cms-auth-test', branch: 'cms-test', origin: 'https://oauth.example' };
const path = 'src/content/fragments/legacy-name.md';
const source = '---\nid: stable-id\ntitle: 원래 제목\nsummary: 설명\ncategory: Infra\naliases: [별칭]\ntags: [태그]\nrelations:\n  - target: gpa\n    type: related\n---\n**본문**\n';
const permission = () => Response.json({ full_name: config.repo, private: false, permissions: { push: true } });
const file = (content = source, sha = 'a'.repeat(40)) => Response.json({ type: 'file', path, sha, encoding: 'base64', content: Buffer.from(content).toString('base64') });
async function original() {
  return loadFragment(config, 'token', path, 'stable-id', vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(file()));
}
it('loads remote Markdown using the actual filename and preserves ID and relations when fields change', async () => {
  const existing = await original();
  const draft = draftFromFields({ title: '새 제목', summary: '새 설명', category: 'DevOps', body: existing.draft.body }, existing.draft);
  expect(draft.id).toBe('stable-id');
  expect(draft.relations).toEqual([{ target: 'gpa', type: 'related' }]);
  expect(draft.body).toBe('**본문**\n');
  const fetcher = vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(file()).mockResolvedValueOnce(Response.json({ content: { path }, commit: { sha: 'b'.repeat(40) } }));
  await saveExistingFragment(config, 'token', existing, draft, fetcher);
  expect(fetcher.mock.calls[2][0]).toContain(`/contents/${path}`);
  const payload = JSON.parse(fetcher.mock.calls[2][1].body);
  expect(payload.sha).toBe('a'.repeat(40));
  expect(payload.branch).toBe('cms-test');
  expect(Buffer.from(payload.content, 'base64').toString()).toBe(markdownForDraft(draft));
});
it('refuses stale versions without writing and recovers a lost successful response', async () => {
  const existing = await original();
  const draft = { ...existing.draft, title: '수정' };
  const stale = vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(file(source, 'b'.repeat(40)));
  await expect(saveExistingFragment(config, 'token', existing, draft, stale)).rejects.toMatchObject({ code: 'conflict' });
  expect(stale).toHaveBeenCalledTimes(2);
  const recovered = vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(file(markdownForDraft(draft), 'b'.repeat(40)));
  expect((await saveExistingFragment(config, 'token', existing, draft, recovered)).recovered).toBe(true);
  expect(recovered).toHaveBeenCalledTimes(2);
});
it('refuses a different ID, unsafe path, and deleted file', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(file());
  await expect(loadFragment(config, 'token', path, 'wrong-id', fetcher)).rejects.toThrow();
  await expect(loadFragment(config, 'token', '../other.md', 'stable-id', vi.fn())).rejects.toThrow();
  const existing = await original();
  const deleted = vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(new Response(null, { status: 404 }));
  await expect(saveExistingFragment(config, 'token', existing, existing.draft, deleted)).rejects.toThrow();
  expect(deleted).toHaveBeenCalledTimes(2);
});
