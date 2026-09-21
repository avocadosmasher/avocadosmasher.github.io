import { api, requireResponse, WriterError, type WriterConfig } from './fragment-writer';

export type DeployState = 'running' | 'success' | 'failure' | 'cancelled' | 'none';
const running = ['queued', 'in_progress', 'waiting', 'requested', 'pending'];
const failed = ['failure', 'timed_out', 'startup_failure', 'action_required'];

/** The published branch deploys through one workflow, so its newest run is the site's state. */
export async function latestDeploy(config: WriterConfig, token: string, upstream: typeof fetch = fetch):
  Promise<{ state: DeployState; url?: string; sha?: string; at?: string }> {
  if (!config.publish) throw new WriterError('conflict', '이 환경에서는 배포 상태를 확인할 수 없습니다.');
  const response = await api(config, token, upstream)(`/actions/workflows/deploy.yml/runs?branch=${encodeURIComponent(config.publish)}&per_page=1`);
  requireResponse(response);
  const body = await response.json().catch(() => { throw new WriterError('network', '배포 상태를 확인하지 못했습니다.'); });
  const runs = body?.workflow_runs;
  if (!Array.isArray(runs)) throw new WriterError('network', '배포 상태를 확인하지 못했습니다.');
  if (runs.length === 0) return { state: 'none' };
  const [run] = runs;
  if (typeof run?.status !== 'string' || typeof run.html_url !== 'string' || !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) {
    throw new WriterError('network', '배포 상태를 확인하지 못했습니다.');
  }
  const state: DeployState = running.includes(run.status) ? 'running'
    : run.conclusion === 'success' ? 'success'
    : failed.includes(run.conclusion) ? 'failure' : 'cancelled';
  return { state, url: run.html_url, sha: run.head_sha, at: run.updated_at };
}
