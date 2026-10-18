# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**세션을 시작하면 `STATUS.md`부터 읽는다.** 현재 상태·다음 할 일·문서 위치가 거기 있다. 과거 작업 이력은 `docs/log/INDEX.md`(메뉴판)에서 필요한 항목만 골라 연다.

문서 배치: `docs/guide/`(사람이 읽는 운영법) · `docs/plan/`(계획) · `docs/decision/`(결정 근거) · `docs/log/`(작업 이력, 항목당 1파일) · `docs/archive/`(끝난 단계의 기록).

작업 완료 절차는 `AGENTS.md`를 따른다. 자동 검사 후 사용자에게 기능·방법·예상 결과를 포함한 수동 테스트 가이드를 제공하고, 명시적인 ‘통과’ 판정을 받은 뒤에만 커밋·푸시한다.

글·Fragment·카테고리·프로젝트 이력·경력·프로필 작업의 공통 원문은 [AI 콘텐츠 작업 규약](./docs/guide/AI-콘텐츠-작업규약.md)이다. `STATUS.md`로 작업 범위를 확인한 뒤 이 규약을 읽고, 상세 콘텐츠 규칙은 이 파일에 복제하지 않는다. 이 파일은 프로젝트 구조와 명령을 설명한다.

개발 계획과 브랜치는 현재 개발 건에 맞춰 선택한다. AI-BLOG는 `STATUS.md`가 가리키는 AI-BLOG 계획·결정 기록을 따르고, Fragment 전용 계획·커밋 전략은 해당 개발에 적용한다.

현재 자동화 2차 AI-CONTENT-TOOLS의 [개발계획](./docs/plan/AI-콘텐츠-자동화-2차-개발계획.md)과 [설계 결정](./docs/decision/AI-콘텐츠-자동화-2차-설계결정.md)은 검사기·저장소 Tool·Hook·CI의 경계를 정한다. 1차의 승인 절차·공통 콘텐츠 규약은 유지한다.

평소 AI 위임의 시작점은 [AI 콘텐츠 운영 가이드](./docs/guide/AI-콘텐츠-운영가이드.md), 1차 검증 근거와 한계는 [AI-BLOG 최종 보고서](./docs/AI-블로그-작업-최종보고서.md)에서 확인한다.

## Commands

```bash
npm install      # 최초 1회
npm run dev      # 개발 서버 → 현재 설정은 http://localhost:4321/
npm run build    # 프로덕션 빌드 (dist/ 생성)
npm run preview  # 빌드 결과 미리보기
npm run content:check # 읽기 전용 콘텐츠·카테고리·관계 검사
npm run content:ops -- --help # 글 신규 생성·부분 수정의 계획·로컬 적용 안내
```

push 전에 `npm run build`로 필수 필드·날짜·이미지 경로 등의 오류를 확인한다. 카테고리는 작성 정책상 `CATEGORIES`의 키를 사용하지만, 현재 스키마는 등록 여부를 검사하지 않는다. 빌드 성공과 카테고리 정책 준수를 별도로 확인한다.

`npm run content:check`는 실제 수집 대상과 CATEGORIES·기존 예외를 읽는 별도 검사다. 실행·JSON·종료 코드·지원 범위는 [검사 CLI 사용법](./docs/guide/AI-콘텐츠-검사-CLI-사용법.md)을 따른다. 현재 Hook·CI 저장 차단은 후속 작업이며 기존 승인 훅을 유지한다.

ACTC02의 [도구 요청 계약](./docs/guide/AI-콘텐츠-요청-계약.md)은 확정 JSON·계획·최소 완료 기록·파일 기준 대조를 정한다. ACTB01·ACTB02의 [글 생성·부분 수정 CLI](./docs/guide/AI-콘텐츠-글-생성-CLI.md)는 글 신규 생성과 요청 필드 수정의 plan/apply를 지원한다. 다른 대상과 잠금·복구는 후속 구현이며 Git 승인·저장은 기존 절차를 따른다.

Node.js 18.20.8 이상 필요.

## Architecture

**Astro 5 정적 블로그**. 글을 마크다운으로 작성하고 검증·사용자 판정 후 개발 브랜치에 커밋·push한다. 공개 반영은 별도 판정 범위이며, `main` push 시 GitHub Actions가 검사·빌드 후 GitHub Pages에 배포한다.

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

`src/content.config.ts`가 프론트매터 스키마를 정의한다. 글 로더는 `**/index.md`만 수집하므로 **폴더/index.md** 방식으로 작성한다. 사이트는 수집된 글 ID와 `postSlug()`로 URL을 생성한다. 기존 글 수정에서는 실제 폴더 경로를 유지한다.

```
src/content/blog/
  my-post/
    index.md      ← 본문
    image.png     ← 글 이미지는 같은 폴더에 두고 ./image.png 로 참조
```

필수 frontmatter: `title`, `description`, `category`, `pubDate`. 작성 정책은 등록된 `CATEGORIES` 키와 확정한 `YYYY-MM-DD` 발행일을 요구한다. 현재 스키마는 카테고리 등록 여부를 검사하지 않는다.

`draft: true`면 글은 컬렉션에서 읽히고 스키마 검증도 받지만 목록·검색·상세 페이지 생성에서는 제외된다. 로컬에서도 숨겨지며, 생략하면 `false`가 기본값이다. 기존 공개 템플릿 글을 자동으로 비공개 전환하지 않는다. AI용 새 템플릿·예시는 콘텐츠 수집 경로 밖에 둔다.

### 검색

`src/pages/search.json.ts`가 빌드 시 검색용 JSON을 생성하고, `src/components/SearchOverlay.astro`가 클라이언트 사이드에서 소비한다.

### 배포

`main` 브랜치에 push 하면 `.github/workflows/deploy.yml`이 자동으로 빌드·배포한다. GitHub 레포 Settings → Pages → Source를 **GitHub Actions**로 설정해야 한다.
