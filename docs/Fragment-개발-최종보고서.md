# Fragment 개발 최종 보고서

작성일: 2026-09-24 · 대상: `avocadosmasher/avocadosmasher.github.io` · 작업 브랜치 `feat/fragments`

이 문서는 계획의 요약이 아니라 **실제로 무엇이 동작하는지와 그 근거**를 적는다. 계획 자체는 `plan/Fragment-TDD-개발계획.md`, 작업별 경위는 `log/INDEX.md`, 사용법은 `guide/Fragment-운영가이드.md`에 있다.

---

## 1. 결론

Astro 정적 블로그에 **Fragments(용어 카드) 기능**을 추가했다. 방문자는 카드를 검색·필터·팝업·관계 그래프로 탐색하고, 작성자는 **브라우저에서 GitHub 로그인 후 카드를 만들고 고치고 지운 뒤 원하는 시점에 한 번 발행**한다. 별도 서버나 DB 없이 GitHub 저장소와 Actions만 쓴다.

2026-09-24 운영 사이트에서 로그인 → 저장 → 수정 → 삭제 → 발행 → 배포 반영까지 전체 흐름을 사용자가 확인했다(H05). 따라서 이 보고서는 중간 보고서가 아니라 **최종 보고서**다. 다만 3장의 미해결 항목은 남아 있다.

- 공개 주소: <https://avocadosmasher.github.io/fragments/>
- 기간: 2026-09-11(계획) ~ 2026-09-24 · 커밋 48개(기능 브랜치 기준) · 작업 로그 항목 53개
- 자동 테스트 **167개, 2026-09-24 전부 통과**(1장 아래 표는 I02 재실행 결과)

---

## 2. 구현 결과

### 2.1 방문자가 쓰는 것

| 기능 | 실제 동작 | 근거 |
| --- | --- | --- |
| 카드 목록 | 용어·요약·카테고리 표시, 12개씩 페이지네이션, 빈 상태 안내 | C02~C04, D03 |
| 검색 | 용어·별칭·요약·카테고리·태그 5개 필드. 한글 정규화, 완전 일치 우선 | D01, D02 (`src/lib/fragments.ts`) |
| 필터·URL | 카테고리 AND 결합, `q`/`category`/`page`/`card`/`view`를 URL에 저장하고 새로고침·뒤로가기로 복원 | D04, D05 |
| 카드 팝업 | 카드 클릭 또는 직접 링크로 dialog 열기, Escape·포커스 복원, 관련 카드로 이동 | E01~E04 |
| 관계 그래프 | 그래프 전환 시에만 청크 로딩. 중심 카드와 이웃 강조, 확대/초기화, 노드 클릭 시 같은 팝업 | F01~F05 |
| 접근성·반응형 | 390px/1280px, 밝은·어두운 테마, 키보드만으로 검색→카드→팝업→그래프 이동 | H01 |

### 2.2 작성자가 쓰는 것

| 기능 | 실제 동작 | 근거 |
| --- | --- | --- |
| 로그인 | 블로그 화면 안에서 GitHub OAuth 팝업. 토큰은 탭 세션에만, 열 때 쓰기 권한 재확인 | G02-UI, D04 |
| 작성·수정 | 블로그 디자인 안의 전용 폼. 제목이 바뀌어도 ID·파일명 유지 | G01-UI~G03-UI |
| 관계 편집 | 카드 검색 → 유형 선택 → 추가/제거. 자기 참조와 중복 금지(두 카드 사이 관계는 하나) | G04-UI |
| 삭제 | 확인 후 삭제. **다른 카드가 참조하면 차단**하고 참조 카드 제목을 알려 준다 | G08-UI |
| 실패 복구 | 응답 유실 시 같은 파일을 다시 확인해 중복 쓰기 없이 복구. 동시 변경은 덮어쓰지 않고 충돌로 알린다 | G06, `fragment-recovery.ts` |
| 재로그인 | 만료·권한 실패는 실패 안내 안에서 바로 재로그인하고, 입력한 초안 그대로 같은 버튼으로 이어서 마무리 | G05/G06-UI |
| 발행 | 저장은 `fragments-draft`에만. 대기 목록을 펼쳐 보고 항목별로 빼낼 수 있으며, 발행 버튼 한 번이 `main` 병합 한 번 = 배포 한 번 | D01~D05 |
| 배포 추적 | 발행한 커밋의 Actions 실행을 지목해 진행·성공·실패·취소를 화면에 표시. 실패해도 이전 배포가 유지됨을 안내 | D03, D06, D07 |

### 2.3 범위에서 제외한 것 (계획대로 미구현)

AI 관계 추론, 별도 DB, 비공개 카드, 전역 블로그 검색 통합, 이미지 업로드.

---

## 3. 구조

### 3.1 데이터

카드 하나 = `src/content/fragments/<id>.md` 한 파일. 프론트매터는 `src/lib/fragments.ts`의 zod 스키마가 계약이다: 필수 `id`·`title`·`summary`·`category`, 선택 `aliases`·`tags`·`relations`. ID는 제목과 무관하게 고정되고, 관계는 ID로만 저장한다. 없는 대상·자기 참조·모르는 관계 유형은 빌드에서 거부된다.

### 3.2 브랜치 두 개

```
작성자 저장 ──► fragments-draft ──(발행 버튼 = 병합 1회)──► main ──► Actions ──► GitHub Pages
방문자 조회 ◄── main(빌드 산출물)          작성자 조회 ◄── fragments-draft(로그인 시)
```

저장할 때마다 배포가 돌던 문제를 이 구조로 해결했다(D01, 3안 비교는 로그 42).

### 3.3 모듈 지도

| 파일 | 역할 |
| --- | --- |
| `src/lib/fragments.ts` | 스키마, 검색·정렬·페이지 계산, URL 상태, 그래프 데이터 |
| `src/lib/fragment-writer.ts` | GitHub 저장·수정·삭제, 권한 확인, 빌드 변수로 저장 대상 결정(운영은 `production: true` 명시 필요) |
| `src/lib/fragment-publish.ts` | 대기 카드 계산(커밋이 아니라 **카드 파일 변경** 기준), 병합 발행, 대기 항목 되돌리기 |
| `src/lib/fragment-deploy.ts` | 발행 커밋의 워크플로 실행을 찾아 진행/성공/실패/취소 판정 |
| `src/lib/fragment-snapshot.ts` | 같은 리비전의 전체 카드를 blob ID로 한 번에 읽기(부분 로딩 거부) |
| `src/lib/fragment-session.ts` | 탭 세션 토큰 보관·폐기. 저장소·브랜치가 다르면 토큰을 내주지 않음 |
| `src/lib/fragment-recovery.ts` | 실패 원인별 안내와 재로그인 필요 여부 판정 |
| `src/lib/fragment-writer-login.ts` | Worker 핸드셰이크. 자격 정보는 현재 페이지 메모리에만 |
| `src/scripts/fragments.ts` (598줄) | 목록·검색·팝업·그래프·발행 UI의 클라이언트 동작 |
| `src/scripts/fragment-composer.ts`, `fragment-relations.ts` | 작성 폼과 관계 편집기 |
| `workers/fragment-oauth/worker.ts` (153줄) | PKCE S256, HMAC 서명 state, HttpOnly 쿠키, Durable Object 10분 1회용 세션 |

초기 연동 실험에 쓰던 `/admin/`(Decap CMS)은 2026-09-24에 제거했다(K01). 저장 계약(`prepareFragmentSave`)은 `fragments.ts`로, 저장소·브랜치 상수와 테스트 저장 설정 검증은 `fragment-writer.ts`로 옮겼다. Worker의 핸드셰이크 규약은 전용 폼이 그대로 쓰므로 그대로다.

### 3.4 빌드와 배포

`verify.yml`(재사용 워크플로)을 `ci.yml`(PR·개발 브랜치)과 `deploy.yml`(main)이 공유한다. 검사가 실패하면 배포 job은 실행되지 않고, 배포에는 검사를 통과한 그 `dist/`를 그대로 쓴다. 운영 origin을 넘긴 빌드에는 `grep -q '"production":true'` 게이트가 걸려, 저장 설정이 빠진 산출물이 배포되지 못한다.

---

## 4. 변경 규모

기능 시작 지점 `01e7892` 기준: **178개 파일, +15,323 / −2,066줄**.

| 영역 | 내용 |
| --- | --- |
| 기능 코드 | `src/lib/` 10개, `src/scripts/` 3개, `src/components/FragmentComposer.astro`, `src/pages/fragments/index.astro` |
| 인증 | `workers/fragment-oauth/` (worker, wrangler 설정, README) |
| 테스트 | `tests/unit` 14 · `tests/integration` 3 · `tests/e2e` 2 · `tests/oauth` 7 · `tests/draft` 1 · `tests/h01` 1 · `tests/h02` 1 |
| 자동화 | `.github/workflows/` 3개, `.githooks/`, `scripts/` 7개(fixture 생성, preview 검사, 로그 생성, 수동 검증 게이트 등) |
| 문서 | `docs/` 아래 계획·결정·가이드·보관 + 작업 로그 52항목 |

---

## 5. 검증 증거

### 5.1 자동 검사 (2026-09-24 재실행, Windows 11 / Node v24.14.0 / Astro 5.18.2 / Playwright 1.63.0 / Chromium)

| 명령 | 범위 | 결과 |
| --- | --- | --- |
| `npm run check` | astro check 88파일 | 0 errors / 0 warnings / 4 hints |
| `npm test` | 단위 14 + 통합 3파일 | 99 passed |
| `npm run build` | 정적 빌드 | 12 pages 성공 |
| `npm run test:e2e:preview` | 빌드 산출물 preview E2E | 8 passed |
| `npm run test:h01` | 25카드 fixture, 모바일·테마·접근성 | 4 passed |
| `npm run test:h02` | 500카드·1,500간선 성능 | 3 passed |
| `npm run test:oauth` | 로그인·저장·수정·삭제·관계·동기화 | 34 passed |
| `npm run test:draft` | 초안 브랜치·발행·배포 상태 | 15 passed |

합계 167개 통과, 실패 0, 미실행 0. (K01에서 `/admin/`을 제거한 뒤에는 **159개**이며, 전부 CI 게이트 안에서 돈다.) 요구사항별 대응표는 `log/52-I02.md` 2장에 있다.

성능 측정값(H02, 이 PC / Chromium / 로컬): 검색 p95 2.7~2.9ms(목표 200ms), 그래프 조작 가능까지 881~1,077ms(개발 PC 목표 2초). CI 러너는 더 느려 한도를 3초로 두었다(H02-CI).

### 5.2 운영 반영 이력

| PR | 병합 커밋 | 내용 |
| --- | --- | --- |
| #1 | `342997e` | Fragments 탭과 웹 작성·수정 기능의 첫 운영 반영 |
| #2 | `2052c61` | 작성자의 웹 편집이 배포를 막던 결함 수정(H05-FIX) |
| #3 | `ed109ab` | 초안 브랜치 저장과 발행 버튼 |
| #4 | `24cbc41` | 로그인 유지, 발행 대기 목록, 배포 상태 표시 |
| #5 | `366c6b2` | 발행 대기 표시 정정과 배포 상태 실패 노출 |
| #6 | `2c0711d` | 로그인한 작성자의 카드 조회에 토큰 사용, 새로고침 버튼 이동 |

Actions 실행 기록: <https://github.com/avocadosmasher/avocadosmasher.github.io/actions>

### 5.3 사람이 확인한 것

작업마다 자동 검사 후 사용자 수동 판정을 받았고, 승인 없이는 커밋되지 않도록 `.githooks`의 pre-commit·pre-push가 승인 트리를 검사한다(`scripts/manual-review.mjs`). 2026-09-24 운영 사이트에서 전체 흐름을 확인했다(H05, 로그 40).

---

## 6. 제약과 미해결 항목

1. ~~`/admin/` Decap 번들 5.0MB~~ → 2026-09-24 K01에서 제거(배포 산출물 7.4MB → 2.4MB).
2. ~~`npm run test:admin`이 CI 밖~~ → K01에서 함께 정리. 남은 검사는 모두 CI 게이트 안에 있다.
3. **실제 단말·스크린리더 미검증.** 에뮬레이션과 키보드 흐름까지만 자동화했다.
4. **성능은 기기 의존.** 그래프 2초는 개발 PC 목표, CI 한도 3초.
5. **로컬에서 운영 OAuth 로그인 불가**(Worker가 운영 도메인만 허용). 운영 인증 회귀는 배포 사이트에서 사람이 확인한다.
6. **GitHub API 한도**: 익명 조회 IP당 60회/시간(로그인 시 토큰 사용으로 완화), 배포 반영까지 3~4분, 연속 발행 시 이전 실행이 취소될 수 있다.
7. **초안은 공개 저장소의 `fragments-draft`에 있다.** 발행 전 내용도 저장소에서 읽힌다(계획 단계에서 받아들인 제약).

근거와 영향은 `log/52-I02.md` 4장에 있다.

---

## 7. 운영법

일상 작업 흐름, 동작 원리, 시행착오 15건, 설정 위치는 `guide/Fragment-운영가이드.md`에 있다. 요약하면:

1. <https://avocadosmasher.github.io/fragments/>에서 GitHub 로그인
2. 카드 작성·수정·삭제 → 저장은 초안 브랜치로 (배포 안 돎)
3. 대기 목록 확인 → **발행** 한 번 → 배포 상태가 성공으로 바뀌면 3~4분 뒤 공개 반영

비밀값(`GITHUB_CLIENT_SECRET`, `OAUTH_STATE_SECRET`)은 Cloudflare Worker에만 둔다. 저장소·정적 산출물·문서에 넣지 않는다(I02에서 재확인).

---

## 8. 후속 과제

| 우선순위 | 과제 | 이유 |
| --- | --- | --- |
| ~~높음~~ 완료 | `/admin/`(Decap) 경로 제거 | 2026-09-24 K01. 배포 산출물 7.4MB → 2.4MB, CI 밖 검사 소멸 |
| 중간 | 실제 단말·스크린리더 접근성 점검 | 자동화가 덮지 못하는 범위 |
| 중간 | 초안 비공개화 검토 | 공개 저장소 제약을 바꾸려면 저장 위치 자체를 바꿔야 한다 |
| 낮음 | 카드가 수백 개로 늘 때의 조회 방식 | 현재는 전체 스냅샷을 한 번에 읽는다 |
