import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { fragmentSchema } from './lib/fragments';

// src/content/blog/*.md 파일을 블로그 글로 인식하고,
// 프론트매터(상단 ---) 형식을 검증합니다.
const blog = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    pubDate: z.coerce.date(),
    readingTime: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const fragments = defineCollection({
  loader: glob({ pattern: '**/*.md', base: process.env.FRAGMENT_CONTENT_DIR ?? './src/content/fragments' }),
  schema: fragmentSchema,
});

export const collections = { blog, fragments };
