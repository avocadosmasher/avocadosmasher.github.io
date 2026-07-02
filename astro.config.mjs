import { defineConfig } from 'astro/config';

// ┌──────────────────────────────────────────────────────────────┐
// │  GitHub Pages 배포 설정 — 아래 두 줄을 본인 환경에 맞게 수정 │
// └──────────────────────────────────────────────────────────────┘
//
// ▸ 경우 1) 프로젝트 페이지   https://<유저명>.github.io/<레포명>/
//     site: 'https://<유저명>.github.io'
//     base: '/<레포명>/'
//
// ▸ 경우 2) 유저/조직 페이지  https://<유저명>.github.io/
//     레포 이름을 반드시  <유저명>.github.io  로 만들고
//     site: 'https://<유저명>.github.io'
//     base 줄은 통째로 삭제(또는 '/')
//
// 지금은 경우 1(프로젝트 페이지) 기준으로 채워두었습니다.

export default defineConfig({
  site: 'https://avocadosmasher.github.io',
  base: '/devlog/',
  trailingSlash: 'always',
});
