# devlog — Astro 기술 블로그

프로토타입 디자인을 그대로 옮긴 Astro 5 정적 블로그입니다.
마크다운으로 글만 쓰면 되고, GitHub에 push 하면 자동으로 배포됩니다.

## 갖춰진 기능

- 상단 collapse 내비게이션 (모바일 햄버거 + 스크롤 시 축소)
- 글 검색 (⌘K / 돋보기 → 오버레이, 방향키·Enter 지원)
- 태그 분류 (사이드바 태그 클릭으로 필터)
- 메인 프로필 화면 (홈)
- 좌측 사이드바 카테고리 분류 (글 개수 자동 집계)
- 카테고리/태그별 카드 뷰
- 글 보기 우측 floating 목차 (현재 섹션 자동 강조, 모바일은 우하단 버튼)
- 반응형 (PC 3단 → 모바일 단일 칼럼 + 드로어)
- 다크 모드 토글 (선택값 기억)

## 빠르게 시작하기

```bash
npm install      # 의존성 설치 (최초 1회)
npm run dev      # 개발 서버 → http://localhost:4321/devlog/
npm run build    # 프로덕션 빌드 (dist/ 생성)
npm run preview  # 빌드 결과 미리보기
```

> Node.js 18.20.8 이상(또는 20+)이 필요합니다.

## 내 정보로 바꾸기

거의 모든 설정은 한 파일에 모여 있습니다.

- `src/consts.ts` — 사이트 제목, **프로필(이름·소개·이메일·소셜)**, 카테고리와 색상, "요즘 쓰는 기술", 내비 메뉴
- `src/styles/global.css` 맨 위 `:root` — 색상 토큰. `--accent` 한 줄만 바꿔도 전체 포인트 색이 바뀝니다.

## 글 쓰기

`src/content/blog/` 안에 `.md` 파일을 만들면 끝입니다. 파일 이름이 곧 URL이 됩니다
(`my-first-post.md` → `/blog/my-first-post/`).

````markdown
---
title: 글 제목
description: 카드와 검색에 보이는 한 줄 요약
category: Frontend        # consts.ts 의 CATEGORIES 중 하나
tags: [React, 성능]
pubDate: 2026-06-21       # 정렬 기준 (최신순)
readingTime: 8분          # 선택
draft: false              # true 면 빌드에서 제외
---

본문은 마크다운으로 씁니다.

## 이렇게 쓴 ## (h2) 와 ### (h3) 제목이
우측 목차에 자동으로 들어갑니다.

```js
console.log('코드 블록도 그대로 지원');
```
````

새 카테고리를 추가하려면 `src/consts.ts` 의 `CATEGORIES`에 `이름: '#색상코드'`
한 줄만 추가하면 사이드바·카드·라벨에 자동 반영됩니다.

## GitHub Pages 배포

### 1) 배포 경로 설정 — `astro.config.mjs`

- **프로젝트 페이지** `유저명.github.io/레포명/` (기본 설정)
  ```js
  site: 'https://<유저명>.github.io',
  base: '/<레포명>/',
  ```
- **유저 페이지** `유저명.github.io/`
  레포 이름을 `<유저명>.github.io` 로 만들고, `base` 줄을 삭제(또는 `'/'`).

### 2) 푸시

```bash
git init
git add .
git commit -m "init blog"
git branch -M main
git remote add origin https://github.com/<유저명>/<레포명>.git
git push -u origin main
```

### 3) Pages 활성화

GitHub 레포 → **Settings → Pages → Build and deployment → Source** 를
**GitHub Actions** 로 선택합니다. 이후 `main`에 push 할 때마다
`.github/workflows/deploy.yml` 가 자동으로 빌드·배포합니다.

## 폴더 구조

```
src/
├─ consts.ts            ← 사이트/프로필/카테고리 설정 (여기부터 수정)
├─ content/blog/*.md    ← 글 (여기에 추가)
├─ content.config.ts    ← 프론트매터 스키마
├─ styles/global.css    ← 디자인 토큰 + 전체 스타일
├─ components/          ← Navbar, Sidebar, PostCard, TableOfContents, SearchOverlay …
├─ layouts/            ← BaseLayout, PostLayout
└─ pages/
   ├─ index.astro       ← 홈/프로필
   ├─ blog/index.astro  ← 카드 목록
   ├─ blog/[slug].astro ← 글 상세
   └─ search.json.ts    ← 검색 데이터
```
