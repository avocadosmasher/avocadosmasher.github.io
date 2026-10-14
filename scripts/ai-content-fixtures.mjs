import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

// 검증 전용: 운영 경로에 저장하거나 콘텐츠 등록 명령을 제공하지 않는다.
export function fillMarkdownTemplate(source, values) {
  const [, header, body] = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/) ?? [];
  if (header === undefined) throw new Error('Markdown frontmatter가 없습니다.');
  const replace = text => text.replace(/\{\{([A-Z_]+)\}\}/g, (_marker, key) => {
    if (typeof values[key] !== 'string') throw new Error(`미확정 치환값: ${key}`);
    return values[key];
  });
  const data = Object.fromEntries(Object.entries(parse(header)).map(([key, value]) =>
    [key, typeof value === 'string' ? replace(value) : value]));
  return `---\n${stringify(data)}---\n${replace(body)}`;
}

const template = path => readFileSync(new URL(`../templates/ai-content/${path}`, import.meta.url), 'utf8');
export const fixtureValues = {
  TITLE: '격리 검증: "따옴표"와 # 기호', DESCRIPTION: '합성 예시 설명', CATEGORY: 'AI',
  PUB_DATE: '2026-01-02', INTRO: 'fixture-public-body', CONTEXT: '검증 배경', DETAILS: '합성 내용',
  EXAMPLE: '검증 예시', TAKEAWAYS: '검증 요약', SOURCES: '합성 데이터이며 실제 인용 없음',
  FRAGMENT_ID: 'fixture-alpha', SUMMARY: 'fixture-card-summary', EXPLANATION: 'fixture-card-body',
  RELATION_NOTES: '검증용 연결',
};

export function markdownFixtures() {
  const blog = fillMarkdownTemplate(template('blog/index.md'), fixtureValues);
  const fragment = fillMarkdownTemplate(template('fragment.md'), fixtureValues);
  return { blog, fragment };
}

export function parseMarkdown(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('Markdown frontmatter가 없습니다.');
  return { data: parse(match[1]), body: match[2] };
}

export function serializeMarkdown(data, body) {
  return `---\n${stringify(data)}---\n${body}`;
}

export function jsonFixtures() {
  const values = { CATEGORY_KEY: 'FixtureCategory', CATEGORY_COLOR: '#123456',
    PROJECT_NAME: '합성 프로젝트', PERIOD: '2026', ROLE: '검증', PROJECT_DESCRIPTION: '합성 이력',
    PROJECT_LINK: 'https://example.com/fixture' };
  const fill = path => JSON.parse(template(path).replace(/"\{\{([A-Z_]+)\}\}"/g,
    (_marker, key) => JSON.stringify(values[key])));
  return { category: fill('category.json'), project: fill('project.json') };
}

export const fixtureRoot = fileURLToPath(new URL('../', import.meta.url));
