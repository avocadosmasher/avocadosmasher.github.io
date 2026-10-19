import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkContentGitTree } from '../src/lib/content-git-tree.mjs';

const mode = process.argv[2];
if (process.argv.length !== 3 || !['check-commit', 'check-push'].includes(mode)) {
  console.error('Usage: node scripts/git-gates.mjs check-commit|check-push'); process.exitCode = 2;
} else {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true }).trim();
    const updates = mode === 'check-push' ? readFileSync(0, 'utf8') : '';
    // pre-push stdin은 한 번 읽고 기존 승인 검사에 그대로 전달함. 승인 방식 자체는 변경하지 않음.
    const reviewed = spawnSync(process.execPath, [fileURLToPath(new URL('./manual-review.mjs', import.meta.url)), mode],
      { cwd: root, input: updates, encoding: 'utf8', windowsHide: true });
    if (reviewed.stdout) process.stdout.write(reviewed.stdout);
    if (reviewed.stderr) process.stderr.write(reviewed.stderr);
    if (reviewed.status !== 0) process.exitCode = reviewed.status || 1;
    else {
      const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
      const trees = mode === 'check-commit' ? [git('write-tree')] : updates.trim() ? updates.trim().split('\n').map(line => {
        const fields = line.trim().split(/\s+/);
        if (fields.length !== 4 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(fields[1]) || /^0+$/.test(fields[1])) {
          throw new Error('Invalid outgoing reference.');
        }
        return git('rev-parse', `${fields[1]}^{tree}`);
      }) : [];
      for (const tree of new Set(trees)) {
        const result = checkContentGitTree(root, tree);
        if (!result.ok) {
          for (const issue of result.diagnostics) console.error(`[${issue.rule}] ${issue.path}: ${issue.message}`);
          process.exitCode = 1;
        } else console.log(`콘텐츠 Git 검사 통과: ${tree}`);
      }
    }
  } catch (error) {
    console.error(`콘텐츠 Git 검사 중단: ${error.message}`); process.exitCode = 1;
  }
}
