import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { fragmentSchema } from './lib/fragments';
import { blogSchema } from './lib/content-schemas.mjs';

// src/content/blog/**/index.md 파일을 블로그 글로 인식하고,
// 프론트매터(상단 ---) 형식을 검증합니다.
const blog = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/blog' }),
  schema: blogSchema,
});

const fragments = defineCollection({
  loader: glob({ pattern: '**/*.md', base: process.env.FRAGMENT_CONTENT_DIR ?? './src/content/fragments' }),
  schema: fragmentSchema,
});

export const collections = { blog, fragments };
