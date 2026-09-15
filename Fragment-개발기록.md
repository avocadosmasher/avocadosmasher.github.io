# Fragment 개발 기록

## G02-UI — 전용 폼 로그인·새 카드 저장 (2026-09-15, 수동 판정 대기)

- 시작 기준 `f1e5322`, `feat/fragments`, 작업 폴더 깨끗함. G01-UI는 사용자 통과 후 이 커밋으로 push 완료했다. 이번 작업은 전용 폼의 새 카드 생성이며 기존 카드 수정·관계 입력으로 확장하지 않았다.
- 기존 Worker의 origin/opener 핸드셰이크와 GitHub OAuth를 전용 폼에 연결했다. 인증 메시지는 고정 origin, 열린 팝업 source, 선행 핸드셰이크를 확인한다. 취소·팝업 닫기·2분 시간 초과를 처리하며, 토큰은 현재 페이지 메모리에만 보관하고 로그아웃 시 지운다.
- 테스트 모드에서만 저장을 켜며 운영 저장소와 main/master 대상은 기존 설정 검증으로 거부한다. GitHub repository API의 공개 저장소·쓰기 권한 확인 후 저장 버튼을 활성화한다. API 요청은 고정 GitHub origin에 보내고 리다이렉트를 거부한다.
- 새 ID를 생성한 뒤 입력과 ID를 고정해 Contents API로 UTF-8/Base64 Markdown을 생성한다. 기존 파일 덮어쓰기 SHA를 보내지 않는다. 재시도 시 같은 경로의 내용이 이미 일치하면 저장을 확인하고 추가 PUT을 보내지 않는다. 실제 생성 응답의 파일 경로·커밋 SHA를 검증한 뒤 결과 링크를 표시한다.
- 권한 거부·로그인 만료·통신 실패에 입력을 유지한다. 저장 요청 후 입력은 결과 확인까지 읽기 전용이며, 성공 후 `다른 카드 작성`으로 다음 카드를 시작한다. 새로고침/페이지 이탈 시 입력·토큰이 사라지고, 영구 초안·충돌 해소 UI·자동 목록 반영은 아직 없다.
- Red: `npx vitest run tests/unit/fragment-writer.test.ts`가 모듈 부재로 수집 실패. `npx playwright test --config playwright.oauth.config.ts tests/oauth/writer.spec.ts -g 'read-only'`는 GitHub 로그인 버튼 부재로 실패했다.
- 구현 중 가짜 토큰의 하이픈이 실제 토큰 형식 검증에 걸린 테스트 fixture를 수정했고, 저장 후 버튼명이 `저장 완료`로 바뀌는 데 맞춰 locator를 수정했다. 이 두 테스트 수정은 구현 결함 수정과 구분한다.
- 검증: `npx vitest run` 8개 파일/34개 통과. Astro가 실제 사용하는 frontmatter 파서로 한글·줄바꿈·따옴표·메타데이터 삽입 방지·HTML 정리도 검사했다. `npx playwright test --config playwright.oauth.config.ts` 9개 통과(기존 OAuth 3개, 전용 UI 6개: 정상 저장/중복 클릭, 응답 유실 재시도, 읽기 전용 권한, 만료 후 재로그인, 취소, 잘못된 인증 메시지).
- 기존 E2E 7개와 `npm run test:e2e:preview` 7개 통과. `npx astro check` 오류 0·경고 0·기존 hint 4개. `npm run build`와 `node scripts/build-writer-test.mjs` 모두 12페이지 성공. 테스트 빌드 및 preview 검사 최초 실행의 spawn EPERM은 권한 허용 후 동일 명령으로 통과했다.
- 일반 산출물의 저장 설정 비활성, 테스트 산출물의 정확한 저장소/브랜치/Worker, 브라우저 JS에 테스트 토큰·Worker Secret binding 이름 미포함을 확인했다. `scripts/build-writer-test.mjs`로 테스트 빌드를 재현하며 `_headers`에 noindex/nofollow와 no-referrer를 추가한다.
- 기존 별도 Cloudflare 테스트 프로젝트에 배포 완료: `https://f3ec1125.fragment-cms-test.pages.dev` (실제 인증은 고정 origin인 `https://fragment-cms-test.pages.dev/fragments/` 사용). CLI `--branch main`은 이 Cloudflare 프로젝트의 배포 슬롯이며 블로그 Git main에 push한 것이 아니다. GitHub 저장 대상은 `avocadosmasher/fragment-cms-auth-test`의 `cms-test`다.
- 배포 후 HTTP 200/noindex, 실제 브라우저의 작성 폼·로그인 버튼·대상 표시·390px 다크 화면·페이지 오류 없음, 실제 OAuth 시작 302/PKCE S256을 확인했다. 첫 화면 검사는 PowerShell 파이프 한글 인코딩으로 locator가 깨져 실패했고, ASCII ID 선택자로 재검사해 통과했다. 인증·저장 E2E는 가짜 토큰과 API 모의 응답이며, 실제 계정 로그인과 새 폼의 GitHub 저장은 사용자 판정 대기다.
- [전용 작성 검증 안내](./Fragment-전용-작성-검증.md)에 실행·수동 테스트·복구·제약을 기록했다. `git diff --check` 통과. 관련 파일만 스테이징하며 이번 변경의 승인 기록·커밋·push는 하지 않는다.

## G01-UI — 블로그 전용 작성 폼 (2026-09-15, 사용자 통과·f1e5322 push 완료)

- 사용자가 기존 Decap 테스트 화면의 로그인·저장·다른 세션 수정 가이드에 대해 통과를 판정했다. 생성·수정 커밋 링크와 ID는 아직 독립 대조하지 않았으므로 실제 커밋 증거 수집은 남아 있다.
- 이어 사용자는 기존 블로그 디자인 안에서 작성·수정·조회를 진행하도록 범위 변경을 승인했다. 개발 계획에 전용 UI와 GitHub 저장 연결, 인증·오류·충돌 재검증 순서를 반영했다. 기존 Decap의 통과를 새 UI의 저장 검증으로 간주하지 않는다.
- Fragments의 관리 화면 링크를 `새 카드` 버튼으로 교체하고, 블로그 색상·폰트·테마를 사용하는 작성 dialog를 추가했다. 용어·요약·카테고리와 별칭·태그·Markdown 보충 설명을 입력할 수 있다. 카테고리는 기존 값 제안과 직접 입력을 지원한다.
- 닫기/Escape 뒤 버튼으로 포커스를 복원하며, 같은 페이지에서 다시 열면 입력과 검색 상태가 유지된다. 새로고침·페이지 이탈 시 입력이 사라짐을 안내한다. 저장 버튼은 비활성화했다. 작성자 권한·실제 저장·수정·관계는 후속 작업이다.
- Red: `npx playwright test tests/e2e/fragment-editor.spec.ts`가 새 카드 버튼 부재로 실패했다. Green: 구현 후 `npx playwright test` 7개 통과(새 폼의 모바일 폭, 입력 유지, 닫기 포커스, 저장 비활성, 검색 유지 및 기존 조회 회귀).
- `npx astro check`: 오류 0, 경고 0, 기존 hint 4개. `npm run build`: 12페이지 성공. `git diff --check` 통과. 로컬 개발 서버를 127.0.0.1:4321에 준비했다. 실제 배포 및 전용 폼 저장은 수행하지 않았다.
- 이전 승인 게이트 작업은 사용자 통과 후 `283d56a`로 커밋·push 완료. 이번 변경은 새 수동 판정 대상이며 커밋·push 대기다.

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
| G 웹 편집 | A03-3까지 격리 로컬에서 실제 폼 생성·수정·재열기·ID/파일명 보존·Astro 수집 검증 | 관계 선택 UI 인수, 실패/충돌, OAuth 및 실제 GitHub 저장 미완료 |
| H 통합/배포 | 기존 공개 페이지 회귀, A03-2 프로덕션 build 성공 | preview 전체 인수, CI 게이트, 실제 배포 미완료 |
| I 종료 문서 | 이 개발 기록과 계획 유지 | 운영 가이드, 최종 검토, 최종 개발 보고서 미완료 |

예제 콘텐츠는 `src/content/fragments/ept.md`, `gpa.md`, `hpa.md` 3개다. 실제 운영 배포 전 예제 포함 여부를 검토한다. `/admin/`은 로컬 명시 실행에서 CMS가 열리며 일반 실행/운영 빌드에서는 인증 연결 준비 안내를 표시한다.

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

## A03-2 — 검증 완료 (2026-09-12)

- 시작 기준: `ae6a9ed`, 작업 폴더 깨끗함. 개발 브랜치 `feat/fragments` 유지.
- `/admin/` Astro 페이지, CMS 수동 초기화와 preSave 연결, `npm run dev:admin` 실행기를 추가했다. public/index.html·config.yml 대신 기존 TypeScript 설정을 직접 전달한다.
- CMS 3.16.2 브라우저 파일(약 4.9 MiB)을 고정해 저장하고 라이선스·제3자 고지·SHA256을 vendor README에 기록했다. 런타임 CDN 요청은 없다.
- proxy는 127.0.0.1:8082, Astro는 127.0.0.1:4400. cwd와 GIT_REPO_DIRECTORY를 `.fragment-test/cms`로 고정한다. 기존 연습 데이터를 보존하고 실행 종료 시 두 자식 프로세스를 종료한다. 포트 사용 중에는 시작하지 않는다.
- 로컬은 proxy backend를 직접 선택해 GitHub로 fallback하지 않는다. 운영은 인증 미연결 안내만 표시한다. 관리 목록은 ID 대신 title을 표시하도록 summary 설정을 추가했다.
- Red: 최초 실행기 부재의 서버 시작 실패는 유효한 Red로 세지 않았다. 실행기 구성 후 `/admin/` 미구현으로 카드 표시 assertion 실패를 확인했다(exit 1).
- Green/Refactor: CMS 로그인 버튼 렌더링을 기다리도록 테스트를 수정하고, 관리 화면에서 카드 제목·용어·요약 표시를 확인했다. proxy API 검증 요청의 필수 branch/depth도 보완했다.
- 검증: `npx vitest run` 13개 통과; `npx playwright test --config playwright.admin.config.ts` 2개 통과(격리 카드 읽기·폼 열기·상위 경로 거부·운영 파일 불변, proxy 장애 안내); `npx playwright test` 6개 통과; `npx astro check` 오류 0·경고 0·기존 hint 4개.
- 일반/관리 Playwright를 동시 실행하면서 공통 산출물 경로 충돌(ENOENT)이 있었다. 관리 결과 경로를 `.fragment-test/admin-results`로 분리하고 재검증했다.
- `FRAGMENT_CMS_LOCAL=1` 환경에서 프로덕션 build 성공(12페이지), dist/admin/index.html의 data-local=false 확인. 최초 빌드는 샌드박스 EPERM으로 실패했으며 권한 허용 후 성공했다. preview 전체 검증/배포는 이번에 수행하지 않았다.
- [로컬 CMS 실행 안내](./Fragment-로컬-CMS.md) 작성. 운영 카드 원본은 변경하지 않았다.
- 남은 사항: 실제 폼 생성/수정·파일 쓰기·기존 ID/파일명 보존·Astro 수집은 A03-3에서 인수한다. preSave 연결만으로 저장 성공을 주장하지 않는다. 운영 OAuth 및 GitHub 저장은 아직 미연결이다.

## A03-3 — 검증 완료 (2026-09-12)

- 시작 기준: `cac0b7a`, `feat/fragments`, 작업 폴더 깨끗함.
- `admin-local.mjs --test`는 실행마다 `.fragment-test/cms-runs/run-*/cms`에 새 fixture를 생성한다. 수동 연습 폴더는 보존한다. 생성 테스트와 기존 카드 수정 테스트는 서로 다른 파일을 사용하며 결과 파일은 삭제하지 않는다. 최근 경로는 `.fragment-test/admin-run.json`에 기록한다.
- 로컬 Astro의 FRAGMENT_CONTENT_DIR를 proxy와 같은 격리 콘텐츠로 연결했다. Windows 절대 경로를 전달하면 glob 로더가 URL scheme 오류로 서버 시작에 실패해 프로젝트 상대 경로와 `/` 구분자로 수정했다. 이 환경 구성 실패를 TDD Red로 세지 않는다.
- `tests/admin/save.spec.ts`: 폼 생성 → 실제 파일·ID 확인 → 제목/요약/본문 수정·별칭/태그 비우기 → 같은 파일/ID 확인 → 별도 브라우저 세션에서 재열기 → Astro 컬렉션과 공개 팝업 반영을 검증했다. Markdown 모드의 굵은 본문도 원문 저장을 확인했다.
- 기존 `legacy-card.md`의 ID는 `stable-existing-id`로 파일명과 다르게 준비했다. 폼에서 제목을 바꾸어도 파일명·ID·기존 관계·본문이 보존되고 재열기와 공개 팝업에 반영됨을 확인했다.
- 기본 저장 시나리오는 기존 preSave 구현으로 처음부터 통과했다. 저장 코드에 억지 Red를 만들지 않았으며 저장 함수 변경은 없었다. optional 표시가 붙은 CMS 라벨 및 Markdown 입력 방식에 맞춰 테스트 locator를 수정했다.
- 파일 변경과 Astro 수집 사이의 지연으로 오래된 제목이 보이는 실패를 확인했다. 파일 저장 완료와 수집 결과를 각각 기다리며, 공개 조회는 편집 화면과 별도 탭으로 검증한다. 편집 화면에서 직접 나가는 테스트의 ERR_ABORTED는 이 흐름으로 대체했으며 일반 페이지 이탈 UX를 인수했다는 의미는 아니다.
- 검증: `npx playwright test --config playwright.admin.config.ts` 4개 통과. `npx playwright test` 6개 통과(일반 실행에서 운영 카드만 수집하는 검사 추가). `npx vitest run` 13개 통과. `npx astro check` 오류 0·경고 0·기존 hint 4개.
- 샌드박스 EPERM으로 브라우저 실행 및 최종 타입 검사가 각각 실패해 권한 허용 환경에서 재실행 후 통과했다. 기능 실패로 기록하지 않는다.
- 이번 Astro 수집 증거는 개발 서버에서 실제 저장 파일을 읽은 결과다. 새 프로덕션 빌드/preview/운영 배포를 수행한 것은 아니다. 운영 카드 원본은 변경하지 않았다.
- 실행 안내 갱신. A03의 로컬 저장 실험은 완료했지만 OAuth 제공자 후보·비용·권한·콜백 설정 정리는 아직 남아 있어 A03 전체 완료로 표시하지 않는다.

## A03-4 — 검증 완료 (2026-09-12)

- 시작 기준: `24f9d5f`, `feat/fragments`, 작업 폴더 깨끗함.
- [외부 인증 연결 안내](./Fragment-외부-인증.md)를 작성했다. GitHub·Decap·Cloudflare·Netlify 공식 자료로 비용, scope, callback, 계정 설정과 실제 저장 인수 기준을 확인했다.
- GitHub Pages 유지 + Cloudflare Workers Free의 OAuth 중계를 권장안으로 정리했다. 이는 설계 제안이며 사용자 계정 생성·서비스 선택·Worker 구현·배포를 수행한 것은 아니다. Netlify 직접 GitHub OAuth를 대안으로 포함했다.
- Netlify Identity의 지원 유지와 Git Gateway의 deprecated 상태를 구분했다. 고정 Decap 3.16.2 파일에서 auth_scope 생략 시 repo 요청, base_url/auth_endpoint 전달을 확인했다. 공개 테스트 저장소에는 public_repo를 명시하되 단일 저장소 제한이 아님을 기록했다.
- 현재 소스의 운영 CMS 비활성 분기, 저장 대상 main, main push 배포 workflow를 대조했다. 별도 테스트 저장소·브랜치에서 A04를 인수하도록 안내했다. 최신 GitHub 토큰 만료 설정은 고정 CMS와 후속 호환성 검증이 필요하다.
- 문서 작업으로 TDD Red/Green은 해당 없음. 문서 내부 링크·필수 항목과 `git diff --check`를 검증했다. 실행 코드 변경이 없어 unit/check/build/E2E는 재실행하지 않았다.
- A03-1~3의 기존 로컬 증거와 이번 외부 구성 안내로 A03 범위를 완료했다. 실제 OAuth·GitHub 저장은 여전히 미검증이며 A04/G05/G07/H05는 완료가 아니다.

## A04-1 — 로컬 검증 완료 (2026-09-12)

- 시작 기준: `7e58a0c`, `feat/fragments`, 작업 폴더 깨끗함. 계정 가입·외부 배포 없이 구현했다.
- `workers/fragment-oauth/worker.ts`: `/auth`, `/callback`, HMAC state, PKCE S256, Secure/HttpOnly/SameSite 쿠키 결합을 구현했다. SQLite Durable Object가 10분 만료 세션을 트랜잭션에서 한 번 소비하고 alarm으로 정리한다. 실제 workerd에서 같은 callback의 동시 요청이 200/403으로 나뉨을 확인했다.
- 토큰 교환은 고정 GitHub URL로만 요청하고 리다이렉트·오류·잘못된 scope 응답을 거부한다. popup은 고정 origin/opener 핸드셰이크, JSON 이스케이프, nonce CSP, no-store/no-referrer를 사용한다. refresh token은 전달하지 않는다.
- `createOAuthTestConfig`와 `FRAGMENT_CMS_OAUTH_TEST`를 추가했다. 테스트 저장소·브랜치·OAuth origin이 모두 유효해야 열리며 운영 저장소(대소문자 변형 포함), main/master, 잘못된 URL을 거부한다. 일반 실행은 기존 인증 준비 안내, `dev:admin`은 기존 격리 proxy를 사용한다.
- Red: `npx vitest run tests/unit/oauth.test.ts`가 Worker 모듈 부재로 exit 1. 첫 Red는 assertion 실패가 아닌 수집 실패다. 구현 후 단위 테스트 6개 통과.
- 추가 런타임 Red: Node 테스트는 통과했으나 workerd에서 `redirect: error` 미지원으로 토큰 교환이 실패했다. `manual`로 바꾸고 3xx를 실패 처리한 뒤 실제 런타임의 모의 토큰 교환이 통과했다. 초기 Miniflare API/호환 날짜 불일치 및 모의 요청 body 읽기 오류는 환경/테스트 수정으로 구분한다.
- 브라우저: 실제 고정 Decap 3.16.2의 팝업 → 가짜 토큰을 사용한 GitHub API 요청, 취소 오류 표시, 잘못된 origin/source/message 무시, 스크립트 문자열 비실행을 검증했다. GitHub 요청은 가로채며 실제 계정·커밋을 사용하지 않았다.
- 검증: Vitest 6개 파일/22개 테스트 통과. OAuth Playwright 3개, 기존 CMS Playwright 4개, 일반 Playwright 6개 통과. Astro check 오류 0·경고 0·기존 hint 4개. Worker와 테스트의 별도 `tsc --noEmit`도 통과했다. Miniflare의 namespace 타입 매핑 오류는 표준 DurableObjectNamespace로 경계에서 명시했다.
- `npm run build` 성공(12페이지), 기본 dist/admin에 OAuth 설정이 없고 브라우저 JS에 Worker Secret binding 이름·테스트 비밀값이 없음을 확인했다. `wrangler deploy --dry-run` 성공(binding 포함, 실제 배포 아님). 전체 preview E2E와 실제 운영 인수는 이번 범위에서 실행하지 않았다.
- Wrangler 4.100.0, Miniflare 4.20260730.0으로 고정하고 Workers 타입은 4 계열로 맞췄다. 최신 태그의 실험 Miniflare 5를 직접 테스트 도구로 사용하지 않는다. compatibility_date는 검증 런타임이 지원하는 2026-08-06이다. 기존 lock의 동일 경로 패키지 버전 비교에서 `@emnapi/runtime`만 1.11.1→1.11.3으로 바뀌었고 빌드/회귀는 통과했다.
- 설치 시 npm audit 경고 18개(3 low/4 moderate/10 high/1 critical)가 표시됐다. 기존 의존성 경고와 이번 개발 도구의 영향을 분리한 감사는 수행하지 않았으며 보안 감사 통과를 주장하지 않는다. 강제 업데이트는 하지 않았다. 샌드박스의 설치·프로세스 제한은 권한 허용 후 재실행했다.
- [Worker 실행 안내](./workers/fragment-oauth/README.md)와 외부/로컬 CMS 안내를 갱신했다. Durable Objects의 별도 Free 한도도 안내했다.
- 남은 한계: mock 403에서 Decap은 repo 오류를 표시하지만 Logging in 버튼이 비활성 상태로 남는다. 새로고침 복구와 향후 G05/G06 개선 항목으로 기록했다. 실제 토큰 만료·재로그인·입력 보존, refresh, GitHub 권한 정책, 실계정 저장은 아직 미검증이다.

## A04-2 — 테스트 관리 화면 업로드 준비 (2026-09-13)

- 사용자가 Cloudflare 계정 및 Worker 주소 `https://fragment-oauth-test.rdd0426.workers.dev`, 테스트 저장소 `avocadosmasher/fragment-cms-auth-test` 준비를 확인했다.
- `git ls-remote`로 `main`과 `cms-test`가 `69a7f2541add0a92eb42b91653fcf6bedff283a8`에 있음을 확인했다. 원격 변경은 수행하지 않았다.
- 테스트 OAuth 환경변수에 위 저장소·Worker와 `cms-test`를 전달해 `npm run build -- --outDir .fragment-test/oauth-site` 성공(12페이지). 최초 샌드박스 spawn EPERM은 권한 허용 후 재실행했다.
- 생성된 admin HTML의 저장소·브랜치·Worker URL을 검사했다. `/admin/`과 해당 HTML이 참조하는 단일 번들, 고정 CMS vendor 및 라이선스를 `.fragment-test/cms-upload-191b9af9e6834c8eb1fddad85f0e5b61.zip`에 묶었다. 업로드 ZIP에는 블로그 페이지가 포함되지 않는다. 산출물은 Git 제외 대상이다.
- `git diff --check` 통과. 실행 코드 변경은 없으며 단위/E2E 검사는 재실행하지 않았다. HTTPS 화면 렌더링, OAuth App/Secret 연결, Worker 실제 코드 배포, 로그인·저장은 아직 미검증이다.
- 다음: 사용자가 별도 Cloudflare Pages 프로젝트에 ZIP을 업로드하고 `/admin/`의 테스트 대상 표시와 로그인 버튼을 확인한 뒤 실제 관리 화면 URL과 수동 판정을 전달한다. 커밋·푸시는 판정 대기 중이다.
- 첫 업로드 후 `https://fragment-cms-test.pages.dev/`, `/admin/`, `/admin/index.html`이 모두 HTTP 404임을 외부에서 재현했다. PowerShell `Compress-Archive`가 ZIP 엔트리를 Windows 역슬래시(`admin\\index.html`)로 기록한 것이 원인이었다. POSIX 슬래시 엔트리와 루트 진입 페이지를 포함한 수정 ZIP으로 교체해 재검증한다.
- 수정 배포에서 HTML·주 진입 스크립트·Decap vendor가 HTTP 200임을 확인했지만 화면이 로딩 문구에서 멈췄다. 주 진입 스크립트가 import하는 `_astro/fragments.pNdcZjSe.js`가 첫 수정 ZIP에 누락된 패키징 오류였다. 해당 의존성을 포함한 `fragment-cms-test-pages-v2.zip`을 만들고 ZIP 안의 정적 import가 모두 해소되는지 검사했다.
- 사용자 수동 확인으로 v2의 저장소·브랜치 표기와 GitHub 로그인 버튼 표시가 통과했다. 관리 화면 배포 기록은 `65436da`로 개발 브랜치에 push했다.
- Cloudflare CLI를 `rdd0426@gmail.com` 계정에 OAuth 로그인했다. 계정 표시명 `Rdd0426@gmail.com's Account`와 실제 `rdd0426.workers.dev` 서브도메인의 대소문자 표시는 연결 오류가 아니다.
- GitHub OAuth App Client ID, CMS origin `https://fragment-cms-test.pages.dev`, callback `https://fragment-oauth-test.rdd0426.workers.dev/callback`을 Worker 공개 변수에 반영했다. Client Secret은 저장소나 대화에 넣지 않는다.
- `OAUTH_STATE_SECRET` 생성 시 첫 PowerShell 난수 API가 실패했는데 파이프라인이 계속되어 임시 값이 등록됐다. 이를 즉시 호환 가능한 `RandomNumberGenerator.Create().GetBytes`의 새 32바이트 난수로 교체했다. 첫 값은 OAuth 코드 배포 전 교체되어 인증 요청에 사용되지 않았다.
- OAuth 단위·workerd 통합 테스트 2개 파일/9개 통과, Worker·테스트 `tsc --noEmit` 통과, 실제 설정 dry-run 통과. 샌드박스 spawn EPERM은 권한 허용 후 재실행했다.
- Worker 버전 `0a712553-b6a3-42b5-917d-7dd825719243`을 `fragment-oauth-test.rdd0426.workers.dev`에 배포했다. 배포 후 루트와 올바른 `/auth` 요청이 모두 HTTP 503/no-store를 반환해 Hello World 교체와 Client Secret 미설정 시 fail-closed를 확인했다.
- 다음: 사용자가 GitHub OAuth App에서 발급한 Client Secret을 Cloudflare의 `GITHUB_CLIENT_SECRET` Secret으로 직접 등록한다. 등록 후 실제 GitHub 리다이렉트와 로그인·저장을 인수한다.
- 사용자가 `GITHUB_CLIENT_SECRET` 등록 완료를 확인했다. 실제 `/auth` 요청은 HTTP 302로 GitHub `/login/oauth/authorize`에 이동하며 Client ID, 정확한 callback, `public_repo`, PKCE S256, 임의 state/challenge와 HttpOnly·Secure·SameSite=Lax 쿠키가 모두 포함됨을 값 노출 없이 검사했다.
- 첫 외부 검사에서 302 조건은 통과했지만 결과 표시용 PowerShell `System.Web.HttpUtility` 타입이 없어 명령이 exit 1이었다. Node 표준 URL 파서로 같은 계약을 재검사해 exit 0을 확인했다. 실제 사용자 승인과 CMS 복귀는 수동 판정 대기 중이다.

## 다음 재개 지점 — G02-UI 실제 저장 인수 후 G03-UI 수정 연결

- 외부 계정과 Worker 설정은 준비됐고, 기존 Decap 화면의 로그인·저장 인수는 사용자 통과 판정을 받았다. 전용 폼은 위 G02-UI 기록과 별도로 실제 로그인 → 샘플 커밋을 인수한다.
- 현재 수동 대상은 `https://fragment-cms-test.pages.dev/fragments/`의 전용 새 카드 저장이다. 사용자 통과와 커밋 증거를 확인한 뒤 승인된 변경을 커밋·push하고, 다음 작은 작업에서 기존 카드 수정·파일/ID 보존을 연결한다.
- 공유할 정보는 URL·테스트 저장소·브랜치·Secret 설정 완료 여부이며 비밀값 자체는 대화·저장소에 넣지 않는다. A04/G05/G07/H05는 아직 완료가 아니다.

## 작업 절차 보강 — 사용자 수동 검증 게이트 (2026-09-15, 판정 대기)

- 재개 시점에 남아 있던 절차 변경을 하나의 작은 작업으로 정리했다. `AGENTS.md`에 자동 검사 → 개발 기록·스테이징 → 사용자 수동 판정 → 승인 기록 → 커밋·push 순서를 명시하고, `CLAUDE.md`와 커밋 전략에서 이 절차를 참조하도록 했다.
- `scripts/manual-review.mjs`는 승인 시점의 HEAD와 스테이징 트리를 로컬 Git 디렉터리에 기록한다. `pre-commit`은 현재 스테이징 트리가 승인본과 같은지, `pre-push`는 나가는 커밋의 트리와 부모가 승인본과 같은지 검사한다. ref 삭제, 승인 없는 변경, 승인 뒤 변경·추가 커밋은 차단한다.
- `scripts/manual-review.test.mjs`는 승인 없음, 스테이징 전 승인 시도, 일치하는 승인본, 승인 후 변경, 승인된 커밋 push, 추가 커밋 push, ref 삭제를 격리된 임시 저장소에서 검증한다. 테스트 fixture만 OS 임시 폴더에서 제거하며 실제 저장소의 승인 상태는 만들거나 변경하지 않는다.
- 자동 검사: `node --test scripts/manual-review.test.mjs` 1개 통과. 최초 실행은 샌드박스의 하위 프로세스 생성 제한으로 `spawn EPERM`이 발생했고, 권한 허용 환경에서 같은 명령을 재실행해 통과했다. `git diff --check`도 통과했다.
- `core.hooksPath`는 이미 `.githooks`로 설정되어 있어 덮어쓰지 않았다. 현재 변경은 관련 파일만 스테이징하고 사용자 수동 판정을 기다린다. 승인 명령, 커밋, push는 실행하지 않았다.
- 다음 기능 작업은 기존 재개 지점인 A04-2 실제 GitHub 로그인 → 테스트 카드 저장 → 다른 세션 수정·ID 보존 인수다.

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

- Cloudflare 테스트 사이트·Worker·GitHub OAuth App 연결은 완료했다. 기존 Decap 인수와 전용 폼 인수를 구분하며, 재개 지점은 위 G02-UI 기록을 따른다.
- 실제 OAuth·커밋·배포 검증 전에는 A04/G05/G07/H05를 완료로 표시하지 않는다.
