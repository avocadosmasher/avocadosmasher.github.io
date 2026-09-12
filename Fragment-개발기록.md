# Fragment 개발 기록

2026-09-11 개발 시작. 계획의 작업 ID로 진행 상태와 검증 증거를 기록한다.

## 2026-09-12 — 커밋·push 운영 합의

- [커밋·push 전략](./Fragment-커밋-전략.md)을 저장했다. `feat/fragments`에서 최초 체크포인트와 이후 검증된 작은 태스크를 커밋·push한다.
- 현재 누적 변경의 검증 후 체크포인트를 보존하고 A03-1을 진행한다. main 병합·배포는 이번 작업 범위에 포함하지 않는다.
- 체크포인트 검증: `npx vitest run` 3개 파일/9개 테스트 통과, `npx astro check` 오류 0·경고 0·기존 hint 4개. 이번 체크포인트에서 브라우저/프로덕션 빌드는 재실행하지 않았다.

## A01 — 기존 기준선

- 작업 전 변경: 기능 검토/개발 계획 문서 2개만 untracked. 기존 소스 수정 없음.
- Node v24.14.0, Astro 5.18.2.
- `npm run build`: 권한 허용 환경에서 성공, 기존 공개 HTML 10페이지 생성.
- 기존 경고: 일부 블로그 캐시 중복 ID, Shiki의 plain_text 언어 fallback. 콘텐츠 원본 변경 없이 관찰 기록.
- 이전 개발 서버 확인: 홈/블로그/태그/소개/검색 및 공개 글 6편 HTTP 200.

## A02 — 검증 완료 (2026-09-11 13:02 KST)

- Vitest 3 / Playwright / Astro check 설치 시작. 샌드박스 npm 캐시 제한으로 첫 설치 실패, 네트워크 권한을 요청해 재실행.
- 테스트 도구 설치 완료: Vitest 3.2.7, Playwright 1.63.0와 Chromium, Astro check, TypeScript.
- `vitest.config.ts`, `playwright.config.ts`, `scripts/test-preview.mjs`와 package.json의 테스트 명령 구성.
- 생성된 Playwright 보고서가 Astro 검사에 포함되는 문제를 발견해 tsconfig에서 생성 파일 제외. 테스트 산출물과 임시 검사 로그는 gitignore 처리.
- 기존 코드 타입 오류를 수정: BaseLayout의 nullable target, TableOfContents의 nullable 요소/타입 좁히기, 블로그 필터의 DOM 타입. 홈에서 설정에 존재하지 않는 X/LinkedIn 링크 두 개 제거.
- `npx astro check`: 0 errors, 0 warnings, 4 hints. hint는 미사용 import와 inline script 명시 안내이며 검사 실패가 아님.
- `npx vitest run`: 3개 파일 / 9개 테스트 통과.
- `npx playwright test`: Chromium에서 5개 테스트 통과(검색·URL, 팝업·관련 카드, 그래프 진입, 모바일 다크 모드, 기존 공개 페이지 응답).
- 실패 종료 확인: 구현 전 검색/페이징/URL/그래프 함수가 없어서 4개 테스트 실패(exit 1), Fragments 메뉴가 없어서 브라우저 테스트 실패(exit 1). 구현 후 해당 테스트 통과.

## 현재 구현 체크포인트

이전 턴에서 여러 작업을 함께 진행한 상태를 보존한다. 아래의 기본 동작이 구현되어 있지만 42개 작업 전체가 완료된 것은 아니다. 넓은 시나리오 테스트를 개별 작업의 모든 인수 조건 통과로 간주하지 않는다.

| 영역 | 현재 구현 및 검증 | 남은 검증/작업 |
| --- | --- | --- |
| B 데이터 | 스키마·ID·관계 검증, Markdown HTML 정리, fragments 컬렉션 추가. 단위/HTML 테스트 통과 | 격리 콘텐츠를 사용한 실제 빌드 오류 테스트, 중복 ID 로더 동작 확인 |
| C 카드 | Fragments 탭, 카드 목록, 카테고리 집계/필터 | 빈 컬렉션, base 경로, 필터 조합의 브라우저 인수 확장 |
| D 검색/페이징 | 검색·정규화·페이지 계산·URL 상태 구현, 단위 테스트와 검색 E2E 통과 | 13/25개 fixture로 실제 페이지 이동·이력 복원 검증 |
| E 팝업 | 상세, Escape/닫기, 포커스 복원, 관련 카드, 직접 URL | Tab 순환·잘못된 ID·이력 동작 추가 인수 |
| F 그래프 | Cytoscape 지연 로딩, 관계 데이터, 기본 조작, 카드 연결 | 그래프 노드 클릭·실패/재시도·필터·500개 성능 인수 |
| G 웹 편집 | decap-server 개발 의존성 설치만 완료 | 관리 화면/설정/실제 로컬 저장 모두 미구현. CMS 다운로드 직전 중단되었고 public/admin에는 파일이 없음 |
| H 통합/배포 | 기존 공개 페이지 회귀 5번째 E2E에 포함 | 현재 신규 코드의 프로덕션 build/preview, CI 게이트, 실제 배포 모두 미완료 |
| I 종료 문서 | 이 개발 기록과 계획 유지 | 운영 가이드, 최종 검토, 최종 개발 보고서 미완료 |

예제 콘텐츠는 `src/content/fragments/ept.md`, `gpa.md`, `hpa.md` 3개다. 실제 운영 배포 전 예제 포함 여부를 검토한다. 현재 `/admin/` 대상 작성 링크는 연결된 페이지가 없어 아직 동작하지 않는다.

## TDD 증거 기록

- B01–B04: `tests/unit/fragments.test.ts` 선작성 → 구현 모듈 부재로 수집 실패 → `src/lib/fragments.ts` 추가 → 4개 통과. 첫 Red는 assertion 실패가 아닌 모듈 부재임을 구분해 기록한다.
- D/F 데이터: `tests/unit/search.test.ts` 선작성 → 미구현 함수 호출로 4개 assertion 경로 실패 → 함수 구현 → 4개 통과.
- B05: `tests/integration/content.test.ts` 선작성 → 렌더링 모듈 부재 → sanitize-html 기반 구현 → 1개 통과. 실제 Astro 빌드 통합 검증은 별도 필요하다.
- C 화면: Fragments 메뉴를 찾는 Playwright 테스트 선작성 → 메뉴 부재로 실패 → 화면 추가 → 통과.
- E/F의 브라우저 시나리오도 구현 전에 작성했지만 개별 시나리오의 Red 실행은 따로 기록하지 못했다. 전체 E2E 통과를 모든 작업에서 엄격한 TDD를 수행했다는 증거로 사용하지 않는다.

## A03-1 — 검증 완료 (2026-09-12)

- 최초 체크포인트 `5cbe8fb`를 `feat/fragments`에 커밋하고 원격 push 성공. 샌드박스의 .git 쓰기 및 네트워크 제한은 권한 허용 후 재실행해 해결했다.
- Red: `npx vitest run tests/unit/admin.test.ts`가 `fragment-admin` 모듈 부재로 exit 1. assertion 실패가 아닌 테스트 수집 실패임을 구분한다.
- Green: `src/lib/fragment-admin.ts`에 CMS 설정 객체와 저장 준비 함수를 추가했다. 운영 local_backend=false, 삭제 비활성화, ID 숨김, 기존 스키마 필드와 관계 유형을 사용한다.
- 새 ID는 제목과 독립적인 `fragment-<UUID>` 형식이다. 기존 ID를 전달하면 폼의 변경된 ID보다 우선하며, 저장 준비 결과를 다시 전달해도 ID를 유지한다. 본문 보존과 필수값 검증은 기존 Zod 스키마를 확장해 처리한다.
- 검증: `npx vitest run` 4개 파일/13개 테스트 통과. `npx astro check` 오류 0·경고 0·기존 hint 4개. 공통 스키마·관계 유형을 재사용하며 추가 리팩터링은 없었다.
- 이번 단계는 설정/저장 준비 계약만 완료다. CMS에서 실제로 이 함수를 호출하는 연결, 기존 파일 ID 전달, 폼의 저장 전 ID 생성 시점과 파일명 유지, OAuth 설정, 파일 쓰기는 아직 검증하지 않았다. UUID 충돌/중복 ID와 관계 참조는 기존 컬렉션 검증으로 최종 차단한다.
- 설정 객체의 GitHub main 대상은 향후 운영용이다. 아직 관리 화면에 연결하지 않았으며 로컬 실험에서는 반드시 격리 backend를 별도로 구성한다. 이번 작업은 개발 브랜치에만 push한다.
- 참고: [Decap 설정](https://decapcms.org/docs/configuration-options/), [위젯](https://decapcms.org/docs/widgets/), [저장 이벤트](https://decapcms.org/docs/registering-events/). 실제 CMS 로딩·위젯 동작은 A03-2/3에서 확인한다.

## 다음 재개 지점 — A03-2: 관리 화면·격리 로컬 proxy 연결

- git 상태와 이 기록 확인 후 `/admin/` 화면에 설정과 저장 준비 함수를 연결한다.
- 운영 콘텐츠 밖의 격리 데이터만 사용하는 로컬 proxy를 연결하고 화면 로딩·격리 경로를 검증한다.
- A03-3에서 실제 폼 생성/수정 → Markdown 저장 → Astro 수집을 검증한다. OAuth까지 자동 확장하지 않는다.

## 이전 재개 계획 — A03-1 (위 완료 기록으로 대체)

사용자 요청(2026-09-11): 한 번에 작은 태스크 하나만 진행하고 테스트·기록 후 멈춘다. PC 상시 실행을 전제로 하지 않는다.

다음 턴 범위는 아래 하나다. CMS 화면 전체나 OAuth까지 한 번에 확장하지 않는다.

1. `git status --short`와 이 기록 확인.
2. CMS 설정 및 새 카드 ID 생성/기존 ID 보존 테스트를 먼저 작성한다. 중단 직전 시도했던 `tests/unit/admin.test.ts`는 현재 존재하지 않는다.
3. 테스트가 기능 부재로 실패하는지 확인한다.
4. 운영 설정에서 로컬 쓰기 backend가 비활성화되고 카드 필드가 B 스키마와 일치하는 최소 설정/저장 준비 함수를 구현한다.
5. 관련 단위 테스트와 타입 검사 통과 후 결과 기록하고 멈춘다.

그 다음 턴은 A03-2(관리 화면·격리 로컬 proxy 연결), 그 다음은 A03-3(폼 생성/수정 → 파일 저장 검증)로 나눈다. 필요 시 각 작업을 더 쪼갠다.

## 재시작 안내

- 2026-09-12부터 `feat/fragments`에서 작업별 커밋·push한다. 최초 체크포인트는 `5cbe8fb`이며 실제 배포는 아직 하지 않았다.
- PC를 재시작한 뒤 `npm run dev`로 개발 서버를 다시 실행할 수 있다. 서버 프로세스나 대화 메모리에만 저장된 필수 상태는 없다.
- 테스트: `npm test`, `npm run check`, `npm run test:e2e`. Playwright는 4399 포트에 자체 서버를 시작하고 종료한다.
- 현재 파일 기준으로 `npm run build` 후 `npm run test:e2e:preview`를 실행하는 것은 H 단계의 남은 검증이다. 이전 A01의 build 성공과 혼동하지 않는다.
- 기존 4322 개발 서버는 이전 세션에서 시작한 프로세스일 수 있다. 새 작업은 그 서버에 의존하지 않는다.
- npm 설치 로그에 감사 경고가 있었다. 강제 업데이트는 수행하지 않았다. 의존성 영향 분석은 별도 작업으로 남아 있다.

## 외부 연결

- 사용자는 Cloudflare/Netlify 계정이 없다고 답했으며 연결 방법도 준비해 달라고 요청했다. 외부 인증 코드와 계정 생성/설정 안내를 준비해야 한다.
- 실제 OAuth·커밋·배포 검증 전에는 A04/G05/G07/H05를 완료로 표시하지 않는다.
