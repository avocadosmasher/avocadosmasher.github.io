import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('보안 패치된 Node.js를 설치와 CI에서 함께 사용', () => {
  it('모든 Node 빌드 작업이 같은 보안 버전 파일을 참조한다', () => {
    const version = read('.node-version').trim();
    expect(version).toMatch(/^24\.\d+\.\d+$/);
    const [major, minor, patch] = version.split('.').map(Number);
    expect(major === 24 && (minor > 22 || (minor === 22 && patch >= 1))).toBe(true);

    const workflow = parse(read('.github/workflows/verify.yml'));
    const jobs = Object.values(workflow.jobs) as { steps: { uses?: string; with?: Record<string, unknown> }[] }[];
    const setups = jobs.flatMap(job => job.steps.filter(step => step.uses?.startsWith('actions/setup-node@')));
    expect(setups.length).toBeGreaterThanOrEqual(2);
    for (const step of setups) {
      expect(step.with?.['node-version']).toBeUndefined();
      expect(step.with?.['node-version-file']).toBe('.node-version');
    }
  });

  it('구형 Node로 설치하는 실수를 차단하고 lock의 루트 계약도 맞춘다', () => {
    const manifest = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    expect(manifest.engines?.node).toBe('>=24.22.1 <25');
    expect(lock.packages[''].engines).toEqual(manifest.engines);
    const activeSettings = read('.npmrc').split(/\r?\n/).map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !line.startsWith(';'));
    expect(activeSettings).toContain('engine-strict=true');
  });
});
