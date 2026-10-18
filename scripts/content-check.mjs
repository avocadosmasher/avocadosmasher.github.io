import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { checkContentRepository } from '../src/lib/content-repository-check.mjs';

const args = process.argv.slice(2);
const usage = '사용법: node scripts/content-check.mjs [--root <저장소 경로>] [--json]\n'
  + '읽기 전용: 글·Fragment·카테고리·기존 예외 검사\n'
  + '도움말: node scripts/content-check.mjs --help\n'
  + '종료 코드: 0 통과, 1 콘텐츠/입력 오류, 2 명령 사용 오류';
let root = fileURLToPath(new URL('../', import.meta.url));
let argumentError;
const seen = new Set();
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (!['--root', '--json'].includes(arg) || seen.has(arg)) {
    argumentError = `지원하지 않거나 중복된 옵션입니다: ${arg}`;
    break;
  }
  seen.add(arg);
  if (arg === '--root') {
    const value = args[++index];
    if (!value || value.startsWith('-')) { argumentError = '--root 뒤에 저장소 경로가 필요합니다.'; break; }
    root = resolve(value);
  }
}
const help = args.length === 1 && args[0] === '--help';
const result = help ? undefined : argumentError ? {
  ok: false, diagnostics: [{ path: 'scripts/content-check.mjs', rule: 'cli.arguments', field: 'arguments', message: argumentError }],
  knownIssues: [], unusedExceptions: [], graphChecked: false, collectionComplete: false, summary: { blogs: 0, fragments: 0 },
} : checkContentRepository(root);
if (help) console.log(usage);
else {
  if (args.includes('--json')) console.log(JSON.stringify(result));
  else {
    console.log(`검사 ${result.ok ? '통과' : '실패'}: 글 ${result.summary.blogs}개, Fragment ${result.summary.fragments}개`);
    console.log(`콘텐츠 수집: ${result.collectionComplete ? '완료' : '미완료 (표시 개수는 중단 전 읽은 문서만 포함)'}`);
    console.log(`오류 ${result.diagnostics.length}건, 기존 예외 ${result.knownIssues.length}건, 미사용 예외 ${result.unusedExceptions.length}건`);
    console.log(`관계 검사: ${result.graphChecked ? '수행함' : '미수행 (전체 대상을 확정할 수 없음)'}`);
    for (const [label, issues] of [['오류', result.diagnostics], ['기존 예외', result.knownIssues]]) {
      for (const issue of issues) {
        const location = issue.line ? `:${issue.line}${issue.column ? `:${issue.column}` : ''}` : '';
        console.log(`[${label}] ${issue.path}${location} [${issue.rule}] ${issue.field}: ${issue.message}`);
      }
    }
    for (const issue of result.unusedExceptions) console.log(`[미사용 예외] ${issue.path} [${issue.rule}] ${issue.value}`);
  }
  if (argumentError && !args.includes('--json')) console.log(usage);
  process.exitCode = argumentError ? 2 : result.ok ? 0 : 1;
}
