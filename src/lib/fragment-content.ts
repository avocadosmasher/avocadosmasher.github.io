import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export function fragmentHtml(body: string) {
  return sanitizeHtml(marked.parse(body, { async: false }), {
    allowedTags: sanitizeHtml.defaults.allowedTags,
    allowedAttributes: { a: ['href', 'title'], code: ['class'] },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}
