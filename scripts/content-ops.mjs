import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OperationContractError, parseOperationCommand } from '../src/lib/content-operation-contract.mjs';
import { parseOperationJson, readOperationBytes } from '../src/lib/content-operation-input.mjs';
import { applyBlogCreate, planBlogCreate } from '../src/lib/content-blog-create.mjs';
import { applyBlogUpdate, planBlogUpdate } from '../src/lib/content-blog-update.mjs';
import { applyFragmentOperation, planFragmentOperation } from '../src/lib/content-fragment-ops.mjs';
import { saveOperationPlan } from '../src/lib/content-operation-plan-file.mjs';

const args = process.argv.slice(2);
const usage = '사용법 (현재 글·Fragment 신규 생성·부분 수정 지원)\n'
  + 'node scripts/content-ops.mjs plan --request <요청 JSON> --out .content-ops/local/<계획 JSON> [--root <저장소>] [--json]\n'
  + 'node scripts/content-ops.mjs apply --request <요청 JSON> --plan .content-ops/local/<계획 JSON> --expect-plan <계획 지문> [--root <저장소>] [--json]\n'
  + '종료 코드: 0 성공/변경 없음, 1 입력/충돌/적용 실패, 2 명령 사용 오류';

if (args.length === 1 && args[0] === '--help') console.log(usage);
else {
  let report;
  try {
    const options = parseOperationCommand(args);
    const root = options.root ? resolve(options.root) : fileURLToPath(new URL('../', import.meta.url));
    const request = parseOperationJson(readFileSync(resolve(options.request_file), 'utf8'));
    const prepare = request?.resource === 'fragment' ? planFragmentOperation : request?.operation === 'update' ? planBlogUpdate : planBlogCreate;
    const apply = request?.resource === 'fragment' ? applyFragmentOperation : request?.operation === 'update' ? applyBlogUpdate : applyBlogCreate;
    if (options.command === 'plan') {
      const prepared = prepare(root, request);
      const saved = prepared.status === 'planned' ? saveOperationPlan(root, request, options.plan_file, prepared.plan) : false;
      report = { ok: true, ...prepared, root, plan_file: options.plan_file, plan_saved: saved };
    } else {
      const plan = parseOperationJson(readOperationBytes(root, options.plan_file).toString('utf8'));
      report = { ok: true, ...apply(root, request, plan, options.expected_plan_hash), root };
    }
  } catch (error) {
    const known = error instanceof OperationContractError;
    const inputFailure = ['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'EISDIR', 'ENAMETOOLONG', 'EMFILE', 'ENFILE', 'ELOOP'].includes(error.code);
    report = { ok: false, status: 'failed', diagnostics: [{ rule: known ? error.code : inputFailure ? 'input.unreadable' : 'operation.failed',
      field: known ? error.field : 'input', message: known ? error.message : inputFailure
        ? `입력이나 경로를 읽을 수 없습니다 (${error.code}).` : '내부 처리 중 실패했습니다. 추가된 파일 목록과 현재 상태를 확인하세요.' }],
      written: error.written ?? (error.created ? [error.field] : []) };
    process.exitCode = known && error.code === 'command.invalid' ? 2 : 1;
  }
  if (args.includes('--json')) console.log(JSON.stringify(report));
  else {
    if (report.root) console.log(`대상 저장소: ${report.root}`);
    if (report.status === 'planned') {
      console.log(`계획 준비: 콘텐츠 파일 ${report.plan.files.length}개, 계획 지문 ${report.plan.plan_hash}`);
      console.log(`계획 파일: ${report.plan_file} (${report.plan_saved ? '새로 저장함' : '기존 파일 보존함'}), 콘텐츠는 아직 적용하지 않음`);
      for (const file of report.preview) {
        console.log(`[${file.operation === 'update' ? '수정' : '추가'} 예정] ${file.path}`);
        if (file.kind === 'markdown') {
          for (const [prefix, source] of file.operation === 'update' ? [['- ', file.before], ['+ ', file.source]] : [['+ ', file.source]]) {
            console.log(source.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,
              character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')).split('\n').map(line => prefix + line).join('\n'));
          }
        } else console.log(`SHA-256: ${file.sha256}`);
      }
    } else if (report.status === 'applied') {
      console.log(`로컬 적용 완료: 파일 ${report.written.length}개 반영, Git 저장·push·발행은 별도 단계`);
      for (const path of report.written) console.log(`[반영] ${path}`);
    } else if (report.status === 'unchanged') console.log('변경 없음: 확정 결과와 실제 파일 일치, 추가 쓰기 0건');
    else {
      console.log('작업 실패');
      for (const issue of report.diagnostics) console.log(`[${issue.rule}] ${issue.field}: ${issue.message}`);
      if (report.written.length) console.log(`실패 전 반영된 파일: ${report.written.join(', ')} (자동 되돌림 없음, 상태 확인 필요)`);
      if (process.exitCode === 2) console.log(usage);
    }
  }
}
