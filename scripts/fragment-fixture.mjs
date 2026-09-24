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

// 그래프 색 구분이 보이도록 블로그 카테고리(src/consts.ts CATEGORIES)를 쓴다.
const categories = ['AI', 'Frontend', 'Backend', 'DevOps'];
const types = ['related', 'prerequisite', 'part-of', 'contrasts'];
// 검색·정렬·팝업이 실제 데이터에서 만나는 경계를 재현한다.
const quirks = new Map([
  [0, { title: '한글 조합형 개념', aliases: ['Composed Concept', '조합형'], summary: '한글 조합형 표기와 영문 별칭을 함께 가진 카드입니다.' }],
  [1, { title: '긴 설명 개념', aliases: ['Long Summary'], summary: `줄바꿈 없이 이어지는 긴 설명입니다. ${'좁은 화면에서도 가로 스크롤 없이 접혀야 합니다. '.repeat(6)}` }],
  [2, { title: '<script>처럼 보이는 개념', aliases: ['<b>alias</b>'], summary: '<script>alert(1)</script> 같은 문자열이 그대로 글자로 보여야 합니다.' }],
]);

// edgeTarget이 없으면 기존과 동일하게 카드 0(고립 노드)을 뺀 단순 체인만 만든다.
// edgeTarget을 주면 실제 지식 그래프처럼 소수의 허브에 연결이 몰리도록 선호적 연결로 만든다.
// 두 카드 사이 관계는 방향·유형과 무관하게 하나만 허용하는 저장 규칙을 fixture도 그대로 지킨다.
export function fixtureCards(count, edgeTarget) {
  const ids = Array.from({ length: count }, (_, index) => `fixture-${String(index + 1).padStart(3, '0')}`);
  const cards = ids.map((id, index) => {
    const quirk = quirks.get(index) ?? {};
    return {
      id, title: quirk.title ?? `개념 ${String(index + 1).padStart(3, '0')}`,
      aliases: quirk.aliases ?? [`Fixture ${index + 1}`],
      summary: quirk.summary ?? `검증용 개념 ${index + 1}의 짧은 설명입니다.`,
      category: categories[index % categories.length],
      tags: ['fixture', `묶음-${(index % 3) + 1}`],
      relations: [],
    };
  });
  const pairs = new Set();
  const pairKey = (a, b) => [a, b].sort().join(':');
  const addRelation = (from, to, type) => {
    cards[from].relations.push({ target: ids[to], type });
    pairs.add(pairKey(ids[from], ids[to]));
  };
  // 첫 카드는 관계가 없는 고립 노드로 남겨 그래프 빈 상태를 함께 확인한다.
  if (edgeTarget === undefined) {
    for (let index = 1; index < count; index++) addRelation(index, index - 1, types[index % types.length]);
    return cards;
  }
  // 측정값이 실행마다 흔들리지 않도록 고정 시드를 쓴다.
  let seed = 20260919;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const degree = new Array(count).fill(0);
  const link = (from, to) => {
    if (from === to || pairs.has(pairKey(ids[from], ids[to]))) return false;
    addRelation(from, to, types[(from + to) % types.length]);
    degree[from]++; degree[to]++;
    return true;
  };
  // 연결 수 + 1에 비례해 고른다. 대부분 같은 카테고리에서 골라 주제별 묶음을 만든다.
  const pick = (candidates) => {
    let total = 0;
    for (const index of candidates) total += degree[index] + 1;
    let point = random() * total;
    for (const index of candidates) if ((point -= degree[index] + 1) <= 0) return index;
    return candidates[candidates.length - 1];
  };
  const perCard = Math.max(1, Math.round(edgeTarget / Math.max(1, count - 2)));
  for (let index = 2; index < count && pairs.size < edgeTarget; index++) {
    const earlier = Array.from({ length: index - 1 }, (_, offset) => offset + 1);
    const sameCategory = earlier.filter(other => cards[other].category === cards[index].category);
    for (let added = 0, tries = 0; added < perCard && tries < perCard * 10 && pairs.size < edgeTarget; tries++) {
      const pool = sameCategory.length && random() < 0.85 ? sameCategory : earlier;
      if (link(index, pick(pool))) added++;
    }
  }
  const all = Array.from({ length: count - 1 }, (_, offset) => offset + 1);
  for (let tries = 0; pairs.size < edgeTarget && count > 2 && tries < edgeTarget * 20; tries++) link(pick(all), pick(all));
  return cards;
}

export function writeFixture(directory, count, edgeTarget) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  for (const card of fixtureCards(count, edgeTarget)) {
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
  const edgesFlag = flag('edges', '');
  const edgeTarget = edgesFlag === '' ? undefined : Number(edgesFlag);
  const directory = join(project, flag('out', '.fragment-test/fixture-content'));
  writeFixture(directory, count, edgeTarget);
  const contentDir = `./${relative(project, directory).replaceAll('\\', '/')}`;
  console.log(`Fixture cards: ${count} (edges: ${edgeTarget ?? count - 1}) at ${contentDir}`);
  if (process.argv.includes('--serve')) {
    const port = flag('port', '4402');
    const dev = spawn(process.execPath, ['node_modules/astro/astro.js', 'dev', '--host', '127.0.0.1', '--port', port], {
      cwd: project, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, FRAGMENT_CONTENT_DIR: contentDir },
    });
    dev.on('exit', code => process.exit(code ?? 1));
  }
}
