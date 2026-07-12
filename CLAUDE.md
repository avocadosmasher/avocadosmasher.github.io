# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # 최초 1회
npm run dev      # 개발 서버 → http://localhost:4321/ (base 설정에 따라 /devlog/ 등)
npm run build    # 프로덕션 빌드 (dist/ 생성)
npm run preview  # 빌드 결과 미리보기
```

빌드 에러는 대부분 프론트매터 문제(필수 필드 누락, `category` 불일치, `pubDate` 형식 오류)이므로 push 전에 `npm run build`로 확인한다.

Node.js 18.20.8 이상 필요.

## Architecture

**Astro 5 정적 블로그**. 글을 마크다운으로 작성하고 push 하면 GitHub Actions가 빌드해 GitHub Pages에 배포한다.

### 설정의 단일 진입점

`src/consts.ts` 가 사이트의 모든 설정을 담는다: 사이트 메타(`SITE`), 프로필(`PROFILE`), 카테고리 & 색상(`CATEGORIES`), 기술 스택(`SKILLS`), 경력(`CAREER`), 프로젝트(`PROJECTS`), 내비게이션(`NAV`), About 페이지 소개(`ABOUT_INTRO`).

### 내부 링크와 base URL

`astro.config.mjs`의 `base` 값이 `import.meta.env.BASE_URL`로 노출된다. **컴포넌트 내 모든 내부 링크는** `src/utils.ts`의 `href()` 헬퍼를 통해 생성해야 base 경로가 자동으로 붙는다. `base` 를 잘못 설정하면 사이트는 뜨는데 디자인이 전부 깨진다.

```ts
// src/utils.ts 주요 헬퍼
href('blog/')              // base + 'blog/'
postHref(slug)             // 글 상세 페이지 URL
catColor(cat)              // CATEGORIES 색상 반환, 없으면 var(--accent)
fmtDate(d)                 // Date → '2026.06.21'
estimateReadingTime(body)  // frontmatter readingTime 없을 때 fallback
```

### 블로그 글 구조

`src/content.config.ts`가 프론트매터 스키마를 정의한다. 글은 **폴더/index.md** 방식으로 작성하며 폴더명이 slug가 된다.

```
src/content/blog/
  my-post/
    index.md      ← 본문
    image.png     ← 글 이미지는 같은 폴더에 두고 ./image.png 로 참조
```

필수 frontmatter: `title`, `description`, `category`(CATEGORIES 키와 일치해야 함), `pubDate`(YYYY-MM-DD). `draft: true`면 빌드에서 제외된다.

### 검색

`src/pages/search.json.ts`가 빌드 시 검색용 JSON을 생성하고, `src/components/SearchOverlay.astro`가 클라이언트 사이드에서 소비한다.

### 배포

`main` 브랜치에 push 하면 `.github/workflows/deploy.yml`이 자동으로 빌드·배포한다. GitHub 레포 Settings → Pages → Source를 **GitHub Actions**로 설정해야 한다.
