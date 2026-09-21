import { describe, expect, it, vi } from 'vitest';
import { countPendingDrafts, publishDrafts } from '../../src/lib/fragment-publish';
import { WriterError } from '../../src/lib/fragment-writer';

const config = { repo: 'avocadosmasher/avocadosmasher.github.io', branch: 'fragments-draft', publish: 'main', origin: 'https://oauth.example', production: true as const };
const compare = (ahead: number, files: string[] = []) => Response.json({ status: ahead ? 'ahead' : 'identical', ahead_by: ahead, behind_by: 0, files: files.map(filename => ({ filename })) });

describe('D02: publishing drafts to the live site', () => {
  it('counts the cards waiting on the draft branch', async () => {
    const fetcher = vi.fn().mockResolvedValue(compare(2, ['src/content/fragments/a.md', 'src/content/fragments/b.md']));
    expect(await countPendingDrafts(config, 'test_token', fetcher)).toEqual({ ahead: 2, cards: 2 });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(`https://api.github.com/repos/${config.repo}/compare/main...fragments-draft`);
    expect(options.method ?? 'GET').toBe('GET');
  });

  it('reports nothing to publish when the branches match', async () => {
    const fetcher = vi.fn().mockResolvedValue(compare(0));
    expect(await countPendingDrafts(config, 'test_token', fetcher)).toEqual({ ahead: 0, cards: 0 });
  });

  it('counts only card files, so unrelated commits do not look like drafts', async () => {
    const fetcher = vi.fn().mockResolvedValue(compare(3, ['src/content/fragments/a.md', 'README.md']));
    expect(await countPendingDrafts(config, 'test_token', fetcher)).toEqual({ ahead: 3, cards: 1 });
  });

  it('merges the draft branch into the published branch', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ sha: 'a'.repeat(40) }, { status: 201 }));
    expect(await publishDrafts(config, 'test_token', fetcher)).toEqual({
      published: true, url: `https://github.com/${config.repo}/commit/${'a'.repeat(40)}`,
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(`https://api.github.com/repos/${config.repo}/merges`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toMatchObject({ base: 'main', head: 'fragments-draft' });
  });

  it('treats an already published branch as success without a commit', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    expect(await publishDrafts(config, 'test_token', fetcher)).toEqual({ published: false });
  });

  it('does not report a conflict or a bad response as published', async () => {
    for (const [status, code] of [[409, 'conflict'], [403, 'permission'], [401, 'auth'], [500, 'network']] as const) {
      const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
      await expect(publishDrafts(config, 'test_token', fetcher)).rejects.toMatchObject({ code });
    }
    const wrong = vi.fn().mockResolvedValue(Response.json({ sha: 'not-a-sha' }, { status: 201 }));
    await expect(publishDrafts(config, 'test_token', wrong)).rejects.toBeInstanceOf(WriterError);
  });

  it('refuses to publish from a configuration without a separate published branch', async () => {
    const fetcher = vi.fn();
    const test = { repo: 'tester/fragment-cms-auth-test', branch: 'cms-test', origin: 'https://oauth.example' };
    await expect(publishDrafts(test, 'test_token', fetcher)).rejects.toBeInstanceOf(WriterError);
    await expect(countPendingDrafts(test, 'test_token', fetcher)).rejects.toBeInstanceOf(WriterError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
