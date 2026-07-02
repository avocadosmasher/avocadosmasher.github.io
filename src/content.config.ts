import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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

export const collections = { blog };
