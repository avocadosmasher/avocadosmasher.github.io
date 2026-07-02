import { CATEGORIES } from './consts';

// astro.config 의 base 값. '/' 또는 '/레포명/' 형태로 끝에 슬래시 포함.
export const base = import.meta.env.BASE_URL;

// base 를 붙인 안전한 내부 링크를 만든다. href('blog/') -> '/devlog/blog/'
export function href(path = ''): string {
  return (base + String(path).replace(/^\/+/, '')).replace(/([^:])\/{2,}/g, '$1/');
}

// 글 상세 페이지 경로
export function postSlug(id: string): string {
  return id.replace(/\\/g, '/').replace(/\/index$/, '');
}

export function postHref(slug: string): string {
  return href('blog/' + postSlug(slug) + '/');
}

export function catColor(cat: string): string {
  return CATEGORIES[cat] ?? 'var(--accent)';
}

// Date -> '2026.06.21'
export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

// 본문 글자 수로 읽는 시간 추정 (frontmatter readingTime 없을 때 대비)
export function estimateReadingTime(body: string | undefined): string {
  const chars = (body ?? '').replace(/\s+/g, '').length;
  const min = Math.max(1, Math.round(chars / 500));
  return `${min}분`;
}
