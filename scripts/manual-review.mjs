import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const approvalPath = git('rev-parse', '--git-path', 'manual-review.json');
const mode = process.argv[2];
const fail = (message) => { throw new Error(message); };

try {
  if (mode === 'approve') {
    if (git('diff', '--name-only')) fail('Unstaged changes remain. Stage reviewed files first.');
    const approval = { base: git('rev-parse', 'HEAD'), tree: git('write-tree') };
    writeFileSync(approvalPath, JSON.stringify(approval) + '\n');
    console.log('User review recorded for the staged tree.');
  } else if (mode === 'check-commit' || mode === 'check-push') {
    const approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
    if (mode === 'check-commit') {
      if (git('rev-parse', 'HEAD') !== approval.base || git('write-tree') !== approval.tree) {
        fail('The staged change does not match the approved review.');
      }
    } else {
      const updates = readFileSync(0, 'utf8').trim();
      for (const line of updates ? updates.split('\n') : []) {
        const [, localOid] = line.trim().split(/\s+/);
        if (/^0+$/.test(localOid)) fail('Ref deletion requires separate review.');
        const tree = git('rev-parse', `${localOid}^{tree}`);
        const parents = git('show', '-s', '--format=%P', localOid);
        if (tree !== approval.tree || parents !== approval.base) {
          fail('The outgoing commit does not match the approved review.');
        }
      }
    }
    console.log('Manual review gate passed.');
  } else {
    fail('Usage: node scripts/manual-review.mjs approve|check-commit|check-push');
  }
} catch (error) {
  console.error(`Manual review gate blocked: ${error.message}`);
  console.error('Provide the feature, test steps and expected results; wait for explicit user PASS before recording approval.');
  process.exitCode = 1;
}
