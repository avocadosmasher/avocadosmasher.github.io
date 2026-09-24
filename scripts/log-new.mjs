#!/usr/bin/env node
// 작업 로그 항목을 하나 만든다: 항목 파일 생성 + 메뉴판(INDEX.md) 한 줄 추가 + STATUS.md 날짜 갱신.
// 손으로 세 군데를 고치면 언젠가 어긋나므로 한 번에 처리한다.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOG_DIR = 'docs/log';
const INDEX = join(LOG_DIR, 'INDEX.md');
const STATUS = 'STATUS.md';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const title = process.argv[2];
if (!title || title.startsWith('--')) {
  console.error('사용법: node scripts/log-new.mjs "<제목>" [--id D09] [--summary "결론 한 줄"] [--status 기록]');
  process.exit(1);
}

const id = arg('id') ?? title.split(/\s+—\s+|\s+-\s+/)[0];
const summary = arg('summary') ?? '(결론 한 줄을 채운다: 무엇이 문제였고 어떻게 정했는지)';
const status = arg('status') ?? '판정 대기';
const today = new Date().toISOString().slice(0, 10);

const seq = readdirSync(LOG_DIR)
  .map(name => Number.parseInt(name, 10))
  .filter(Number.isInteger)
  .reduce((max, value) => Math.max(max, value), 0) + 1;

const slug = (arg('id') ?? title)
  .replace(/\s+—.*$/, '').replace(/[/\s]+/g, '-').replace(/[^0-9A-Za-z가-힣\-·]/g, '').slice(0, 40) || 'entry';
const file = `${String(seq).padStart(2, '0')}-${slug}.md`;
const path = join(LOG_DIR, file);
if (existsSync(path)) {
  console.error(`이미 있는 파일입니다: ${path}`);
  process.exit(1);
}

writeFileSync(path, `# ${title} (${today}, ${status})

- 시작 기준: 
- 문제·요청: 
- Red: 
- 수정: 
- 자동 검사: 
- 남은 제약: 
`, 'utf8');

// 메뉴판은 최신이 위. 표 머리(구분선) 바로 다음 줄에 끼운다.
const index = readFileSync(INDEX, 'utf8').split('\n');
const divider = index.findIndex(line => /^\| --- \|/.test(line));
if (divider === -1) throw new Error(`${INDEX}에서 표 머리를 찾지 못했습니다.`);
index.splice(divider + 1, 0, `| ${id} | ${today} | ${summary} | ${status} | [${String(seq).padStart(2, '0')}](./${file}) |`);
writeFileSync(INDEX, index.join('\n'), 'utf8');

const statusDoc = readFileSync(STATUS, 'utf8').replace(/^최종 갱신: .*$/m, `최종 갱신: ${today}`);
writeFileSync(STATUS, statusDoc, 'utf8');

console.log(`만들었습니다: ${path}`);
console.log(`메뉴판에 줄을 넣었습니다: ${INDEX}`);
console.log('남은 일: 항목 파일을 채우고, 메뉴판의 결론 한 줄과 STATUS.md의 "지금"·"최근 3건"을 갱신한다.');
