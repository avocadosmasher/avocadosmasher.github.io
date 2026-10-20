# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**세션을 시작하면 `STATUS.md`부터 읽는다.** 개발 현황·문서 위치를 확인하고 실제 작업 폴더와 대조한다. 일반 콘텐츠 요청의 진행 상태는 해당 작업의 HANDOFF에서 확인하며 STATUS의 개발 대기를 이어받지 않는다. 과거 개발 이력은 `docs/log/INDEX.md`(메뉴판)에서 필요한 항목만 골라 연다.

문서 배치: `docs/guide/`(사람이 읽는 운영법) · `docs/plan/`(계획) · `docs/decision/`(결정 근거) · `docs/log/`(작업 이력, 항목당 1파일) · `docs/archive/`(끝난 단계의 기록).

작업 분류·기록 소유권과 완료 절차는 `AGENTS.md`를 따른다. 개발은 기존 로그·STATUS, 일반 콘텐츠는 해당 작업공간에 기록한다. 자동 검사 후 사람이 판단할 내용과 근거를 설명하고, 명시적인 ‘통과’ 판정을 받은 뒤에만 커밋·푸시한다. 자동 판정 가능한 검사 실행이나 diff 확인을 사용자에게 요구하지 않는다.

글·Fragment·카테고리·프로젝트 이력·경력·프로필 작업의 공통 원문은 [AI 콘텐츠 작업 규약](./docs/guide/AI-콘텐츠-작업규약.md)이다. `STATUS.md`로 작업 범위를 확인한 뒤 이 규약을 읽고, 상세 콘텐츠 규칙은 이 파일에 복제하지 않는다. 이 파일은 프로젝트 구조와 명령을 설명한다.

개발 계획과 브랜치는 현재 개발 건에 맞춰 선택한다. 일반 콘텐츠 요청을 현재 개발 건의 작업 ID로 등록하지 않는다. 카테고리·프로젝트 내용 수정도 소스 확장자만으로 개발 작업으로 바꾸지 않는다. Fragment 전용 계획·커밋 전략은 해당 기능 개발에 적용한다.

현재 후속 AI-CONTENT-WORKSPACE의 [개발계획](./docs/plan/AI-콘텐츠-작업공간-분리-개발계획.md)과 [설계 결정](./docs/decision/AI-콘텐츠-작업공간-분리-설계결정.md)은 개발 기록과 콘텐츠 작업공간의 경계를 정한다. 작업공간은 `.content-ops/local/tasks/<작업명-고유값>/`에 두고 개별 확정 요청은 `requests/<request_id>/`에 보존한다. 기존 Tool 공개 계약·완료 기록·복구·승인 절차는 유지한다. 실제 구성·HANDOFF·초안은 [작업공간 사용 안내](./templates/ai-content/workspace/README.md), 요청·인계 문장은 [복사용 지시문](./docs/guide/AI-콘텐츠-작업지시문.md)을 사용한다.

선행 자동화 2차 AI-CONTENT-TOOLS의 [개발계획](./docs/plan/AI-콘텐츠-자동화-2차-개발계획.md)과 [설계 결정](./docs/decision/AI-콘텐츠-자동화-2차-설계결정.md)은 검사기·저장소 Tool·Hook·CI의 경계를 정한다. 1차의 승인 절차·공통 콘텐츠 규약은 유지한다.

평소 AI 위임의 시작점은 [AI 콘텐츠 운영 가이드](./docs/guide/AI-콘텐츠-운영가이드.md), 1차 검증 근거와 한계는 [AI-BLOG 최종 보고서](./docs/AI-블로그-작업-최종보고서.md)에서 확인한다.

2차의 실제 plan/apply/recover·인계·충돌 대응은 [자동화 운영 가이드](./docs/guide/AI-콘텐츠-자동화-운영가이드.md), 최종 검증·보장과 한계는 [2차 최종 보고서](./docs/AI-콘텐츠-자동화-2차-최종보고서.md)를 따른다.

후속 작업공간·기록 분리의 실제 CLI 검증과 남은 경계는 [작업공간 분리 최종 보고서](./docs/AI-콘텐츠-작업공간-분리-최종보고서.md)에서 확인한다. 로컬 작업 메모와 실제 적용·승인·Git 저장의 증거는 구분한다.

## Commands

```bash
npm install      # 최초 1회
npm run dev      # 개발 서버 → 현재 설정은 http://localhost:4321/
npm run build    # 프로덕션 빌드 (dist/ 생성)
npm run preview  # 빌드 결과 미리보기
npm run content:check # 읽기 전용 콘텐츠·카테고리·관계 검사
npm run content:ops -- --help # 글·Fragment·카테고리·프로젝트 생성·부분 수정 안내
npm run test:git-gates # 격리 저장소의 실제 commit/push 훅·공통 CI 연결 검사
```

push 전에 `npm run build`로 필수 필드·날짜·이미지 경로 등의 오류를 확인한다. 카테고리는 작성 정책상 `CATEGORIES`의 키를 사용하지만, 현재 스키마는 등록 여부를 검사하지 않는다. 빌드 성공과 카테고리 정책 준수를 별도로 확인한다.

`npm run content:check`는 실제 수집 대상과 CATEGORIES·기존 예외를 읽는 별도 검사다. 실행·JSON·종료 코드·지원 범위는 [검사 CLI 사용법](./docs/guide/AI-콘텐츠-검사-CLI-사용법.md)을 따른다. [Git 훅·공통 CI](./docs/guide/AI-콘텐츠-Git-검사-CLI.md)는 기존 사용자 승인 검사 뒤 커밋 인덱스·전송 커밋의 실제 Git tree를 검사한다. 공통 verify에도 같은 콘텐츠 정책과 실제 처리 도구 격리 빌드를 연결한다. ACTH01 통과 커밋 `8065fd6`의 [실제 원격 Actions](https://github.com/avocadosmasher/avocadosmasher.github.io/actions/runs/39275844500) 성공을 확인했다. 개발 브랜치 검증이며 운영 배포는 아니다.

ACTC02의 [도구 요청 계약](./docs/guide/AI-콘텐츠-요청-계약.md)은 확정 JSON·계획·최소 완료 기록·파일 기준 대조를 정한다. [글 CLI](./docs/guide/AI-콘텐츠-글-생성-CLI.md)·[Fragment CLI](./docs/guide/AI-콘텐츠-Fragment-CLI.md)·[카테고리 CLI](./docs/guide/AI-콘텐츠-카테고리-CLI.md)·[프로젝트 CLI](./docs/guide/AI-콘텐츠-프로젝트-CLI.md)는 같은 plan/apply 명령을 사용한다. Fragment는 명시한 상대 카드의 연결 제거를, 카테고리는 정적 CATEGORIES의 키 추가·색 값 수정을 지원한다. 프로젝트는 원래 항목 전체로 대상을 확인해 요청 값만 수정하며 모호한 후보는 중단한다. 적용은 저장소 단위 잠금으로 보호하며 중단 시 [잠금·복구 가이드](./docs/guide/AI-콘텐츠-잠금-복구-CLI.md)의 recover에 원래 요청·계획·지문을 지정한다. 외부 수정·손상·확인할 수 없는 잠금을 강제로 해제하지 않는다. Git 승인·저장은 기존 절차와 위 콘텐츠 Git 검사를 따른다.

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
