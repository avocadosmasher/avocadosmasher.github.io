import { describe, expect, it, vi } from 'vitest';
import { countPendingDrafts, discardDraftChange, publishDrafts } from '../../src/lib/fragment-publish';
import { WriterError } from '../../src/lib/fragment-writer';

const config = { repo: 'avocadosmasher/avocadosmasher.github.io', branch: 'fragments-draft', publish: 'main', origin: 'https://oauth.example', production: true as const };
const compare = (ahead: number, files: string[] = [], status = 'modified') =>
  Response.json({ status: ahead ? 'ahead' : 'identical', ahead_by: ahead, behind_by: 0, files: files.map(filename => ({ filename, status })) });
const card = (id: string) => `---
id: ${id}
title: ${id}
summary: 요약
category: Infra
aliases: []
tags: []
relations: []
---
`;
const file = (path: string, content: string, sha = 'a'.repeat(40)) =>
  Response.json({ type: 'file', path, sha, encoding: 'base64', content: Buffer.from(content).toString('base64') });

describe('D02: publishing drafts to the live site', () => {
  it('counts the cards waiting on the draft branch', async () => {
    const fetcher = vi.fn().mockResolvedValue(compare(2, ['src/content/fragments/a.md', 'src/content/fragments/b.md']));
    expect(await countPendingDrafts(config, 'test_token', fetcher)).toEqual({ ahead: 2, cards: [
      { path: 'src/content/fragments/a.md', id: 'a', status: 'modified' },
      { path: 'src/content/fragments/b.md', id: 'b', status: 'modified' },
    ] });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(`https://api.github.com/repos/${config.repo}/compare/main...fragments-draft`);
    expect(options.method ?? 'GET').toBe('GET');
  });

  it('reports nothing to publish when the branches match', async () => {
    const fetcher = vi.fn().mockResolvedValue(compare(0));
    expect(await countPendingDrafts(config, 'test_token', fetcher)).toEqual({ ahead: 0, cards: [] });
  });

  it('counts only card files, so unrelated commits do not look like drafts', async () => {
    const fetcher = vi.fn().mockResolvedValue(compare(3, ['src/content/fragments/a.md', 'README.md']));
    expect(await countPendingDrafts(config, 'test_token', fetcher)).toEqual({ ahead: 3, cards: [
      { path: 'src/content/fragments/a.md', id: 'a', status: 'modified' },
    ] });
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

  it('discards a new card by deleting it from the draft branch', async () => {
    const path = 'src/content/fragments/new.md';
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(file(path, card('new'), 'b'.repeat(40)))
      .mockResolvedValueOnce(Response.json({ commit: { sha: 'c'.repeat(40) } }));
    await expect(discardDraftChange(config, 'test_token', path, fetcher)).resolves.toEqual({ removed: true });
    const [url, options] = fetcher.mock.calls[2];
    expect(url).toBe(`https://api.github.com/repos/${config.repo}/contents/${path}`);
    expect(options.method).toBe('DELETE');
    expect(JSON.parse(options.body)).toMatchObject({ branch: 'fragments-draft', sha: 'b'.repeat(40) });
  });

  it('discards an edit by restoring the published content', async () => {
    const path = 'src/content/fragments/a.md';
    const fetcher = vi.fn()
      .mockResolvedValueOnce(file(path, card('a')))
      .mockResolvedValueOnce(file(path, card('a-edited'), 'b'.repeat(40)))
      .mockResolvedValueOnce(Response.json({ content: { path }, commit: { sha: 'c'.repeat(40) } }));
    await expect(discardDraftChange(config, 'test_token', path, fetcher)).resolves.toEqual({ removed: false });
    const [, options] = fetcher.mock.calls[2];
    expect(options.method).toBe('PUT');
    const payload = JSON.parse(options.body);
    expect(payload).toMatchObject({ branch: 'fragments-draft', sha: 'b'.repeat(40) });
    expect(Buffer.from(payload.content, 'base64').toString('utf8')).toBe(card('a'));
  });

  it('discards a deletion by putting the published card back', async () => {
    const path = 'src/content/fragments/gone.md';
    const fetcher = vi.fn()
      .mockResolvedValueOnce(file(path, card('gone')))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ content: { path }, commit: { sha: 'c'.repeat(40) } }));
    await expect(discardDraftChange(config, 'test_token', path, fetcher)).resolves.toEqual({ removed: false });
    const [, options] = fetcher.mock.calls[2];
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body).sha).toBeUndefined();
  });

  it('refuses paths outside the card folder and configurations without a draft branch', async () => {
    const fetcher = vi.fn();
    await expect(discardDraftChange(config, 'test_token', '../secrets.md', fetcher)).rejects.toBeInstanceOf(WriterError);
    await expect(discardDraftChange(config, 'test_token', 'README.md', fetcher)).rejects.toBeInstanceOf(WriterError);
    const test = { repo: 'tester/fragment-cms-auth-test', branch: 'cms-test', origin: 'https://oauth.example' };
    await expect(discardDraftChange(test, 'test_token', 'src/content/fragments/a.md', fetcher)).rejects.toBeInstanceOf(WriterError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does nothing when the draft already matches the published card', async () => {
    const path = 'src/content/fragments/a.md';
    const fetcher = vi.fn()
      .mockResolvedValueOnce(file(path, card('a')))
      .mockResolvedValueOnce(file(path, card('a'), 'b'.repeat(40)));
    await expect(discardDraftChange(config, 'test_token', path, fetcher)).resolves.toEqual({ removed: false, unchanged: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
