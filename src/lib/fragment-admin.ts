import { z } from 'zod';
import { fragmentSchema, relationLabels } from './fragments';

interface CmsField {
  name: string;
  label: string;
  widget: string;
  required?: boolean;
  default?: unknown;
  pattern?: [string, string];
  fields?: CmsField[];
  options?: string[];
  collection?: string;
  search_fields?: string[];
  value_field?: string;
  display_fields?: string[];
}

const fields: CmsField[] = [
  { name: 'id', label: 'ID', widget: 'hidden', required: false },
  ...['title', 'summary', 'category'].map(name => ({
    name, label: { title: '용어', summary: '요약', category: '카테고리' }[name]!,
    widget: name === 'summary' ? 'text' : 'string', required: true,
    pattern: ['\\S', '공백 이외의 내용을 입력하세요.'] as [string, string],
  })),
  { name: 'aliases', label: '별칭', widget: 'list', required: false, default: [] },
  { name: 'tags', label: '태그', widget: 'list', required: false, default: [] },
  { name: 'relations', label: '관계', widget: 'list', required: false, default: [], fields: [
    { name: 'target', label: '대상', widget: 'relation', collection: 'fragments',
      search_fields: ['title', 'id', 'aliases'], value_field: 'id', display_fields: ['title', 'id'] },
    { name: 'type', label: '관계 유형', widget: 'select', options: Object.keys(relationLabels) },
  ] },
  { name: 'body', label: '보충 설명', widget: 'markdown', required: false },
];

// Shared field contract; production OAuth configuration is still pending.
export const cmsConfig = {
  backend: { name: 'github', repo: 'avocadosmasher/avocadosmasher.github.io', branch: 'main' },
  local_backend: false,
  media_folder: 'public/uploads',
  public_folder: '/uploads',
  collections: [{
    name: 'fragments', label: 'Fragments', folder: 'src/content/fragments',
    create: true, delete: false, identifier_field: 'id', slug: '{{id}}',
    summary: '{{title}}',
    extension: 'md', format: 'frontmatter', fields,
  }],
};

const saveSchema = fragmentSchema.extend({ body: z.string().default('') });

/** Pass the original persisted ID on edits; never trust a changed form ID. */
export function prepareFragmentSave(input: Record<string, unknown>, existingId?: string) {
  const id = existingId ?? input.id ?? `fragment-${globalThis.crypto.randomUUID()}`;
  return saveSchema.parse({ ...input, id });
}
