import { describe, expect, it, vi } from 'vitest';
import { createWriterConfig, writerConfigFromEnv, draftFromFields, markdownForDraft, verifyWriter, saveNewFragment } from '../../src/lib/fragment-writer';

const config = { repo: 'tester/fragment-cms-auth-test', branch: 'cms-test', origin: 'https://oauth.example' };
const draft = () => draftFromFields({ title: '주소: "변환"', summary: '한글\n---\nid: injected', category: 'Infra', aliases: ' VM, ,주소 ', tags: '', body: '**본문**\n<script>text</script>' });
const permission = () => Response.json({ full_name: config.repo, private: false, permissions: { push: true } });

describe('G02-UI: isolated GitHub new-card writes', () => {
  it('rejects production/missing configuration and blank required fields', () => {
    expect(() => createWriterConfig({ ...config, repo: 'avocadosmasher/avocadosmasher.github.io' })).toThrow();
    expect(() => createWriterConfig({ ...config, branch: 'main' })).toThrow();
    expect(() => draftFromFields({ title: ' ', summary: 'x', category: 'x' })).toThrow();
  });
  it('accepts production writes only on the draft branch of the blog repository', () => {
    const production = { repo: 'avocadosmasher/avocadosmasher.github.io', branch: 'fragments-draft', publish: 'main', origin: 'https://oauth.example', production: true as const };
    expect(createWriterConfig(production)).toEqual(production);
    expect(createWriterConfig(createWriterConfig(production))).toEqual(production);
    expect(() => createWriterConfig({ ...production, repo: 'tester/fragment-cms-auth-test' })).toThrow();
    expect(() => createWriterConfig({ ...production, repo: 'Avocadosmasher/avocadosmasher.github.io' })).toThrow();
    expect(() => createWriterConfig({ ...production, branch: 'cms-test' })).toThrow();
    // Saving straight onto the published branch would put every draft on the live site.
    expect(() => createWriterConfig({ ...production, branch: 'main' })).toThrow();
    expect(() => createWriterConfig({ ...production, publish: 'fragments-draft' })).toThrow();
    expect(() => createWriterConfig({ ...production, publish: undefined })).toThrow();
    expect(() => createWriterConfig({ ...production, origin: 'http://oauth.example' })).toThrow();
    expect(() => createWriterConfig({ ...production, origin: 'https://oauth.example/auth' })).toThrow();
    expect(createWriterConfig(config)).not.toHaveProperty('production');
  });
  it('chooses the writer from build variables and fails closed on conflicting modes', () => {
    const test = { FRAGMENT_CMS_OAUTH_TEST: '1', FRAGMENT_CMS_TEST_REPO: config.repo, FRAGMENT_CMS_TEST_BRANCH: config.branch, FRAGMENT_CMS_OAUTH_ORIGIN: config.origin };
    const production = { FRAGMENT_WRITER_OAUTH_ORIGIN: 'https://oauth.example' };
    expect(writerConfigFromEnv({})).toEqual({ error: '' });
    expect(writerConfigFromEnv(test)).toEqual({ error: '', config });
    expect(writerConfigFromEnv(production)).toEqual({ error: '', config: { repo: 'avocadosmasher/avocadosmasher.github.io', branch: 'fragments-draft', publish: 'main', origin: 'https://oauth.example', production: true } });
    expect(writerConfigFromEnv({ ...test, ...production }).config).toBeUndefined();
    expect(writerConfigFromEnv({ ...production, FRAGMENT_CMS_LOCAL: '1' }).config).toBeUndefined();
    expect(writerConfigFromEnv({ FRAGMENT_WRITER_OAUTH_ORIGIN: 'http://oauth.example' })).toEqual({ error: '저장 설정을 확인해주세요.' });
    expect(writerConfigFromEnv({ ...test, FRAGMENT_CMS_TEST_BRANCH: 'main' })).toEqual({ error: '테스트 저장 설정을 확인해주세요.' });
  });
  it('preserves text and creates a stable ID independent of the title', () => {
    const card = draft();
    expect(card.aliases).toEqual(['VM', '주소']);
    expect(card.tags).toEqual([]);
    expect(card.id).not.toBe(draft().id);
    expect(markdownForDraft(card)).toContain('summary: "한글\\n---\\nid: injected"');
    expect(markdownForDraft(card)).toContain(card.body);
  });
  it('checks write permission before allowing a session', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ full_name: config.repo, private: false, permissions: { push: false } }));
    await expect(verifyWriter(config, 'test_token', fetcher)).rejects.toMatchObject({ code: 'permission' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('creates UTF-8 Markdown only in the configured branch without an overwrite SHA', async () => {
    const card = draft();
    const fetcher = vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ content: { path: `src/content/fragments/${card.id}.md` }, commit: { sha: 'a'.repeat(40) } }, { status: 201 }));
    const result = await saveNewFragment(config, 'test_token', card, fetcher);
    const [url, options] = fetcher.mock.calls[2];
    expect(url).toBe(`https://api.github.com/repos/${config.repo}/contents/src/content/fragments/${card.id}.md`);
    const payload = JSON.parse(options.body);
    expect(payload.branch).toBe('cms-test');
    expect(payload.sha).toBeUndefined();
    expect(Buffer.from(payload.content, 'base64').toString('utf8')).toBe(markdownForDraft(card));
    expect(options.redirect).toBe('error');
    expect(result.url).toBe(`https://github.com/${config.repo}/commit/${'a'.repeat(40)}`);
  });
  it('recovers a lost response by comparing the same file, without a second PUT', async () => {
    const card = draft();
    const fetcher = vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(Response.json({
      type: 'file', encoding: 'base64', content: Buffer.from(markdownForDraft(card)).toString('base64'),
    }));
    expect((await saveNewFragment(config, 'test_token', card, fetcher)).recovered).toBe(true);
    expect(fetcher.mock.calls.every(([, options]) => options.method !== 'PUT')).toBe(true);
  });
  it('does not overwrite a different existing file', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(Response.json({ type: 'file', encoding: 'base64', content: btoa('different') }));
    await expect(saveNewFragment(config, 'test_token', draft(), fetcher)).rejects.toMatchObject({ code: 'conflict' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 409, 422, 500])('does not report HTTP %s as success', async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(permission()).mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status }));
    await expect(saveNewFragment(config, 'test_token', draft(), fetcher)).rejects.toMatchObject({ code: status === 401 ? 'auth' : status === 403 ? 'permission' : [409, 422].includes(status) ? 'conflict' : 'network' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
