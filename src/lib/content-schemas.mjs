import { z } from 'zod';

// Astro 수집과 Node 검사기가 함께 사용하는 기존 데이터 계약. 정책 강화는 별도 검사에서 수행한다.
export const blogSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  pubDate: z.coerce.date(),
  readingTime: z.string().optional(),
  draft: z.boolean().default(false),
});

export const fragmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ID는 영문 소문자·숫자·하이픈으로 작성하세요.'),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  category: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  relations: z.array(z.object({ target: z.string().min(1), type: z.enum(['related', 'prerequisite', 'part-of', 'contrasts']) })).default([]),
});
