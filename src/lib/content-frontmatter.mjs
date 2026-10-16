/**
 * 두 검사 경로에서 같은 frontmatter 경계를 사용한다.
 * @param {string} source
 * @returns {{header: string, body: string} | undefined}
 */
export function splitFrontmatter(source) {
  const opening = source.match(/^\uFEFF?---\r?\n/);
  const remainder = opening ? source.slice(opening[0].length) : '';
  const closing = remainder.match(/(?:^|\r?\n)---(?:\r?\n|$)/);
  if (!opening || !closing || closing.index === undefined) return undefined;
  return { header: remainder.slice(0, closing.index), body: remainder.slice(closing.index + closing[0].length) };
}
