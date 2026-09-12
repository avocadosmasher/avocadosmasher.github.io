import { expect, it } from 'vitest';
import { fragmentHtml } from '../../src/lib/fragment-content';

it('B05 renders Markdown while excluding executable HTML and unsafe URLs', () => {
  const html = fragmentHtml('**핵심**\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n[출처](https://example.org)');
  expect(html).toContain('<strong>핵심</strong>');
  expect(html).toContain('https://example.org');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('javascript:');
});
