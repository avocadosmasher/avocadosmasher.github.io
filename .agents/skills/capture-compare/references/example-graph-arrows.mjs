// 예시: Fragments 관계 그래프에서 관계 유형별 선·화살표 후보를 비교한다(2026-09-19 실제 사용).
// 준비: node scripts/fragment-fixture.mjs --count 500 --edges 1500 --out .fragment-test/h02-content --port 4403 --serve
// 실행: node .agents/skills/capture-compare/scripts/capture-sheet.mjs .agents/skills/capture-compare/references/example-graph-arrows.mjs <출력폴더>
// 참고: B안은 이후 src/scripts/fragments.ts에 반영됐으므로, 지금 다시 실행하면 '현재' 후보가 B안과 같게 나온다.
const L = { rel: '관련 개념', pre: '선행 개념', part: '상위 개념', con: '비교 개념' };
const sel = key => `edge[label = "${L[key]}"]`;
const shapes = [
  { selector: 'edge', style: { 'arrow-scale': 1.6, width: 1.3, 'source-arrow-color': '#9690ae' } },
  { selector: sel('pre'), style: { 'target-arrow-shape': 'triangle' } },
  { selector: sel('part'), style: { 'target-arrow-shape': 'diamond', 'target-arrow-fill': 'hollow' } },
  { selector: sel('con'), style: { 'source-arrow-shape': 'tee', 'target-arrow-shape': 'tee' } },
  { selector: 'edge.graph-neighbor', style: { 'source-arrow-color': '#6956d4', 'target-arrow-color': '#6956d4' } },
];
const lines = [
  { selector: sel('con'), style: { 'line-style': 'dotted' } },
  { selector: sel('part'), style: { 'line-style': 'dashed', 'line-dash-pattern': [6, 3] } },
];

let original, focusLabel;
// 원본 스타일에 후보 규칙을 덧붙여 교체한다. 레이아웃을 다시 돌리지 않아 노드 위치가 같다.
const restyle = rules => async page => page.evaluate(([o, r]) => {
  document.getElementById('fragment-graph')._cyreg.cy.style().fromJson([...o, ...r]).update();
}, [original, rules]);
const node = page => page.locator('#graph-accessible button', { hasText: focusLabel }).first();

export default {
  title: '관계 유형별 선·화살표 후보 비교',
  url: 'http://127.0.0.1:4403/fragments/?view=graph',
  viewport: { width: 1280, height: 1000 },
  target: '#fragment-graph',
  hideCss: 'astro-dev-toolbar{display:none!important}',
  async setup(page) {
    await page.waitForFunction(() => /500개 개념/.test(document.getElementById('graph-status')?.textContent ?? ''));
    // 네 유형이 모두 붙은 개념 중 가장 고르게 섞인 것을 중심으로 삼는다(샘플이 차이를 드러내야 한다).
    focusLabel = await page.evaluate(() => {
      const cy = document.getElementById('fragment-graph')._cyreg.cy;
      const rows = cy.nodes().filter(n => n.degree(false) <= 14).map(n => {
        const counts = {};
        n.connectedEdges().forEach(e => { counts[e.data('label')] = (counts[e.data('label')] ?? 0) + 1; });
        const values = Object.values(counts);
        return { label: n.data('label'), deg: n.degree(false), min: values.length === 4 ? Math.min(...values) : 0 };
      });
      rows.sort((a, b) => b.min - a.min || b.deg - a.deg);
      return rows[0].label;
    });
    const combo = page.getByRole('combobox', { name: '중심 개념' });
    await combo.fill(focusLabel);
    await combo.press('Enter');
    await page.waitForFunction(() => !/500개 개념/.test(document.getElementById('graph-status')?.textContent ?? ''));
    await page.waitForTimeout(800);
    original = await page.evaluate(() => document.getElementById('fragment-graph')._cyreg.cy.style().json());
    return `500개 카드 fixture · 중심 개념 “${focusLabel}” 1단계 · ${await page.locator('#graph-status').textContent()} · 밝은 테마`;
  },
  variants: [
    { key: 'now', title: '현재', desc: '선행·상위 개념만 같은 삼각형', apply: restyle([]) },
    { key: 'A', title: 'A. 화살촉만', desc: '선행 ▶ · 상위 ◇ · 비교 ⊣⊢ · 관련 없음', apply: restyle(shapes) },
    { key: 'B', title: 'B. 화살촉 + 선 모양', desc: 'A + 비교 점선 · 상위 긴 점선', apply: restyle([...shapes, ...lines]) },
  ],
  states: [
    { key: 'plain', label: '평소', async apply(page) { await node(page).dispatchEvent('mouseleave'); } },
    { key: 'hover', label: '중심 개념 강조(관계 이름 표시)', async apply(page) { await node(page).dispatchEvent('mouseenter'); } },
  ],
};
