import { z } from 'zod';

const text = z.string().min(1).refine(value => value === value.trim());
// 기존 요청 계약의 ProjectItem 형태를 정적 원문 해석과 공유함. 기본값·ID는 추가하지 않음.
export const projectSchema = z.object({ name: text, description: text, period: z.string().optional(), role: z.string().optional(),
  highlights: z.array(z.string()).optional(), stack: z.array(z.string()).optional(), link: z.string().optional() }).strict();
