import { describe, expect, it, vi } from 'vitest';
import { latestDeploy } from '../../src/lib/fragment-deploy';

const config = { repo: 'avocadosmasher/avocadosmasher.github.io', branch: 'fragments-draft', publish: 'main', origin: 'https://oauth.example', production: true as const };
const run = (extra: Record<string, unknown> = {}) => ({
  id: 42, status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40),
  html_url: 'https://github.com/avocadosmasher/avocadosmasher.github.io/actions/runs/42',
  updated_at: '2026-09-21T10:00:00Z', ...extra,
});

describe('D03: showing whether the site is deploying', () => {
  it('reads the newest run of the deploy workflow on the published branch', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ workflow_runs: [run()] }));
    expect(await latestDeploy(config, 'test_token', fetcher)).toEqual({
      state: 'success', url: run().html_url, sha: 'a'.repeat(40), at: '2026-09-21T10:00:00Z',
    });
    const [url] = fetcher.mock.calls[0];
    expect(url).toBe(`https://api.github.com/repos/${config.repo}/actions/workflows/deploy.yml/runs?branch=main&per_page=1`);
  });

  it('reports a run that is still going', async () => {
    for (const status of ['queued', 'in_progress', 'waiting', 'requested', 'pending']) {
      const fetcher = vi.fn().mockResolvedValue(Response.json({ workflow_runs: [run({ status, conclusion: null })] }));
      expect((await latestDeploy(config, 'test_token', fetcher)).state).toBe('running');
    }
  });

  it('separates failure from cancellation so a queued replacement is not alarming', async () => {
    for (const [conclusion, state] of [['failure', 'failure'], ['timed_out', 'failure'], ['cancelled', 'cancelled'], ['skipped', 'cancelled']] as const) {
      const fetcher = vi.fn().mockResolvedValue(Response.json({ workflow_runs: [run({ conclusion })] }));
      expect((await latestDeploy(config, 'test_token', fetcher)).state).toBe(state);
    }
  });

  it('reports no run at all rather than guessing', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ workflow_runs: [] }));
    expect(await latestDeploy(config, 'test_token', fetcher)).toEqual({ state: 'none' });
  });

  it('does not treat a malformed or failed response as a deploy state', async () => {
    const broken = vi.fn().mockResolvedValue(Response.json({ workflow_runs: [{ status: 'completed' }] }));
    await expect(latestDeploy(config, 'test_token', broken)).rejects.toThrow();
    const failed = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    await expect(latestDeploy(config, 'test_token', failed)).rejects.toThrow();
  });
});
