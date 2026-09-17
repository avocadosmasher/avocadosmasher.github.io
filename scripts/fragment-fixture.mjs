// 검증용 카드 묶음을 만들고, 원하면 그 내용으로 개발 서버를 띄운다.
// 운영 콘텐츠(src/content/fragments)는 읽지도 쓰지도 않는다.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const flag = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

const categories = ['가상화', 'Infra', '운영체제', '네트워크'];
const types = ['related', 'prerequisite', 'part-of', 'contrasts'];
// 검색·정렬·팝업이 실제 데이터에서 만나는 경계를 재현한다.
const quirks = new Map([
  [0, { title: '한글 조합형 개념', aliases: ['Composed Concept', '조합형'], summary: '한글 조합형 표기와 영문 별칭을 함께 가진 카드입니다.' }],
  [1, { title: '긴 설명 개념', aliases: ['Long Summary'], summary: `줄바꿈 없이 이어지는 긴 설명입니다. ${'좁은 화면에서도 가로 스크롤 없이 접혀야 합니다. '.repeat(6)}` }],
  [2, { title: '<script>처럼 보이는 개념', aliases: ['<b>alias</b>'], summary: '<script>alert(1)</script> 같은 문자열이 그대로 글자로 보여야 합니다.' }],
]);

export function fixtureCards(count) {
  return Array.from({ length: count }, (_, index) => {
    const quirk = quirks.get(index) ?? {};
    return {
      id: `fixture-${String(index + 1).padStart(3, '0')}`,
      title: quirk.title ?? `개념 ${String(index + 1).padStart(3, '0')}`,
      aliases: quirk.aliases ?? [`Fixture ${index + 1}`],
      summary: quirk.summary ?? `검증용 개념 ${index + 1}의 짧은 설명입니다.`,
      category: categories[index % categories.length],
      tags: ['fixture', `묶음-${(index % 3) + 1}`],
      // 첫 카드는 관계가 없는 고립 노드로 남겨 그래프 빈 상태를 함께 확인한다.
      relations: index === 0 ? [] : [{ target: `fixture-${String(index).padStart(3, '0')}`, type: types[index % types.length] }],
    };
  });
}

export function writeFixture(directory, count) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  for (const card of fixtureCards(count)) {
    const frontmatter = [
      '---', `id: ${card.id}`, `title: ${JSON.stringify(card.title)}`,
      `aliases: ${JSON.stringify(card.aliases)}`, `summary: ${JSON.stringify(card.summary)}`,
      `category: ${JSON.stringify(card.category)}`, `tags: ${JSON.stringify(card.tags)}`,
      ...(card.relations.length
        ? ['relations:', ...card.relations.flatMap(rel => [`  - target: ${rel.target}`, `    type: ${rel.type}`])]
        : ['relations: []']),
      '---', '', `검증용 본문 ${card.id}입니다. **강조**와 [링크](https://example.com/)를 포함합니다.`, '',
    ].join('\n');
    writeFileSync(join(directory, `${card.id}.md`), frontmatter);
  }
  return directory;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const count = Number(flag('count', '25'));
  const directory = join(project, flag('out', '.fragment-test/fixture-content'));
  writeFixture(directory, count);
  const contentDir = `./${relative(project, directory).replaceAll('\\', '/')}`;
  console.log(`Fixture cards: ${count} at ${contentDir}`);
  if (process.argv.includes('--serve')) {
    const port = flag('port', '4402');
    const dev = spawn(process.execPath, ['node_modules/astro/astro.js', 'dev', '--host', '127.0.0.1', '--port', port], {
      cwd: project, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, FRAGMENT_CMS_LOCAL: '0', FRAGMENT_CONTENT_DIR: contentDir },
    });
    dev.on('exit', code => process.exit(code ?? 1));
  }
}
