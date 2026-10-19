import { patchContentSource } from './content-source-patch.mjs';

// 기존 blog 호출 계약은 유지하고 원문 범위 편집을 Fragment와 공유함.
export function patchBlogSource(bytes, changes, path) {
  return patchContentSource(bytes, changes, path, 'blog');
}
