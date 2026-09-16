import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { WriterDraft } from './fragment-writer';
import type { PublicFragment } from './fragments';

export function liveFragment(draft: WriterDraft): PublicFragment {
  const { body, ...metadata } = draft;
  const html = DOMPurify.sanitize(marked.parse(body, { async: false }), {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 'del', 's', 'pre', 'code', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'title', 'class'], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  });
  return { ...metadata, html };
}
