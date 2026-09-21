# Fragment 개발 기록

## D04 — 로그인 유지 (2026-09-21, 수동 판정 대기)

- 시작 기준: D02 `013554d`을 사용자 통과 후 커밋·push하고, PR #3을 Merge commit `ed109ab`으로 병합했다. 배포(run: deploy.yml)가 성공해 운영 사이트에 초안 저장과 발행 버튼이 반영됐다. 운영 확인: 발행 영역·버튼 존재, 저장 대상 `fragments-draft` 표시. 초안 브랜치는 배포된 `main`에 맞춰 두었다.
- 사용자 피드백 3건: (1) 새로고침하면 발행 대기가 사라진 것처럼 보임, (2) 새로고침하면 로그인이 풀림, (3) 발행 대기 개수만 보이고 목록을 볼 수 없음(접었다 펴는 목록과 항목 제거 요청).
  - (1)은 (2)의 결과다. 초안은 `fragments-draft` 브랜치에 남아 있고, 로그인이 풀리면서 목록이 공개본으로 돌아가 발행 영역이 숨겨진 것이다. 저장 전 입력 폼 내용은 실제로 사라진다.
- 사용자 결정: 로그인은 탭을 닫을 때까지 유지(sessionStorage). 작업 순서는 D04 로그인 유지 → D05 대기 목록·항목 제거 → D03 배포 상태 표시.
- Red: `tests/unit/fragment-session.test.ts` 5개를 먼저 작성해 모듈 부재로 실패를 확인했다. 같은 설정에서만 토큰을 돌려주고, 다른 저장소·브랜치에는 주지 않으며, 로그아웃 시 지우고, 형식이 맞지 않는 값은 무시하고, 저장소를 쓸 수 없어도 동작해야 한다. 테스트 환경에 DOM이 없어 저장소를 주입받는 형태로 설계했다(의존성 추가 없음).
- 구현
  - `src/lib/fragment-session.ts`: 저장소 키는 `fragment-writer:<repo>:<branch>`이고 값은 토큰 형식일 때만 쓰고 읽는다. 모든 접근을 try/catch로 감싸 사생활 보호 모드에서도 로그인 자체는 막히지 않는다.
  - `src/scripts/fragment-composer.ts`: 로그인 성공 시 저장하고, 로그아웃·인증 실패·권한 실패 시 지운다. 페이지가 열리면 저장된 토큰을 `verifyWriter`로 한 번 확인한 뒤에만 로그인 상태로 복원하고 `fragment-session`을 보낸다. 실패하면 조용히 로그아웃 상태로 두고 "이전 로그인이 만료되었습니다."를 표시한다.
  - 작성 창 안내를 "로그인은 이 탭을 닫을 때까지 유지됩니다. 저장하지 않은 입력 내용은 새로고침하면 사라집니다."로 바꿨다.
- 기존 검사 변경: `tests/oauth/writer.spec.ts`는 토큰이 어떤 저장소에도 남지 않는지 검사했다. 이번 결정으로 바뀐 부분이라, localStorage에는 절대 남지 않고 sessionStorage에만 있으며 로그아웃하면 사라지는지로 의도를 유지했다.
- 검증: `tests/draft/publish.spec.ts`에 2개를 추가해 7개가 됐다. 새로고침 후에도 초안 목록·발행 버튼·로그아웃 버튼이 유지되고, 로그아웃하면 다음 방문에서 공개본만 보인다.
- 자동 검사: `npm run check` 오류 0, `npm test` 89개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개, `npm run test:e2e` 8개, `npm run test:h01` 4개, `npm run test:oauth` 34개, `npm run test:admin` 4개, `npm run test:draft` 7개 통과, `git diff --check` 통과. 그래프 변경이 없어 H02는 재실행하지 않았다.
- 남은 위험: 토큰이 탭 세션 동안 브라우저 저장소에 존재한다. 공개 저장소 쓰기 권한(`public_repo`) 범위이며, 로그아웃·탭 종료·인증 실패 시 삭제된다. 공용 PC에서는 로그아웃을 권한다. 운영 가이드(I01)에 적는다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## D02 — 발행 버튼 (2026-09-21, 수동 판정 대기)

- 시작 기준: D01 `ca01bf3`을 사용자 통과 후 커밋·push했다. 원격 `fragments-draft` 브랜치는 push 훅에 막혀 GitHub API로 `main`과 같은 `2052c61`에 만들었다(새 커밋 없음, 훅 비활성화하지 않음).
- Red: `tests/unit/fragment-publish.test.ts` 7개를 먼저 작성해 모듈 부재로 실패함을 확인했다. 대기 건수 계산, 카드 파일만 세기, 병합 요청 형식, 이미 발행된 경우(204), 충돌·권한·인증·네트워크 오류, 발행 브랜치가 없는 설정 거부를 다룬다.
- 구현
  - `src/lib/fragment-publish.ts`: `countPendingDrafts`는 `compare/main...fragments-draft`로 앞선 커밋 수와 카드 파일 수를 읽는다. `publishDrafts`는 `POST /merges`로 초안을 `main`에 합친다. 발행 브랜치가 없거나 초안 브랜치와 같으면 요청 없이 거부한다. 응답 검증은 기존 `requireResponse`를 재사용하므로 오류 문구와 코드가 저장 경로와 같다.
  - `src/pages/fragments/index.astro`·`src/styles/fragments.css`: 목록 위에 발행 영역(안내 문구, 발행 버튼, 결과 링크)을 한 줄로 배치했다. 로그인한 작성자에게만 보인다.
  - `src/scripts/fragments.ts`: 로그인 이벤트로 토큰을 받아 대기 건수를 표시하고, 저장·삭제 후 다시 계산한다. 발행 성공 시 "발행했습니다. 배포가 끝나면 사이트에 반영됩니다."와 커밋 링크를 보여 주고 버튼을 감춘다. 실패하면 사유를 남기고 버튼을 유지한다. 로그아웃하면 영역을 감춘다.
- 검증: `tests/draft/publish.spec.ts`에 3개를 추가해 5개가 됐다. 대기 카드 표시 → 버튼 한 번 → `base: main, head: fragments-draft` 병합 요청 한 건, 충돌(409) 시 버튼 유지와 사유 표시, 발행할 것이 없을 때의 문구를 확인한다.
- 화면 확인: 발행 영역을 1280px와 390px에서 캡처해 한 줄 배치와 줄바꿈을 확인했다(`.fragment-test/bar-desktop.png`, `.fragment-test/bar-mobile.png`).
- 중간 실패 기록: 로그인 직후 Escape가 빨라 작성 창이 열린 채로 남아 버튼 클릭이 막혔다(테스트 순서 수정). 발행 안내에 `fragment-hint` 클래스를 쓰자 H01 대비 검사가 숨겨진 이 요소를 먼저 집어 실패해, 자체 스타일로 분리했다.
- 자동 검사: `npm run check` 오류 0, `npm test` 84개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개, `npm run test:e2e` 8개, `npm run test:h01` 4개, `npm run test:h02` 3개, `npm run test:oauth` 34개, `npm run test:admin` 4개, `npm run test:draft` 5개 통과, `git diff --check` 통과.
- 미확인: 운영 사이트의 실제 발행. D01과 함께 main에 반영해 배포한 뒤 인수한다. 발행 커밋이 배포를 한 번만 돌리는지도 그때 확인한다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## D01 — 초안 브랜치 저장 (2026-09-21, 수동 판정 대기)

- 배경: 사용자가 "저장할 때마다 배포가 도는 대신, 작업을 모았다가 원하는 시점에 한 번 배포"와 "화면에서 배포 중인지 확인"을 요청했다. H05 마무리 인수는 이 기능 뒤로 미룬다.
- 사용자 결정: 초안 브랜치 + 발행 버튼 방식. 저장은 `fragments-draft`에 쌓이고 공개 사이트는 `main` 그대로이며, 발행할 때 한 번만 배포한다. (main 직접 저장 + 수동 배포, 브라우저에 모았다 한 번에 커밋하는 방식은 채택하지 않았다.)
- 작업 분할: D01 초안 브랜치 저장(이번), D02 발행 버튼, D03 배포 상태 표시.
- Red: `tests/unit/fragment-writer.test.ts`에서 운영 설정이 `branch: fragments-draft` + `publish: main`이어야 하고, `branch: main`이나 `publish` 누락·뒤바뀜은 거부해야 한다고 먼저 작성해 실패를 확인했다.
- 구현
  - `src/lib/fragment-writer.ts`: `DRAFT_BRANCH` 상수와 `publish` 필드를 추가했다. 운영 설정은 블로그 저장소의 초안 브랜치에만 쓰기를 허용하고 발행 브랜치는 `main`이어야 한다. 저장·조회·로그인 경로가 모두 이 검증을 다시 통과한다.
  - `src/scripts/fragments.ts`: 목록은 발행 브랜치를 읽는다. 로그인 성공 시 `fragment-session` 이벤트를 받아 초안 브랜치로 다시 읽고 "발행 전 초안까지 불러왔습니다."를 표시한다. 테스트 모드에는 발행 브랜치가 없으므로 기존 문구를 유지한다.
  - `src/scripts/fragment-composer.ts`: 로그인 성공 시 위 이벤트를 보낸다.
- 검증: 운영 모드 전용 설정 `playwright.draft.config.ts`와 `tests/draft/publish.spec.ts`(포트 4404)를 추가했다. 방문자는 `main`만 읽고 초안 카드가 보이지 않으며, 로그인 후 초안 브랜치를 읽어 초안 카드가 나타나고, 새 카드 저장의 커밋 대상이 `fragments-draft`임을 확인한다. `npm run test:draft`로 실행하고 `verify.yml`의 OAuth job에 추가했다.
- `ci.yml`은 `fragments-draft` push를 무시한다. 웹 저장마다 전체 CI를 돌리지 않고 발행 시점 배포 검사로 확인한다.
- 자동 검사: `npm run check` 오류 0, `npm test` 77개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개, `npm run test:e2e` 8개, `npm run test:h01` 4개, `npm run test:oauth` 34개, `npm run test:admin` 4개, `npm run test:draft` 2개 통과, `git diff --check` 통과. 그래프 변경이 없어 H02는 재실행하지 않았다.
- 중간 실패 기록: 테스트 mock의 blob SHA가 16진수가 아니어서 조회가 거부됐고, 새 카드 생성 응답을 201로 돌려주지 않아 저장 확인에 실패했다. 초안 문구를 발행 브랜치 유무와 무관하게 표시해 OAuth 4개가 깨졌던 것도 수정했다.
- 미확인: 원격 `fragments-draft` 브랜치는 아직 만들지 않았다. push 훅(수동 승인 게이트)에 막혀 우회하지 않았고, 승인 후 커밋·push할 때 함께 만든다. 운영 사이트의 실제 초안 저장은 D02(발행 버튼)까지 끝난 뒤 인수한다. **D01만 main에 반영하면 저장이 초안에만 쌓이고 공개할 방법이 없으므로, D02 완료 전에는 main에 병합하지 않는다.**
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## H05-FIX — 작성자의 웹 편집이 배포를 막던 결함 (2026-09-21, 수동 판정 대기)

- 증상: 운영 사이트에서 HPA 카드를 삭제하자 이후 모든 배포가 실패했다. 실패 job은 OAuth E2E이고 오류는 `ENOENT: src/content/fragments/hpa.md`였다. 빌드와 나머지 검사는 통과했다.
- 원인(실제 사용자 결함): 테스트가 운영 카드 파일과 그 내용을 fixture로 쓰고 있었다. 웹 작성 기능은 작성자가 이 카드를 자유롭게 고치고 지우게 하는 기능이므로, 편집할수록 배포가 막히는 구조였다. 발견된 의존은 네 곳이다.
  - `tests/oauth/edit.spec.ts`: 관계 대상 blob 내용을 `gpa.md`·`hpa.md`에서 읽음
  - `tests/oauth/sync.spec.ts`: 빌드 카드 수를 3으로 고정
  - `tests/e2e/fragments.spec.ts`: `extended page tables` 검색 결과 1개, `EPT`·`GPA` 제목, `?card=ept` 전제
  - `tests/e2e/fragment-editor.spec.ts`(`q=EPT` 결과 1개), `tests/e2e/admin-disabled.spec.ts`(`ept` 존재 전제)
- 사용자 결정: 미리보기 E2E는 배포될 산출물을 그대로 검사하되, 카드 이름을 박아 넣지 않고 페이지의 `#fragment-data`에서 제목·별칭·관계를 읽어 검사한다(씨앗 카드 삭제 금지안은 채택하지 않음).
- 수정
  - `tests/e2e/fixtures.ts`에 `cardsOf(page)`를 추가하고, E2E 세 파일이 이 데이터로 검색어·관계·`?card=` 대상을 고른다. 별칭이 있는 카드가 있으면 별칭으로 검색해 D02 별칭 검색 범위를 유지한다. 카드가 없거나 관계가 없으면 해당 검사는 건너뛴다.
  - `tests/oauth/edit.spec.ts`의 관계 대상 두 개를 테스트 안의 고정 문자열로 바꾸고 파일 읽기를 없앴다. `tests/oauth/sync.spec.ts`는 빌드 카드 수를 페이지에서 읽는다.
  - `admin-disabled.spec.ts`는 "테스트용 카드가 운영 산출물에 섞이지 않는다"는 원래 목적만 남기고, 카드가 1개 이상이라는 전제는 뺐다. 카드를 모두 지운 상태도 정상이다.
- 재현·검증: 세 가지 콘텐츠 상태로 미리보기 E2E를 돌렸다. `main`의 현재 카드 3개 8/8 통과, 씨앗 카드가 전혀 없는 카드 1개 8/8 통과, 카드 0개 4개 통과·카드 관련 4개 건너뜀. OAuth 34개도 씨앗 카드가 없는 상태와 있는 상태 모두 통과했다. 수정 전에는 각각 실패함을 먼저 확인했다.
- 자동 검사: `npm run check` 오류 0, `npm test` 77개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개, `npm run test:e2e` 8개, `npm run test:h01` 4개, `npm run test:h02` 3개, `npm run test:oauth` 34개, `npm run test:admin` 4개 통과, `git diff --check` 통과.
- 로컬 브랜치를 `origin/main`으로 fast-forward해, 운영에서 저장된 카드(vLLM 추가, HPA 삭제, EPT·GPA 관계 변경)를 반영한 상태에서 검사했다.
- 미확인: 이 수정이 배포를 풀어 주는지는 main 반영 후 Actions에서 확인한다. 현재 운영 사이트는 `993bc03` 시점이라 HPA가 남아 있고 vLLM이 없다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## H05 — 실제 배포와 전체 사용자 흐름 인수 (2026-09-20, 진행 중 — 결함 발견)

- 시작 기준: P02 `64b74c2`를 사용자 통과 후 커밋·push했고, 그 CI(run 35464647796)가 성공했다. 사용자가 PR 방식과 Merge commit을 선택했다.
- PR #1(`feat/fragments` → `main`, 커밋 29개, 105파일)을 만들었다. PR CI(run 35467037224)의 두 job이 모두 통과했고 상태는 MERGEABLE/CLEAN이었다. 사용자의 명시적 병합 지시 후 Merge commit으로 병합했다: `342997e`.
- 배포 워크플로(run 35467410246): 검사 job 두 개, "Check production writer", deploy가 모두 성공했다. 운영 origin을 넣은 빌드가 E2E를 거쳐 그대로 배포된 첫 실행이다.
- 운영 사이트 확인: `/`, `/fragments/`, `/blog/`, `/about/` HTTP 200. `/fragments/`에 "저장 대상: avocadosmasher/avocadosmasher.github.io / main"과 EPT·GPA·HPA가 들어 있다.
- 사용자 수동 인수에서 실제 로그인·저장·수정·삭제가 모두 동작했고 사용자는 통과로 판정했다. 그러나 이후 커밋을 대조하니 마지막 두 배포가 실패해 결과가 사이트에 반영되지 않았다. 아래 H05-FIX 기록의 결함이며, H05는 아직 완료가 아니다.
- 운영에서 일어난 저장 5건은 모두 `main` 커밋으로 남았다: `993bc03`(hpa 수정), `d5237d0`·`50d83e1`(ept·gpa 관계 저장), `407c58b`(hpa 삭제), `066e440`(vLLM 카드 생성). 첫 커밋의 배포(run 35468864925)는 성공했고, 중간 두 건은 연속 저장으로 대기 중 취소됐다(`concurrency: pages`). 마지막 두 건(run 35468931559, 35468962118)이 실패했다.
- 이전 남은 인수(사용자 수동): 운영 사이트 GitHub 로그인(실제 토큰 교환으로 Client Secret 확인) → 새 카드 저장 → `main` 커밋 → 배포 워크플로 성공 → 검색·팝업·관계 반영 → 기존 카드 수정. 판정 뒤 에이전트가 커밋과 Actions 결과를 대조한다.
- 계획표의 "빌드 실패 시 이전 정상 배포 유지"는 H04 게이트 구조(verify 실패 시 deploy job 미실행)로 보장된다. 실제 실패 배포 재현은 이번 범위에서 하지 않았다.

## P02 — 운영 OAuth·배포 연결 (2026-09-20, 수동 판정 대기)

- 시작 기준: P01 `38bc406`을 사용자 통과 후 커밋·push했고, 그 CI(run 35456596160)가 성공했다.
- 사용자가 운영용 GitHub OAuth App을 만들었다(Homepage `https://avocadosmasher.github.io`, callback `https://fragment-oauth.rdd0426.workers.dev/callback`, Client ID `Ov23liPtP9iKetJ34uCV`). Client Secret은 대화·저장소에 넣지 않는다.
- `workers/fragment-oauth/wrangler.jsonc`에 `env.production`을 추가했다. Worker 이름은 `fragment-oauth`이고, 운영 Client ID, `CMS_ORIGIN=https://avocadosmasher.github.io`, 운영 callback, `public_repo`, 같은 Durable Object binding과 migration을 쓴다. Worker 코드는 바꾸지 않았다. 기본(테스트) 설정 dry-run 결과가 기존 값과 같음을 확인했다.
- 운영 dry-run 성공 후 배포했다: `https://fragment-oauth.rdd0426.workers.dev`, 버전 `c9ce7e2f-ab11-4b5a-8942-d19f7cbc1c00`. `OAUTH_STATE_SECRET`은 Node `crypto.randomBytes(32)`로 만든 값을 화면 출력 없이 `wrangler secret put`에 바로 넘겨 등록했다. Secret 목록에서 이름만 확인했다.
- 배포 직후 Secret 없이 거부하는지 보는 외부 HTTP 확인은 에이전트 권한 검사에서 막혀 실행하지 못했다. Client Secret 등록 뒤 인가 요청 확인과 함께 진행한다.
- 사용자가 Cloudflare 대시보드에서 `GITHUB_CLIENT_SECRET`을 등록했다. 이후 Node 스크립트로 값을 출력하지 않고 검사했다. 루트는 404, 테스트 사이트 `site_id`는 400으로 거부된다. 올바른 `/auth`는 302로 `github.com/login/oauth/authorize`에 가고 운영 Client ID, 운영 callback, `public_repo`, PKCE S256, 서명된 state, `__Host-` HttpOnly·Secure·SameSite=Lax 쿠키, no-store를 모두 만족했다. Client Secret이 맞는지는 실제 토큰 교환(H05 로그인)에서 확인된다.
- 워크플로: `verify.yml`에 `writer_oauth_origin` 입력을 추가했다. Build 단계에만 `FRAGMENT_WRITER_OAUTH_ORIGIN`으로 넘기고, 값이 있으면 `dist/fragments/index.html`에 `production:true` 설정이 없을 때 실패하는 검사 단계를 둔다. `deploy.yml`만 운영 Worker origin을 넘기고, PR·개발 브랜치 CI(`ci.yml`)는 기존처럼 저장이 꺼진 빌드를 검사한다. H01·H02는 자체 fixture 서버를 쓰므로 영향이 없다. 검사 단계는 로컬에서 운영 빌드에서 통과하고 기본 빌드에서 실패함을 확인했다.
- 사용자 결정: 배포할 산출물을 그대로 E2E로 검사하되 E2E에서 GitHub 조회를 차단한다(검사용·배포용 빌드 분리안은 채택하지 않음).
  - Red: 운영 변수 빌드에 `npm run test:e2e:preview`를 돌리자 4개가 실패했다. 운영 모드 페이지가 실제 블로그 저장소 `main`에서 최신 카드를 읽는데, `main`에는 Fragments 카드가 아직 0개라 목록이 비었다.
  - 수정: `tests/e2e/fixtures.ts`에서 `api.github.com` 요청을 막아 빌드에 든 카드로 검사하게 했다. E2E 세 파일은 이 fixture를 import한다. 실제로 막히는 호스트는 `api.github.com`뿐임을 코드에서 확인했다.
  - 처음에는 모든 실행에 차단을 걸었더니 개발 서버 E2E의 검색 테스트(C01–D05)가 약 3번 중 1번 실패했다(기대 카드 1개, 실제 3개). 변경 전 상태로 6번 돌리면 0번 실패했다. 요청 가로채기가 개발 서버의 많은 모듈 요청을 느리게 해서, 스크립트가 붙기 전에 검색어를 입력하는 잠재 경쟁이 드러난 것이다. 차단은 운영 산출물을 검사하는 `TEST_PREVIEW=1` 실행에만 적용했다. 스크립트 준비 전 입력이 무시되는 잠재 경쟁 자체는 후속 후보로 남긴다.
  - 반복 확인: 개발 서버 E2E 6/6, 운영 모드 미리보기 6/6, 기본 미리보기 3/3 통과.
- 자동 검사: `npm run check` 오류 0, `npm test` 77개, `npm run build` 12페이지, `npm run test:h01` 4개, `npm run test:oauth` 34개, `npm run test:admin` 4개 통과, `git diff --check` 통과. H02는 그래프 변경이 없어 재실행하지 않았다.
- 미확인: 운영 사이트의 실제 로그인·저장. Worker는 `https://avocadosmasher.github.io`에만 로그인 결과를 보내므로 로컬에서는 확인할 수 없고, `feat/fragments`를 main에 반영해 배포한 뒤 H05에서 확인한다. 수정된 워크플로의 Actions 실행 결과는 push 후 확인한다(배포 경로는 main 반영 때 처음 실행된다).
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## P01 — 운영 저장 설정 코드 (2026-09-20, 수동 판정 대기)

- 시작 기준: H03 `721f45a`를 사용자 통과 후 커밋·push했고, 그 CI(run 35455830617)가 성공했다. H03 수동 확인 중 사용자가 로그인·수정이 가이드에서 빠진 점을 지적했다. 운영 빌드에는 쓰기 설정이 없어 작성 창이 미리보기로만 동작하고, 저장 설정 검사가 운영 저장소와 `main`을 일부러 거부한다는 사실이 확인됐다. 이 빈틈을 P01(코드)과 P02(외부 연결)로 계획표에 추가했다.
- 사용자 결정: 운영 OAuth는 테스트와 분리한다(운영용 Worker와 GitHub OAuth App을 따로 둔다). Worker 코드는 origin 하나만 허용하는 현재 구조를 유지한다.
- Red: `tests/unit/fragment-writer.test.ts`에 운영 설정 테스트를 추가하고, 기능이 없어 실패함을 확인했다. 운영 설정은 블로그 저장소의 `main`만 허용하고(대소문자 다른 이름, 다른 브랜치도 거부), HTTPS origin만 받으며, 이미 검증한 설정을 다시 검증해도 결과가 같아야 한다. 테스트 설정에는 `production`이 붙지 않아야 한다.
- 구현: `src/lib/fragment-writer.ts`의 `createWriterConfig`는 `production: true`가 명시된 경우에만 운영 규칙으로 검증한다. 저장·조회·로그인 경로가 모두 이 함수로 설정을 다시 검증하므로 플래그를 설정 객체에 담았다. 작성 창의 설정 분기는 `writerConfigFromEnv`로 옮겨 단위 테스트로 검증한다. `FRAGMENT_WRITER_OAUTH_ORIGIN`이 있을 때만 운영 저장을 켜고, 테스트·로컬 모드와 함께 설정되면 저장을 끈다. 작성 창에는 운영일 때 "저장 대상", 테스트일 때 "테스트 저장 대상"이라고 표시한다.
- 빌드 확인: 기본 빌드에는 `data-writer`와 로그인 버튼이 없고 미리보기 안내가 나온다. 운영 변수 빌드에는 `production:true` 설정, "저장 대상: avocadosmasher/avocadosmasher.github.io / main", 로그인 버튼이 있다. 운영·테스트 변수를 동시에 주면 저장이 꺼지고 설정 확인 안내가 나온다.
- 자동 검사: `npm test` 14파일/77개, `npm run check` 오류 0·경고 0, `npm run test:integration` 5개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개, `npm run test:e2e` 8개, `npm run test:h01` 4개, `npm run test:oauth` 34개, `npm run test:admin` 4개 통과, `git diff --check` 통과. 그래프 변경이 없어 H02는 재실행하지 않았다.
- 미확인: 운영 Worker가 아직 없으므로 운영 빌드의 실제 로그인·저장은 P02 이후에 확인한다. 배포 워크플로는 아직 운영 변수를 전달하지 않으므로, 지금 main에 배포해도 운영 사이트는 계속 미리보기로 동작한다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## H03 — 통합 회귀와 정적 빌드 검증 (2026-09-20, 수동 판정 대기)

- 시작 기준: G07 준비 기록 `9727cd2`를 사용자 통과 후 커밋·push했다. G07 인수 증거는 승인 뒤 파일을 바꾸지 않기 위해 이 기록에 남긴다.
- G07 증거(`cms-test`): `07fd669`가 `fragment-8cb4664f-7fff-4728-aabd-a10276ed8905.md`(제목 "G07 인수", `relations: []`)를 새로 만들었다. `7973401`은 같은 파일·같은 `id`에 관계 한 줄(선행 → `fragment-1d73fbd8…` "로그인, 로그아웃 테스트")만 추가했다. 새 파일은 생기지 않았다. 안내한 순서(생성 때 관계, 수정 때 설명 변경)와 달리 관계는 수정 때 추가됐고 제목·설명은 바뀌지 않았다. 두 커밋은 작성자가 같아 세션 구분은 커밋으로 확인할 수 없으며, 사용자 판정을 근거로 한다. 사용자 판정: 통과.
- H03 자동 검사(이 PC, 순서대로 실행): `npm run check` 오류 0, `npm test` 14파일/75개, `npm run test:integration` 3파일/5개(workerd), `npm run build` 12페이지, `npm run test:e2e:preview` 8개, `npm run test:e2e` 8개, `npm run test:h01` 4개, `npm run test:h02` 3개와 `CI=1` 3개, `npm run test:oauth` 34개, `npm run test:admin` 4개 모두 통과.
- 첫 H02 실행은 이전 세션이 남긴 4403 포트 개발 서버(2026-09-19 23:14 시작) 때문에 서버 시작 단계에서 실패했다. 해당 프로세스를 종료한 뒤 재실행해 통과했다. 테스트 자체의 실패는 아니다.
- 기존 check 오류와 신규 오류의 구분: 현재 오류 0·경고 0으로, 배포를 막는 오류는 없다.
- 미확인: 실제 Actions 러너 결과는 push 후 확인한다. 사람 눈으로 본 preview 화면의 기존 블로그 회귀는 이번 수동 판정 대상이다.
- 문서만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## G07 — 실제 기기 간 저장 인수 준비 (2026-09-20, 수동 판정 대기)

- 시작 기준: `7d6b8e8`을 사용자 통과 후 커밋·push했고, 그 CI(run 35448510121)가 성공했다. 앞선 두 번의 실패(H02 그래프 한도, H01 로딩 중 포커스)가 모두 해소됐다. 사용자가 다음 작업으로 G07을 선택했다.
- `node scripts/build-writer-test.mjs --remote`로 테스트 저장소 `cms-test`의 `78f8591`(카드 5개)을 읽기 전용 스냅샷으로 받아 12페이지 테스트 빌드에 성공했다. 기존 Cloudflare 테스트 프로젝트를 갱신했다(`https://57586b34.fragment-cms-test.pages.dev`). 고정 주소 `https://fragment-cms-test.pages.dev/fragments/`가 HTTP 200임을 확인했다.
- 인수 기준: 브라우저 세션 A에서 관계가 있는 새 카드 생성 → 실제 커밋 확인 → 로그인 상태를 공유하지 않는 세션 B에서 같은 카드 수정 → 새 커밋 확인 → 파일명·`id`·관계 유지, 세션 A에서 수정 내용 재확인. 판정 뒤 커밋 증거는 에이전트가 `gh api`로 대조한다.
- 코드 변경이 없어 자동 테스트는 재실행하지 않았다(직전 CI 전체 통과). 원격 테스트 저장소에는 에이전트가 쓰지 않았다.
- 문서만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## 그래프 계산 중 키보드 포커스 강조 누락 수정 (2026-09-19, 수동 판정 대기)

- 시작 기준: H02-CI `c66ff00`을 사용자 통과 후 커밋·push했다. 그 CI(run 35447852336)에서 이번에는 H01 키보드 테스트가 실패했다: 노드 버튼에 포커스했는데 `#graph-selection`에 "직접 연결"이 나오지 않았다. 이전 CI에서는 통과했으므로 타이밍 차이다. H02 단계는 앞 단계 실패로 실행되지 않았다.
- 원인(실제 사용자 결함): 그래프 노드 목록 버튼은 그래프 계산 전에 동기적으로 만들어진다. 계산이 끝나기 전에 포커스하면 `highlightNode`가 `cy` 없음으로 바로 끝나고, 준비된 뒤 다시 적용하는 경로가 없었다. 키보드·스크린리더 사용자는 로딩 중에 이동하면 강조와 안내를 받지 못한다. 빠른 circle 배치 시절에는 드러나지 않다가 fcose + 느린 러너에서 드러났다.
- Red: `tests/h02/performance.spec.ts`에 500개 fixture에서 클릭과 포커스를 브라우저 안에서 연달아 실행하는 테스트를 추가했다(포커스 시점 상태가 "관계를 불러오는 중…"임을 확인). CI와 같은 증상으로 실패함을 확인했다. 처음 쓴 `not.toHaveText` 방식은 그래프가 먼저 끝나 재현이 흔들려 이 방식으로 바꿨다.
- 수정: `src/scripts/fragments.ts`에서 노드 버튼에 `data-node`를 달고, 그래프 준비 직후 포커스가 노드 목록 안에 있으면 그 노드를 강조한다.
- 검증: `npm test` 75개, `npx astro check` 오류 0, `npm run test:h01` 3회 연속 4개 통과, `CI=1` H02 3개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개, `npm run test:oauth` 34개 통과, `git diff --check` 통과.
- 미확인: 실제 Actions 러너 결과는 push 후 확인한다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## H02-CI — Actions 러너의 그래프 성능 기준 대응 (2026-09-19, 수동 판정 대기)

- 시작 기준: H02 `827690d`와 capture-compare 스킬 `37e1e10`을 사용자 통과 판정 후 커밋·push했다. 스킬은 도구 설정이라 별도 커밋으로 나눴고, 승인 뒤 파일을 바꾸지 않기 위해 이 기록은 이번 작업에 넣는다. 스킬 본문은 `.agents/skills/capture-compare/`(Codex가 읽는 경로), Claude Code용 `.claude/skills/capture-compare/SKILL.md`는 본문을 가리키기만 한다. `codex exec`의 스킬 목록과 Claude Code 세션 목록 모두에서 인식을 확인했고, 사용자 요청(버튼 트렌드 6가지 비교)으로 실제 사용해 통과 판정을 받았다.
- push 후 CI(run 35446731426)에서 H02 그래프 테스트만 실패했다: 2,239ms > 2,000ms. 로컬 881~1,077ms 대비 러너가 약 2배 느리다. 나머지(타입, 단위 75, 빌드, preview E2E, H01, OAuth)는 통과했다. H02 커밋의 CI는 바로 다음 push로 자동 취소됐다.
- 사용자 결정: A(원인 측정 후 개선) → 안 되면 B(CI 기준 완화) → 그것도 안 되면 그래프를 베타 기능으로 제외.
- A 측정: CDP CPU 스로틀링 2~2.5배로 CI 수치를 재현하고 CPU 프로파일로 구간을 나눴다. fcose 약 57%, 간격 보정(`separateNodes`) 약 17%, cytoscape 초기화·그리기 약 15%, 모듈 import는 무시할 수준(dev 서버 변환은 원인이 아님).
  - `separateNodes`: 격자 키를 문자열에서 숫자로 바꾸고 먼 쌍을 제곱 거리로 먼저 거른다. 고정 시드 4개 입력에서 좌표 결과가 기존과 완전히 같음을 비교했고 벤치마크 337ms → 145ms. 화면 변화 없음.
  - fcose `numIter`는 효과가 없었다. cose-base가 반복 횟수를 `max(노드 수×5, numIter)`로 정해 500개에서는 2,500회로 고정된다. 시간 대부분은 반발력(`calcRepulsionForce`)과 노드 사각형 교차 계산이다.
  - `quality: 'draft'`는 2배 스로틀링에서 약 1.1초였지만, capture-compare로 비교하니 전체 보기에서 카테고리 영역 구분이 사라지고 허브가 가장자리에 몰려 이름이 겹쳤다(2단계 보기도 악화). 설계 결정 1번의 핵심을 잃으므로 채택하지 않았다.
  - 결론: 배치를 해치지 않고 2초를 맞출 방법은 찾지 못해 B로 진행했다.
- B: `tests/h02/performance.spec.ts`에서 그래프 한도를 `process.env.CI ? 3000 : 2000`으로 둔다. 제안 목표 2초는 개발 PC에서 확인하고, CI 한도는 회귀 감지용이다(예상 CI 값 약 2.1초 대비 약 40% 여유).
- 검증: `npm test` 75개, `npx astro check` 오류 0·경고 0, `npm run test:h01` 4개, `npm run test:h02` 2개, `CI=1`로 H02 2개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개, `npm run test:oauth` 34개 통과, `git diff --check` 통과.
- 미확인: 실제 Actions 러너에서의 새 한도 통과는 push 후 확인한다. 느린 기기에서 전체 500개 보기를 처음 열 때 메인 스레드가 약 2초 멈추는 사용자 체감 문제는 그대로다. 후속 후보로 빌드 시 전체 보기 좌표를 미리 계산해 두는 방식(실시간 반영된 카드가 있으면 다시 계산)을 기록해 둔다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## H02 — 현실적인 규모의 성능 확인 (2026-09-17, 수동 판정 대기)

- 시작 기준: HEAD `c210cdf`(H01 자동 검사 완료, 사용자가 이번 턴 작업으로 H02를 선택), `feat/fragments`, 작업 트리 깨끗함.
- `scripts/fragment-fixture.mjs`의 `fixtureCards`/`writeFixture`에 선택적 `edgeTarget` 인자를 추가했다. 인자를 생략하면 기존 체인(카드 수−1개, 카드 0은 고립)과 완전히 동일한 결과를 내도록 회귀 확인했다. 인자를 주면 기존 체인 위에 무작위 간선을 더해 목표 개수까지 채우며, "두 카드 사이 관계는 방향·유형과 무관하게 하나만" 규칙을 fixture 생성 단계에서도 지켜 중복 쌍을 만들지 않는다(카드 0은 계속 무작위 간선의 대상에서 제외해 고립 노드를 유지). CLI에 `--edges` 플래그를 추가했다.
- `playwright.h02.config.ts`(포트 4403)와 `tests/h02/performance.spec.ts` 2개를 추가하고 `npm run test:h02`로 연결했다. 500개 카드·1,500개 간선 fixture로 서버를 띄운다.
  - 검색: 검색창 `input` 이벤트는 `render()`를 동기 실행하므로, 브라우저 안에서 값 대입→`dispatchEvent` 전후 `performance.now()` 차이를 재 검색·필터 20종(정확 일치, 부분 일치, 태그, 카테고리, 0건, 초기화 포함)에 대해 측정하고 p95를 계산한다. 목표 200ms 이내.
  - 그래프: `관계 그래프` 버튼 클릭부터 canvas가 보이고 `#graph-status`에 `500개 개념 · 1500개 관계`가 표시되기까지 걸린 시간을 측정한다(목표 2초 이내). 이어서 그래프 노드 버튼 클릭 → 카드 팝업까지 실제 조작 가능성도 확인한다.
- 측정값(이 PC, Chromium, Playwright 로컬 실행, 네트워크 지연 없는 localhost, 별도 스로틀링 없음): 검색 20회 측정값 0.3ms~2.9ms, p95 2.9ms(목표 200ms 대비 큰 여유). 그래프 렌더+관계 표시 303ms(목표 2,000ms 대비 큰 여유). 재실행 시 그래프 값은 수백 ms 범위에서 변동할 수 있으나 목표 대비 여유가 커 CI 게이트에 포함해도 안전하다고 판단했다.
- `.github/workflows/verify.yml`의 `checks` job에 `npm run test:h02` 단계를 H01 다음에 추가해 PR·배포 경로에서도 함께 돈다.
- 수동 확인 중 사용자가 대규모 그래프의 원형 배치를 지적해 레이아웃을 바꿨다. 노드 80개 초과 분기(`5cbe8fb`부터 있던 기존 동작)는 `cose`가 느려서 `circle`을 쓰고 있었는데, 한 줄짜리 원은 정보량이 없다는 지적이다. `concentric`으로 교체하고 연결 수(`node.degree(false)`)를 고리 기준으로 삼아 허브 개념이 가운데로 오게 했다. `levelWidth: () => 1`로 같은 연결 수만 한 고리에 모아 고리가 여러 겹 생기므로, 노드 500개가 한 줄에 몰리던 기존보다 조밀함도 덜하다. 80개 임계값과 나머지 두 분기(`grid`·`cose`)는 그대로다. 실제 콘텐츠(현재 카드 6개)는 계속 `cose`를 쓰므로 공개 화면 배치는 바뀌지 않는다.
- 레이아웃 교체 후 재측정: 검색 p95 2.7ms, 그래프 렌더 349ms(원형 303ms 대비 +46ms). 목표 2,000ms 대비 여유는 그대로다. 운영 코드(`src/scripts/fragments.ts`)를 건드렸으므로 회귀 범위를 넓혀 H01·preview E2E·OAuth까지 다시 실행했다.
- 검증: `npm run test:h02` 2개 통과, `npm run test:h01` 4개 통과(fixture 리팩터 회귀 없음 확인), `npx astro check` 오류 0·경고 0·기존 hint 4개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개 통과, `npm run test:oauth` 34개 통과, `git diff --check` 통과(줄바꿈 경고만 있음). `npm test`는 12파일/64개 통과이고 `tests/integration/oauth-runtime.test.ts` 3개는 기존과 같은 workerd 바이너리 차단(`spawn UNKNOWN`)으로 이 PC에서 실행하지 못했다.
- 미확인: 실제 GitHub Actions(ubuntu-latest) 러너에서의 실행 시간, 실제 저사양 기기·모바일 브라우저·네트워크 스로틀링 조건, 500개보다 큰 규모(수천 카드) 확장성. 성능 수치는 이 개발 PC 1회 측정 기준이며 반복 측정으로 분산을 확인하지 않았다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

### H02 후속 — 그래프 배치·가독성·탐색 UI 변경 (2026-09-18~19, 수동 판정 대기)

- 위 concentric 버전 수동 확인 중 배치·가독성 지적이 이어져 범위가 넓어졌다. 선택지·근거·실측 비교는 `Fragment-설계-결정기록.md`에 따로 남겼고, 여기에는 변경 파일과 검증만 적는다. 위 concentric 기록(349ms)은 최종 상태가 아니다.
- 배치: `cytoscape-fcose`(+`@types/cytoscape-fcose`)를 추가하고 80개 분기를 없애 규모와 무관하게 fcose + 허브 분산 설정을 쓴다(`src/scripts/fragments.ts`). cose는 500개에서 3,607ms 동안 화면이 멈춰 제외했다.
- 가독성: `src/lib/fragments.ts`에 `graphNodeDiameter`(연결 수 제곱근 비례 10~32px), `graphNodeSpacing`(88px), `separateNodes`(격자 기반 최소 간격 보정)를 추가하고 `tests/unit/graph-layout.test.ts` 5개로 검증한다. 라벨은 확대 단계별, 관계 이름은 강조한 노드의 선에만 표시한다.
- 탐색: 중심 개념을 선택 상자에서 직접 만든 콤보박스로 바꿨다(`focusOptions`/`filterFocusOptions`/`resolveFocus`, 키보드 ↑↓·Enter·Esc, ARIA combobox). 중심 개념을 고르면 이웃 범위 1·2단계를 고를 수 있다(`graphData`의 `depth`). 그래프 높이는 화면의 70%(480~820px).
- 조작 요소 통일(`src/styles/fragments.css`, `index.astro`): 높이 46px·모서리 9px·글자 15px, 꺾쇠 화살표, 입력이 있을 때만 보이는 × 지우기 버튼(검색창·중심 개념).
- fixture: 무작위 간선을 고정 시드의 선호적 연결(같은 카테고리 85%)로 바꿔 허브가 생기게 했고, 카테고리를 블로그 카테고리(AI/Frontend/Backend/DevOps)로 바꿨다. `edgeTarget` 생략 시 기존 체인과 동일한 동작은 유지한다. 이에 맞춰 H01·H02 검색어·필터 값, OAuth 그래프·삭제 테스트(콤보박스 조작), E2E(검색어 지우기), 단위 검색 테스트를 갱신했다.
- 재측정(2026-09-19, 이 PC, Chromium, localhost, 스로틀링 없음, `--repeat-each 3`): 검색 p95 2.9 / 2.9 / 2.7ms, 그래프 렌더+관계 표시 1,077 / 881 / 1,028ms. 목표(200ms / 2,000ms) 안이지만 그래프 여유가 circle(303ms) 대비 크게 줄었다. CI 러너가 느리면 2초 게이트에 근접할 수 있어 첫 Actions 실행 시간을 확인해야 한다.
- 검증: `npm test` 14파일/75개 통과(이번에는 `oauth-runtime` workerd 통합 테스트 3개도 실행·통과), `npx astro check` 오류 0·경고 0·hint 4, `npm run build` 12페이지, `npm run test:h01` 4개, `npm run test:h02` 2개(3회 반복 6개), `npm run test:e2e:preview` 8개, `npm run test:oauth` 34개 통과, `git diff --check` 통과(줄바꿈 경고만).
- 관계 유형별 선·화살촉 구분(2026-09-19): 1~9번 수동 확인 뒤 사용자가 관계별 화살표 모양 차이를 요청했다. 현재·A(화살촉만)·B(화살촉+선 모양)·C(B+색) 캡처를 같은 배치에서 비교했고 사용자가 B를 골랐다. `graphData` 간선에 `type`을 싣고(단위 테스트 추가, Red 확인 후 구현), `src/scripts/fragments.ts`에서 관련=실선·화살촉 없음, 선행=▶, 상위=빈 ◇ + 긴 점선, 비교=양끝 ⊣⊢ + 점선으로 표시한다. 선 굵기 1→1.3, 화살촉 배율 0.7→1.6, 강조 시 양끝 화살촉 색도 강조색으로 바꾼다. 시안 캡처는 잘못된 속성명(`arrow-fill`) 때문에 마름모가 채워져 보였고, 실제 반영은 `target-arrow-fill: hollow`로 설명대로 빈 마름모다. 밝은·어두운 테마에서 유형별 선·화살촉 계산값과 화면을 확인했다.
- 화살표 반영 후 재검증: `npm test` 75개, `npx astro check` 오류 0, `npm run test:h01` 4개, `npm run test:h02` 2개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개, `npm run test:oauth` 34개 통과, `git diff --check` 통과.
- 미확인: Actions 러너 실행 시간, 저사양·모바일 기기 성능, 실제 스크린리더의 콤보박스 낭독, 500개 초과 규모. 설계 결정기록의 남은 한계(전체 보기 원반형, 허브 이름끼리 닿음, 테스트 서버의 `.astro/` 캐시 간섭)는 그대로다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## H01 — 모바일·테마·접근성 인수 (2026-09-17, 수동 판정 대기)

- 시작 기준: HEAD `cdfc428`(H04 테스트 게이트 push 완료, 첫 CI 실행 두 job 모두 success), `feat/fragments`, 작업 트리 깨끗함.
- 기존 검사에는 390px 다크 모드 확인 1개만 있었고, 1280px·밝은 테마·페이지네이션·키보드 순환·대비는 검증되지 않았다. 로컬 카드가 3개뿐이라 페이지네이션이 아예 나타나지 않는 것이 원인 중 하나였다.
- `scripts/fragment-fixture.mjs`를 추가했다. 25개 검증용 카드(한글 조합형, 영문 별칭, 긴 설명, `<script>`처럼 보이는 문자열, 관계 없는 고립 카드 포함)를 `.fragment-test/h01-content`에 만들고 `--serve`로 `FRAGMENT_CONTENT_DIR`를 지정한 개발 서버를 띄운다. 운영 콘텐츠는 읽지도 쓰지도 않으며 산출물은 Git 제외 대상이다. H02의 대량 fixture에도 재사용할 수 있게 개수를 인자로 받는다.
- `playwright.h01.config.ts`(포트 4402)와 `tests/h01/responsive.spec.ts` 4개를 추가하고 `npm run test:h01`로 연결했다. 검사 항목: 390px 밝은 테마의 검색·페이지 이동·팝업·그래프와 가로 넘침(문서 폭 + 뷰포트보다 넓은 요소 탐지), 1280px 어두운 테마 유지와 본문 대비, 키보드만으로 카드→팝업→그래프 이동, 페이지 경계와 카테고리 필터 결합.
- Red에서 실제 결함 1건을 찾았다. 밝은 테마 보조 텍스트 `--muted:#76767F`는 `--paper` 위에서 대비 4.28:1로 WCAG AA(4.5:1) 미만이었다. 카드 개수·힌트·태그·페이지 안내가 모두 이 색이다. `#70707A`로 조정해 배경 대비 4.68:1, 흰 카드 위 4.90:1이 되었다. 어두운 테마 `--muted`는 5.27:1 이상으로 이미 충족해 그대로 두었다.
- 나머지 2건은 검사 쪽 문제였다. 포커스 순환은 Chromium이 모달 한 바퀴 끝에서 문서 자체에 머무는 동작이라 배경 조작 요소로 나가는 경우만 실패로 보도록 고쳤다(배경 요소로 나가는 일은 없음을 확인). 카테고리 선택자는 작성 폼의 같은 라벨과 충돌해 `#fragment-category`로 좁혔다. 테마 전환 0.35s 배경 전환 때문에 대비 값은 `expect.poll`로 안정될 때까지 읽는다.
- `.github/workflows/verify.yml`의 `checks` job에 `npm run test:h01` 단계를 추가해 PR·배포 경로에서도 함께 돈다.
- 검증: `npm run test:h01` 4개 통과, `npm run test:e2e:preview` 8개 통과, `npm run test:oauth` 34개 통과, `npx astro check` 오류 0·경고 0·기존 hint 4개, `npm run build` 12페이지, `git diff --check` 통과. `npm test`는 12파일/64개 통과이고 `tests/integration/oauth-runtime.test.ts` 3개는 이전과 같은 workerd 바이너리 차단(`spawn UNKNOWN`)으로 이 PC에서 실행하지 못했다 — 같은 테스트는 직전 CI 실행에서 통과했다.
- 미확인: 실제 단말(iOS/Android 브라우저)과 보조기술(스크린리더) 사용, 애니메이션 감소 설정, 색각 이상 조건은 자동 검사로 다루지 않았다. 대비 검사는 지정한 본문 텍스트 선택자에 한정한다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## H04 — GitHub Actions 테스트 게이트 (2026-09-17, 수동 판정 대기)

- 시작 기준: HEAD `cdfa28a`, `feat/fragments`, 작업 트리 깨끗함. 사용자가 이번 턴 작업으로 H04를 선택했다. G07-UI(실제 계정 토큰 만료·다른 세션 저장 인수)는 사용자 조작이 필요해 이번 범위에서 제외했다.
- 기존 `deploy.yml`은 `withastro/action@v3`로 바로 빌드·배포해 테스트를 전혀 거치지 않았고, PR·개발 브랜치에는 워크플로가 없었다.
- `.github/workflows/verify.yml`(재사용 워크플로)을 추가했다. `checks` job은 `npm ci` → `npm run check` → `npm test`(단위+통합) → `npm run build` → Chromium 설치 → `npm run test:e2e:preview` 순으로 실행하고, 실패 시 `playwright-report/`를 아티팩트로 남긴다. `writer` job은 mock 환경변수로 도는 `npm run test:oauth`를 실행한다. 두 job은 병렬이며 하나라도 실패하면 호출한 워크플로가 실패한다.
- `deploy.yml`은 `verify`를 `upload_pages: true`로 호출하고 `deploy` job에 `needs: verify`를 걸었다. 검사에 실패하면 배포 job은 실행되지 않으며, 배포는 검사를 통과한 그 `dist/`를 `upload-pages-artifact@v3`로 올린 산출물을 사용한다. 권한·concurrency 설정은 기존 값을 유지했다.
- `.github/workflows/ci.yml`은 PR과 main 이외 브랜치 push에서 같은 `verify`를 실행한다. main push는 `deploy.yml`이 같은 검사를 돌리므로 `branches-ignore: [main]`으로 중복을 막았다. ref별 `concurrency`로 이전 실행을 취소한다.
- 로컬 검증(게이트와 같은 명령): `npm run check` 오류 0·경고 0·기존 hint 4개, `npm run build` 12페이지, `npm run test:e2e:preview` 8개 통과(계획서에 남아 있던 preview 실행을 이번에 처음 수행), `npm run test:oauth` 34개 통과, `git diff --check` 통과. 세 워크플로 YAML은 파서로 job·트리거 구조를 확인했다.
- `npm test`는 12파일/64개 통과, `tests/integration/oauth-runtime.test.ts` 3개는 이전과 같은 `spawn UNKNOWN`(workerd 바이너리 차단 환경)으로 실패했다. 이는 Windows 로컬 제약이며 Linux runner에서는 실행될 것으로 보되, CI에서 실제로 통과하는지는 아직 미확인이다.
- 미확인: 워크플로가 GitHub에서 실제로 실행된 결과(검사 통과/실패 시 배포 차단, Pages 아티팩트 경로)는 push 이후에만 확인 가능하다. 이번 판정은 파일 내용 검토 기준이며, 첫 Actions 실행 결과는 별도 인수 대상으로 남긴다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## G05/G06-UI — 실패 안내에서 재로그인과 초안 복구 (2026-09-17, 수동 판정 대기)

- 시작 기준: HEAD `90617a1`(관계 편집·삭제 가드는 사용자 통과 후 push 완료), `feat/fragments`. 작업 폴더에는 이전 Graft 설정 변경만 남아 있었고 이번에도 스테이징에서 제외한다.
- 범위: 저장·삭제 중 로그인 만료(`auth`)·권한 확인 실패(`permission`)로 토큰이 사라졌을 때, 실패 안내 영역 안에서 바로 다시 로그인하고 입력한 초안 그대로 같은 작업을 이어가게 한다. 실패 안내가 다음에 누를 버튼 이름을 함께 알려준다.
- `src/lib/fragment-recovery.ts`를 추가해 오류 → 화면 안내 결정을 순수 함수로 분리했다. `recoveryPlan(error, {action, retryLabel})`은 제목·문구·재로그인 필요 여부를 돌려주고, 삭제의 `network`·비 WriterError는 기존 재시도 문구를 유지한다. `reloginMessage`는 재로그인 후 눌러야 할 버튼 이름을 안내한다.
- 작성 폼에는 안내 영역 안의 `다시 로그인` 버튼(`#composer-error-login`)을 추가했다. 로그인 동작을 `authenticate(resume?)`로 공통화해, 재로그인 성공 시 안내를 `다시 로그인했습니다…`로 바꾸고 로그인 버튼을 숨기며 포커스를 저장 또는 삭제 버튼으로 옮긴다. 재로그인 실패·취소는 사유를 그대로 보여주고 버튼을 남긴다. 이미 원문을 읽은 수정 세션은 재로그인이 초안을 덮어쓰지 않는다(`fetchExisting`의 기존 조기 반환).
- Red: `npx vitest run tests/unit/fragment-recovery.test.ts`가 모듈 부재로 수집 실패(exit 1). 브라우저 `tests/oauth/relogin.spec.ts` 2개는 `#composer-error-login` 부재로 타임아웃 실패. Green: 단위 5개, 브라우저 2개 통과.
- Refactor: 기존 `showFailure(title, message)` 호출부(저장·삭제)를 `showFailure(error, context)`로 정리하고 문구 상수를 새 모듈로 옮겼다. 저장 버튼 라벨은 `saveLabel()` 하나로 계산해 안내 문구와 실제 버튼 이름이 어긋나지 않게 했다.
- 검증: Vitest 12파일/64개 통과(workerd 통합 제외), OAuth Playwright 34개 통과, 일반 Playwright 8개 통과, `npx astro check` 오류 0·경고 0·기존 hint 4개, `npm run build` 12페이지, `node scripts/build-writer-test.mjs --remote` 12페이지(원격 스냅샷 읽기 성공), `git diff --check` 통과.
- 환경 제약: `tests/integration/oauth-runtime.test.ts` 3개는 `spawn UNKNOWN`으로 실행하지 못했다. 원인은 `node_modules/workerd` 바이너리 부재이며 `npm install` 후에도 복구되지 않았다(미서명 개발 바이너리 차단 환경과 일치). 이번 변경은 Worker 코드를 건드리지 않았고, 이를 기능 실패로 기록하지 않되 미확인으로 남긴다.
- 테스트 배포 `https://08a46335.fragment-cms-test.pages.dev` 완료. 고정 수동 주소 `https://fragment-cms-test.pages.dev/fragments/`에서 HTTP 200과 새 `#composer-error-login` 포함을 확인했다. 실제 GitHub 계정의 토큰 만료·재로그인·재시도는 이번 수동 판정 대상이다.
- 관련 파일만 스테이징하고 판정을 기다린다. 승인 명령·커밋·push는 실행하지 않았다.

## 관계·삭제 피드백 수정 — 사용자 통과·`90617a1` push 완료 (2026-09-17)

- 재개 기준 HEAD `0435654`, `feat/fragments`. 이전 관계·삭제의 미커밋 구현과 스테이징을 보존했다. Graft 설정 변경은 작업 스테이징에서 제외했다. `.githooks`가 이미 활성화되어 있었다.
- 사용자 확정: **같은 두 카드 사이에는 방향·유형과 무관하게 관계 하나만 허용**. 작성 폼에서 이미 연결된 대상은 `이미 연결됨`으로 비활성화하고 저장 직전 반대 방향 관계도 검사한다. 카드당 하나 제한이 아니며 기존 중복 데이터를 자동 삭제하지 않는다. 기존 관계 제거는 해당 방향의 출발 카드를 수정해 저장한다.
- 확인한 실패 경로: 기존 `mutationSnapshot`은 권한 확인 뒤 전체 tree/blob 조회를 익명으로 실행했다. 익명 조회 403 fixture에서 관계 추가·제거 저장이 일반 Error로 실패했다. 로그인된 작성자 API로 동일 revision의 전체 조회를 실행하도록 수정했다. 토큰은 메모리에서 고정 GitHub 저장소 요청에만 전달한다.
- 실제 환경에서도 공개 API가 HTTP 403 및 `X-RateLimit-Remaining: 0`, API rate limit exceeded를 반환했다. 현재 요청 한도 소진의 증거이며 과거 사용자의 모든 간헐적 실패 원인을 확정한 것은 아니다. 원격 사용자 쓰기 요청·당시 실패 응답은 직접 수집하지 않았다.
- 조회·콘텐츠 검증 실패는 쓰기 요청 전 중단 안내, 401은 재로그인, 권한 거부와 요청 한도는 별도 안내로 분류한다. 조회 실패·한도·관계 중복 거부 후 입력 수정이 가능하며, 응답 유실 재시도는 기존 동일 내용 확인을 유지한다. 삭제 참조 차단은 참조 카드 제목과 `해당 카드 수정 → 관계 제거 → 수정 저장 → 삭제 재시도`를 안내한다.
- 저장/삭제 실패 영역을 버튼 위에 추가했다. 테두리·제목·`role=alert`와 포커스/스크롤 이동을 제공한다. 390px에서 삭제 차단·조회 실패·한도 안내가 화면에 보이고 포커스가 이동함을 검증했다.
- Red: 인증 조회와 오류 분류 신규 5개 실패. 관계 유형 fixture의 잘못된 `broader`를 실제 `part-of`로 고친 뒤 서로 다른 유형의 두 관계가 저장되는 assertion 실패를 확인했다. Green: 최종 관계 15개와 삭제 7개 통과. 전체 Vitest 12파일/61개 통과 후 추가 제거 회귀를 포함한 관계 15개 재검증(총 62개 시나리오).
- OAuth Playwright 전체 32개 실행 중 30개 통과·2개 fixture 실패: 익명 제한 mock이 별도 세션 공개 조회까지 막았고, rate-limit 헤더를 CORS로 노출하지 않았다. 실제 GitHub의 expose 헤더 확인 후 mock 범위를 수정하여 관계 7개 모두 통과했다. 이전 option disabled 검사는 Playwright matcher 대신 실제 disabled 속성을 검사하도록 수정했다. 최종 중복 제외 OAuth 32개 시나리오 통과, 일반 Playwright 8개 통과.
- `npx astro check` 오류 0·경고 0·기존 hint 4개, `npm run build` 12페이지 성공. `node scripts/build-writer-test.mjs --remote`는 익명 API 한도 때문에 403 실패했다. 기존 GitHub CLI 인증을 사용하는 Git 제외 임시 GET 전용 어댑터로 같은 빌드 스크립트를 실행해 원격 `ef420f4df28ba59e5944a083ad5a08f0d6ae6c4d`의 카드 6개를 읽고 12페이지 테스트 빌드에 성공했다. 원격 카드 파일은 변경하지 않았다.
- 테스트 배포 `https://9ca4dd79.fragment-cms-test.pages.dev` 완료. 고정 수동 주소 `https://fragment-cms-test.pages.dev/fragments/`에서 HTTP 200, 390px 규칙 안내·로그인 전 저장 차단·6개 카드·가로 넘침 없음·페이지 오류 없음을 확인했다. 공개 최신 조회는 익명 한도로 실패해 빌드 스냅샷 대체 안내가 표시됐다. 이는 최신 원격 조회 성공이 아니다.
- Vitest 하위 프로세스, gh 네트워크, Wrangler와 배포 후 Chromium의 샌드박스 EPERM/프록시 차단은 권한 허용 후 재실행했다. 실제 서비스의 익명 403 한도와 구분한다.
- 개발 계획과 수동 가이드 갱신 후 관련 파일만 스테이징한다. 실제 계정에서 추가→저장→제거→저장→새로고침/별도 세션과 삭제 차단/해제는 새 판정 대상이다. 전체 preview E2E·운영 배포는 미실행이다. 사용자 `통과` 전 승인 명령·커밋·push를 실행하지 않는다.

## 이전 재개 메모 — 관계·삭제 사용자 피드백 (2026-09-17, 위 수정 기록으로 이어짐)

사용자 요청: 아래 피드백을 검토·기록만 하고, 원인 조사와 반영 작업은 다음 세션에서 이어간다. 이번에는 기능 수정·실행 테스트·배포·승인 기록·커밋·push를 진행하지 않는다. 이전 삭제 1~3번 부분 통과는 유지하되 현재 관계 편집·삭제 기능 전체를 승인받은 것으로 해석하지 않는다. 아래 기존 자동 검사 통과는 이번 실제 사용 문제의 해결 증거가 아니다.

1. **이미 관계가 있는 경우 새 관계 추가 제한**
   - 사용자 의견: “이미 관계가 있는 경우 새로운 관계 추가가 불가능해야하지 않을까?”
   - 이전 구현 기록상 동일 대상·동일 유형만 중복 차단한다. 같은 대상에 다른 유형을 추가하거나 반대 방향 관계를 추가하는 정책은 별도로 검토해야 한다.
   - 다음 세션에서 먼저 범위를 확정한다: 같은 두 카드 사이의 추가 관계 금지인지, 관계 유형·방향까지 고려하는지, 카드당 관계를 하나로 제한하려는 것인지. 현재 의견만으로 카드당 관계 하나 제한을 확정하지 않는다. 관련/비교 관계와 선행/상위 관계의 방향 의미도 구분한다.
   - 확정한 규칙에 맞춰 대상 선택·추가 버튼에서 미리 제한하고, 저장 검증에서도 같은 규칙을 적용한다. 기존 여러 관계 데이터의 처리도 검토한다.
2. **삭제 차단 안내의 가시성 개선**
   - 사용자 관찰: 관계가 있는 카드를 삭제하려 할 때 편집 팝업 맨 위에 평문으로 표시되는 메시지를 알아보기 어렵다.
   - 검토 방향: 삭제를 누른 위치 근처의 명확한 오류/안내 영역, 대비와 제목, 필요한 경우 스크롤·포커스 이동 및 접근성 알림. 작은 화면이나 팝업 아래쪽에서도 결과를 놓치지 않도록 확인한다. 표현 방식은 다음 세션에 구현·검증한다.
3. **삭제 실패 원인과 선행 행동 안내**
   - 사용자가 본 문구: “삭제 결과를 확인하지 못했습니다. 입력과 목록은 유지했습니다. 다시 삭제를 눌러 확인해주세요.”
   - 단순 재시도 안내 대신 확인된 이유와 해결 순서를 설명해야 한다. 참조 때문에 차단됐다면 참조 카드 이름과 ‘해당 카드 수정 → 관계 제거 → 수정 저장 → 삭제 재시도’를 안내하는 방향이다.
   - 모든 실패를 참조 관계 문제로 단정하지 않는다. 관계 차단, 로그인/권한, 버전 충돌, 조회 실패, 통신·응답 확인 불가를 구분하고 실제 확인된 원인에 맞춰 안내한다. 관계 차단 상황에서 일반 실패 문구가 나오는 경로도 함께 조사한다.
4. **관계 제거·저장이 간헐적으로 실패하는 문제 — 우선 재현**
   - 사용자 관찰: 어떤 경우에는 관계가 제거되지만 어떤 경우에는 한 번 만든 관계가 제거되지 않는다.
   - 사용자가 본 문구: “저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장해주세요.”
   - 현재 원인은 미확인이다. 다음 세션에서 관계 유형·방향·다른 참조 유무, 폼 재열기/새로고침, 여러 탭, 최초 실패와 재시도의 차이를 기록하며 재현한다. 실패한 요청 단계와 HTTP 상태·오류 응답, 실제 원격 커밋/파일 반영 여부를 대조한다. 토큰이나 비밀값은 기록하지 않는다.
   - 조회 제한·인증/권한·버전 충돌·콘텐츠 검증·응답 파싱·화면 반영 등은 조사 후보일 뿐 확인된 원인이 아니다. 특히 원격 저장 실패와 저장 성공 후 응답/화면 확인 실패를 구분한다. 반복 저장이 해결책이라고 미리 가정하지 않는다.
   - 실제 실패를 재현하는 회귀 테스트를 추가하고 원인을 수정한 뒤, 관계 추가 → 저장 → 제거 → 저장 → 새로고침/다른 세션 확인을 검증한다. 삭제 차단과 해제까지 다시 확인한다.

**다음 세션 순서:** 작업 상태 확인 → 4번 실패 재현 및 3번 오류 분류 → 1번 관계 제한 범위 확정 → 원인 수정과 2·3번 안내 개선 → 자동 검사·테스트 사이트 반영 → 새 수동 테스트 가이드와 사용자 판정 대기. 이번 세션에서는 이 순서를 실행하지 않는다.

**이번 기록 확인:** 이 절에 네 가지 피드백, 두 오류 문구, 미확인 원인과 다음 세션 검증 항목을 보존했다. 문서 변경의 공백 오류만 `git diff --check`로 검사하며, 애플리케이션 테스트는 실행하지 않는다.

## G04-UI — 관계 편집과 삭제 차단 인수 준비 (2026-09-16~17, 수동 판정 대기)

- 사용자 판정: 이전 삭제 가이드 1~3번 통과, 4번은 관계 편집 UI가 없어 검증 불가. 전체 승인으로 해석하지 않았으며 승인 명령·커밋·push를 실행하지 않았다. 요청에 따라 관계 편집을 이어 구현했다. HEAD `0435654`, `feat/fragments`; 이전 삭제 변경은 보존하고 기존 Graft 설정 변경은 계속 스테이징에서 제외한다.
- 작성·수정 폼의 **연결된 개념**에 카드 검색(용어·별칭 등 기존 검색 계약), 대상·유형 선택, 관계 추가·제거를 연결했다. 기존 네 가지 관계 라벨을 재사용하며 같은 대상·유형 중복과 자기 참조를 막는다. 이름이 같은 카드는 카테고리·ID로 구분한다. 추가·제거 후 카드 저장이 필요함을 화면에서 안내한다.
- 폼은 관계를 고정 ID 배열로 저장하며 기존 관계의 명시적 교체/빈 배열 삭제를 지원한다. 새 카드와 카드별 수정 초안에 관계를 함께 보존하고, 원격 원문 재열기·새로고침·다른 탭에서도 복원한다. 조회·저장·삭제로 컬렉션이 바뀌면 선택 목록을 갱신한다.
- 관계가 바뀌는 저장은 삭제와 공유하는 `mutationSnapshot`으로 전체 HEAD 스냅샷의 대상·ID를 검증하고 같은 부모에서 Git tree/commit을 생성한 뒤 `force:false`로 반영한다. 대상이 사라지거나 파일/브랜치 버전이 바뀌면 저장을 차단한다. 실패 시 초안을 유지하며 응답 유실 재시도는 같은 원문이 이미 저장됐으면 중복 쓰기를 하지 않는다. 관계가 바뀌지 않은 기존 생성·수정 저장 계약은 유지한다.
- Red: 최초 관계 필드 테스트에 배열을 문자열 폼 값으로 잘못 넣어 발생한 `value.split` 실패는 fixture 오류로 수정했다. 올바른 입력에서 관계 추가가 무시되어 `[]`이 반환되는 assertion 실패를 확인했다. 신규 저장 함수 미구현 실패도 확인했다. Green: 관계 단위 테스트 8개와 삭제 7개 통과. 전체 Vitest 12파일/55개 통과.
- 브라우저 신규 5개: 390px에서 A→B 추가·중복 방지·재열기 → B 삭제 차단 → A 관계 제거·저장 → B 삭제 성공, 새 카드 초안 분리, 대상 삭제·브랜치 충돌·응답 유실을 검증했다. 저장 이후 다음 새 카드 폼에 관계가 남는 실패를 추가 재현했고, hidden input 값을 성공 시 명시적으로 초기화해 해결했다.
- OAuth 전체 검사에서 24개 통과·6개 실패가 발생했다. 관계 안내에 추가된 status 역할 때문에 기존 저장 상태 locator가 두 요소와 일치한 것이 원인이었다. 관계 안내의 aria-live는 유지하고 별도 status 역할을 제거한 뒤 `tests/oauth/writer.spec.ts` 7개 모두 통과했다. 중복 제외 최종 30개 시나리오 통과다. 일반 Playwright 검사는 세션 재개 후 실행 결과를 회수할 수 없어 재실행했고 8개 통과했다.
- 2026-09-17 `npx astro check`: 오류 0·경고 0·기존 hint 4개. `npm run build`, `node scripts/build-writer-test.mjs --remote`: 각 12페이지 성공. 테스트 스냅샷은 `005dd8902a79a08a1af32687b933668fecad32ff`의 6개 카드. 테스트 빌드의 첫 spawn EPERM은 권한 허용 후 동일 명령 재실행으로 해결했다.
- 테스트 사이트 갱신 완료: `https://16a3fff0.fragment-cms-test.pages.dev`, 실제 로그인·수동 인수는 `https://fragment-cms-test.pages.dev/fragments/`. 배포 도구의 첫 EPERM도 권한 허용 후 재실행했다. 배포 후 Chromium에서 HTTP 200·최신 카드 6개·390px 관계 선택/추가/제거·로그인 전 저장 차단·가로 넘침 없음·페이지 오류 없음을 확인했다. 실제 원격 쓰기는 수행하지 않았다.
- 남은 인수: 위 가이드의 A/B 관계 생성·재열기·삭제 차단·관계 제거 후 삭제를 실제 작성자 계정으로 확인한다. 충돌 시 자동 병합·영구 초안 복구, 전체 preview E2E, 운영 배포는 이번 범위에서 완료하지 않았다. 기존 잘못된 관계가 있는 저장소는 전체 스냅샷 검증에서 차단되므로 GitHub 원문 복구가 필요하다.
- 개발 계획·수동 가이드 갱신, 그래프 갱신·diff 검사 후 삭제와 관계 편집에 해당하는 파일만 스테이징하고 판정을 기다린다. 이번 변경을 포함한 승인 없이 커밋·push하지 않는다.

## G08-UI — 작성자 카드 삭제 (2026-09-16, 수동 판정 대기)

- 시작 기준 `0435654`, `feat/fragments`. 기존 `.gitignore`, `.ignore`, `AGENTS.md`의 Graft 변경은 보존하고 이번 스테이징에서 제외한다. 훅 경로는 `.githooks`로 이미 활성화되어 있다. 아래 과거 기록의 수동 대기 표기는 당시 상태다.
- 로그인·쓰기 권한 확인 후 기존 카드 수정 창에 **카드 삭제**를 제공한다. 확인창에 원래 제목과 미저장 수정 삭제를 알리고, 취소하면 입력과 목록을 그대로 유지한다. 처리 중 중복 요청·닫기·로그아웃을 막는다. 새 카드 폼과 로그인 전에는 삭제를 숨긴다.
- 관계 정책: 다른 카드가 대상 ID를 참조하면 참조 카드 제목을 안내하며 삭제를 차단한다. 관계 자동 삭제는 하지 않는다. 현재 관계 편집 UI는 후속 G04~G07-UI이므로 먼저 GitHub 원문의 `relations`를 수정해야 한다.
- 삭제 직전 권한을 재확인하고 브랜치 HEAD 하나에 고정된 전체 카드 스냅샷을 읽어 ID·관계·파일 SHA를 검증한다. 대상 파일만 제거한 Git tree와 단일 부모 commit을 만들고 `force:false`로 브랜치를 갱신한다. 관계 검사 이후 다른 커밋이 생겨도 강제로 덮어쓰지 않는다. 충돌 시 브랜치에 연결되지 않은 tree/commit 객체가 남을 수 있다.
- 성공한 스냅샷을 목록·검색·카테고리·그래프에 한 번에 반영하며, 이전에 시작된 조회가 삭제 결과를 되돌리지 못하게 한다. 실패하면 입력과 목록을 유지한다. 응답 유실 후 재시도는 전체 최신 목록에서 파일과 ID가 모두 없음을 확인하면 추가 쓰기 없이 이미 삭제됐음을 안내한다. 파일 이동·내용 변경·불완전 목록은 삭제하지 않는다.
- Red: `npx vitest run tests/unit/fragment-delete.test.ts`에서 미구현 `deleteFragment` 호출로 7개 테스트 실패. Green: 같은 7개 통과. 최종 `npx vitest run` 11파일/47개 통과.
- 브라우저: 신규 `tests/oauth/delete.spec.ts` 6개 통과. 390px에서 취소·삭제·포커스 복원, 검색·다른 탭의 그래프 반영, 참조 차단, 파일 변경, 브랜치 충돌, 응답 유실 재시도, 쓰기 권한 거부를 검증했다. 전체 `npx playwright test --config playwright.oauth.config.ts` 25개, `npx playwright test` 8개 통과. GitHub 쓰기는 mock이며 실제 사용자 파일을 자동 삭제하지 않았다.
- `npx astro check`: 오류 0·경고 0·기존 hint 4개. `npm run build`, `node scripts/build-writer-test.mjs --remote`: 각 12페이지 성공. 테스트 스냅샷은 `b187f407e5bff7badcba79c44749e2ab42462e6f`의 7개 카드다. 테스트 빌드 첫 실행의 spawn EPERM은 권한 허용 후 동일 명령 재실행으로 해결했다.
- 기존 Cloudflare 테스트 사이트 갱신: `https://4e482756.fragment-cms-test.pages.dev`. 실제 로그인 주소는 `https://fragment-cms-test.pages.dev/fragments/`. 배포와 배포 후 Chromium 검사도 첫 실행 EPERM을 권한 허용 후 해결했다. 고정 주소 HTTP 200, 최신 카드 7개, 삭제 버튼 존재·로그인 전 숨김, 저장 비활성, 390px 가로 넘침 없음·페이지 오류 없음을 확인했다.
- 실제 계정의 삭제·커밋·별도 세션 인수는 사용자 판정 대상이다. 전체 preview E2E와 운영 배포는 수행하지 않았다. 계획·수동 가이드 갱신, `graft build`, diff 검사 후 관련 파일만 스테이징한다. 승인 명령·커밋·push는 실행하지 않는다. 후속 작은 작업은 G04~G07-UI의 관계 입력과 실패 복구 범위에서 정한다.
- API 근거: [Git trees](https://docs.github.com/en/rest/git/trees#create-a-tree), [Git references](https://docs.github.com/en/rest/git/refs#update-a-reference).

## 그래프 관계 텍스트 배경 (2026-09-16, 수동 판정 대기)

- 사용자가 이전 그래프 테스트 목록을 명시적으로 통과 판정했다. 별도 Graft 설정(.gitignore, .ignore, AGENTS.md)은 이번 승인 범위에 포함하지 않고 스테이징에서 제외해 파일을 보존했다. 승인 명령은 남아 있는 unstaged 변경을 이유로 훅에서 차단되어 승인 기록·커밋이 생성되지 않았다. 이어 실행된 push는 Everything up-to-date로 새 커밋을 전송하지 않았다. 훅을 우회하지 않았다.
- 추가 요청에 따라 edge 관계 텍스트 뒤에 그래프의 실제 배경색과 같은 불투명 배경과 3px 여백을 적용했다. 글자 부분의 선을 가리고 테마 변경 시 다시 계산한다. 기존 통과 판정은 이 추가 변경의 승인으로 해석하지 않는다.
- 검증: `npx playwright test --config playwright.oauth.config.ts tests/oauth/graph.spec.ts` 3개 통과. `npx astro check` 오류 0·경고 0·기존 hint 4개, `npm run build` 12페이지 성공. 로컬 그래프 URL HTTP 200 확인. 스타일 변경이므로 새 테스트와 단위 전체 재실행은 생략했다. 밝은/어두운 테마의 시각적 만족도는 사용자 수동 판정 대상이며 외부 배포는 수행하지 않았다.
- 수동 확인: `http://127.0.0.1:4321/fragments/?view=graph`에서 관계 글자 뒤로 선이 비치지 않는지, 노드 강조와 테마 전환 후에도 배경이 자연스러운지 확인한다.

## 그래프 가독성·이웃 강조 — 재개 검증 (2026-09-16, 수동 판정 대기)

- `feat/fragments`, HEAD `e89b86c`에서 미커밋 그래프 UI 3파일과 `tests/oauth/graph.spec.ts`를 찾아 이어서 검증했다. 기존 Graft 설정의 스테이징은 보존했다. 이전 G03-LIVE는 Git 이력상 커밋됐으며 아래 수동 대기 표기는 당시 기록이다. 작성자 삭제(G08-UI)는 후속 작업이다.
- 긴 제목 줄바꿈, 관계가 없는 그래프의 격자 배치·안내, 전체 맞춤 확대 제한, 마우스/키보드의 직접 이웃 강조와 상세 열기를 확인했다. 캔버스 밖으로 바로 나가면 강조가 남는 실패를 재현해 DOM mouseleave에서 복원하도록 수정했다.
- 브라우저 테스트는 캔버스 준비·스크롤 좌표 반영 후 실제 포인터로 hover하도록 재시도하며, 이벤트를 강제로 발생시키지 않는다. 1280px/390px에서 제목 경계의 겹침·가로 넘침, 이웃 강조·해제, 키보드 상세 열기·포커스 복원, 중심 개념 전환을 검증했다.
- 자동 검사: `npx vitest run` 10파일/40개 통과. 수정 후 `npx playwright test --config playwright.oauth.config.ts` 19개, `npx playwright test` 8개 통과. 최종 `npx astro check` 오류 0·경고 0·기존 hint 4개, `npm run build` 12페이지 성공. 최초 브라우저 실패는 위 수정 후 해결했다.
- OAuth 브라우저 검사는 GitHub 응답을 mock 처리했다. 실제 계정 로그인·쓰기, 외부 배포와 전체 preview E2E는 이번에 수행하지 않았다. 수동 확인은 로컬 `/fragments/?view=graph`에서 진행한다. 승인 기록·커밋·push는 실행하지 않는다.

## G03-LIVE — 저장 후 목록·상세 반영 (2026-09-16, 수동 판정 대기)

- 사용자가 G03-UI 테스트를 명시적으로 통과 판정했다. 승인받은 스테이징 내용 그대로 `node scripts/manual-review.mjs approve` → `847260e` 커밋 → `feat/fragments` push 완료. 첫 승인 명령의 샌드박스 spawnSync EPERM은 권한 허용 재실행으로 해결했다. 새 변경에는 이전 승인을 적용하지 않는다.
- 사용자 추가 요청: 목록·상세에도 수정 내용을 표시하고 로그인한 작성자가 카드를 삭제할 수 있도록 한다. 작은 작업별 수동 검증 절차에 따라 이번에는 목록 반영(G03-LIVE)을 구현했다. 삭제는 G08-UI로 다음 작업에 명시했으며 아직 삭제 버튼/API를 추가하지 않았다.
- 테스트 환경 접속 시 공개 GitHub tree를 읽고 고정된 blob SHA로 Markdown을 수집한다. 별도 읽기 토큰 없이 전체 스냅샷의 ID·관계를 검증한 뒤 한 번에 목록·상세·필터 집계·검색·그래프를 갱신한다. 초기 HTML에 없는 카드의 직접 URL과 실제 파일 경로도 복원한다. 일반 모드는 기존 정적 조회를 유지한다.
- 생성·수정 저장 성공 시 저장한 카드만 같은 ID로 현재 컬렉션에 반영한다. 실패한 PUT은 반영하지 않으며, 앞서 시작한 조회 응답이 저장 결과를 되돌리지 못하도록 세대를 비교한다. 검색·필터를 유지하고 결과에 맞춰 페이지를 보정한다. 열어 둔 다른 탭은 새로고침할 때 최신 내용을 읽는다.
- 조회 실패·잘린 tree·중복 ID·끊어진 관계는 부분 결과를 적용하지 않고 이전 목록과 안내/재시도를 표시한다. 빈 컬렉션은 정상 반영한다. 원문 파서를 수정 폼과 공유하며 ID 없는 파일에 임의 ID를 생성하지 않는다.
- 브라우저 Markdown에는 marked + DOMPurify 허용 태그/속성 설정을 적용했다. script·이미지 이벤트·javascript 링크 비실행을 브라우저로 검증했다. DOMPurify 3.4.15와 타입 의존성 1개를 추가했다. 설치 캐시 제한은 권한 허용 후 해결했고 기존 audit 경고 18개는 유지됐다.
- Red: `npx vitest run tests/unit/fragment-snapshot.test.ts`가 새 모듈 부재로 수집 실패. Green: 새 스냅샷 테스트 3개와 기존 편집 3개 통과. 최종 `npx vitest run` 10파일/40개 통과.
- 브라우저 검사: `npx playwright test --config playwright.oauth.config.ts` 15개 통과 후, 늦은 조회 응답/신규 카드 테스트를 추가해 `... tests/oauth/sync.spec.ts` 3개 통과. 중복 제외 OAuth/저장/동기화 16개 시나리오다. `npx playwright test` 일반 8개 통과. 새로고침·다른 탭·직접 URL, 목록·본문·검색·카테고리·그래프 반영, 빈 목록/실패 재시도, 새 카드 1회 추가를 검증했다. 실제 쓰기는 mock이다.
- `npx astro check` 오류 0·경고 0·기존 hint 4개. `npm run build`, `node scripts/build-writer-test.mjs --remote` 각 12페이지 성공. 테스트 스냅샷은 `4b94980dcc0c0ba6fd98b34ed790591568317d2e`의 7개 카드. 운영 원본 및 원격 카드 파일은 에이전트가 변경하지 않았다. 전체 preview E2E는 재실행하지 않았다.
- 테스트 사이트 갱신: `https://d31a7494.fragment-cms-test.pages.dev`. 고정 주소에서 실제 GitHub 최신 목록 조회 성공, 카드 7개, HTTP 200, 수정 진입·로그인 전 저장 차단, 390px 가로 넘침 및 페이지 오류 없음을 확인했다. 실계정 저장 직후 반영은 사용자 수동 판정 대상이다.
- 계획/수동 가이드 갱신과 diff 검사를 완료하고 관련 파일만 스테이징한다. 새 변경의 승인 기록·커밋·push는 사용자 판정 후 진행한다. 다음 작은 작업은 G08-UI 작성자 카드 삭제다.

## G03-UI — 기존 카드 수정 연결 (2026-09-16, 사용자 통과·847260e push 완료)

- 시작 기준 `e6a0633`, `feat/fragments`, 작업 폴더 깨끗함. G02-CATEGORY의 아래 제목은 당시 수동 대기 기록이며 현재 Git에는 카테고리 변경 커밋이 존재한다. 이번 턴에 이전 승인을 새로 기록하거나 해석하지 않았다.
- 상세 팝업에 테스트 환경의 `로그인하고 수정`/`카드 수정` 진입을 연결했다. 로그인과 쓰기 권한 확인 후 선택한 카드의 실제 경로에서 최신 Markdown·SHA를 읽는다. 새 카드 및 카드별 수정 초안을 분리하며 닫기·재열기 시 입력을 보존한다.
- 수정은 같은 경로·고정 ID·읽은 SHA로 Contents API PUT을 보낸다. 기존 관계, Markdown 본문, 변경하지 않은 별칭·태그와 기존 카테고리를 보존한다. 공통 선택 목록에 없는 카테고리는 기존 값 옵션으로 제공한다. 저장 후 창을 닫고 결과 링크를 표시한다.
- 저장 직전에 원문을 읽어 이미 같은 내용이면 추가 PUT 없이 성공 확인, SHA가 달라졌으면 덮어쓰기 차단·입력 보존. 삭제/권한 거부/잘못된 ID·경로·원문 형식도 실패 처리한다. 지원하지 않는 최상위 메타데이터는 조용히 삭제하지 않고 편집을 거부한다. 충돌 병합 UI·공개 목록 자동 반영·관계 편집은 이번 범위가 아니다.
- `yaml` 2.9.0을 직접 의존성으로 등록했다. 이미 설치된 버전이며 다른 패키지 버전 변경 없음. offline 설치는 캐시 부재로 실패해 권한 허용 설치로 완료했다. 기존 audit 경고 18개는 유지되며 별도 감사/강제 업데이트는 하지 않았다.
- Red: `npx vitest run tests/unit/fragment-edit.test.ts` 3개가 `loadFragment is not a function`으로 실패했다. Green: 원래 파일명과 ID가 다른 fixture의 수정·관계 보존, 오래된 SHA 거부, 응답 유실 복구, ID/경로/삭제 차단을 구현해 통과했다.
- 검사: `npx vitest run` 9파일/37개 통과. `npx playwright test --config playwright.oauth.config.ts` 13개 통과(신규 3개: 수정·다른 탭 재열기, 응답 유실 뒤 추가 쓰기 없음, 동시 수정 차단·초안 분리). `npx playwright test` 8개 통과. `npx astro check` 오류 0·경고 0·기존 hint 4개. OAuth/API 응답은 mock이며 실계정 수정 성공 증거를 대신하지 않는다.
- `npm run build` 12페이지 성공. 테스트 저장소를 읽어보니 로컬 예제 EPT/GPA/HPA는 없고 이전 작성 카드 7개가 존재했다. 수동 테스트 준비를 위해 `scripts/build-writer-test.mjs --remote`를 추가했다. 테스트 브랜치 커밋 `aa23b3fd4a1949be31eda29f39fed181a2c5b334`의 카드 7개를 Git 제외 폴더에 내려받아 테스트 빌드 12페이지 성공. 운영 콘텐츠와 원격 파일은 변경하지 않았다.
- 테스트 사이트 갱신 완료: `https://c07e6152.fragment-cms-test.pages.dev`. 실제 인증 주소는 고정 origin인 `https://fragment-cms-test.pages.dev/fragments/`이다. 배포된 브라우저에서 HTTP 200, 카드 7개, 수정 창·로그인 버튼·로그인 전 저장 차단, 390px 가로 넘침 없음·페이지 오류 없음을 확인했다. 현재 수정 저장 실계정 인수와 전체 preview E2E는 미실행이다.
- 원격 curl 조회, 테스트 빌드·최종 타입 검사·Wrangler·브라우저 확인의 샌드박스 네트워크/spawn 제한은 권한 허용 환경에서 같은 작업을 재실행해 해결했다. 테스트 실패와 구분한다.
- [생성·수정 검증 안내](./Fragment-전용-작성-검증.md)에 이번 수동 확인 절차를 추가했다. 이번 작업 파일만 스테이징하고 판정을 기다린다. 승인 명령·Git 커밋·push는 실행하지 않는다.

## G02-CATEGORY — 블로그 공통 카테고리 선택 (2026-09-16, 수동 판정 대기)

- 추가 피드백: 사용자가 카테고리 기능은 통과 판정하고 화살표 오른쪽 여백 개선을 요청했다. select를 감싼 요소에 CSS 화살표를 두고 right 18px·텍스트 우측 padding 44px로 조정했다. 화살표는 pointer-events:none으로 클릭을 선택창에 전달하며, 강제 색상 모드에서는 기본 화살표를 사용한다. 기존 카드 편집은 G03 미구현임을 안내했다. 수정된 외관은 새 수동 판정 대상이다.
- 여백 조정 후 `npx playwright test tests/e2e/fragment-editor.spec.ts`: 2개 통과. 선택·입력 보존과 모바일 너비 회귀를 확인했다. CSS 중심의 변경으로 새 자동 테스트는 추가하지 않았다.
- 여백 수정 테스트 빌드 12페이지 성공, Cloudflare 테스트 사이트 갱신 완료(`https://b9bbb696.fragment-cms-test.pages.dev`). 일반 빌드·타입·OAuth 전체 검사는 여백 수정 후 재실행하지 않았다. 외관과 실제 화살표 클릭은 사용자 수동 확인 대상으로 남긴다.

- 시작 기준 `94585ed`, `feat/fragments`, 작업 폴더 깨끗함. 이전 작성 창 개선은 사용자 1~4 통과 판정 후 승인 기록·커밋·push 완료했다.
- 작성 폼이 블로그 Sidebar와 동일한 `src/consts.ts`의 `CATEGORIES`를 직접 읽는다. AI, Frontend, Backend, DevOps, Database, 회고/생각 순서를 공유하며 글 수와 관계없이 설정된 모든 카테고리를 표시한다. Fragment 예제에서 추출하던 작성 폼 props를 제거했다. 기존 카드와 조회 필터는 변경하지 않았다.
- 브라우저 자동완성 datalist를 필수 select로 교체했다. 첫 항목은 선택 안내이며 목록의 값만 선택한다. 저장 필드 수집에 select를 포함하고, 저장 재시도 시에는 기존 선택값을 비활성 상태로 보존한다. 성공 후 reset하면 선택 안내로 돌아간다.
- 일반 Playwright 8개 통과: 실제 블로그 사이드바와 선택 목록·순서 일치, 미선택 validity, 선택 후 닫기·재열기 보존을 추가했다. 첫 실행은 label에 option 문구가 포함되어 정확한 이름 탐색이 실패했고 명시적인 카테고리 접근성 이름을 부여한 후 통과했다. 이번 작업의 구현 전 Red는 별도 실행하지 않았다.
- OAuth Playwright 10개 통과: DevOps 선택과 저장 Markdown 값, 성공 후 선택 초기화, 응답 유실 시 선택값 고정과 재시도 검증. 별칭·태그·보충 설명이 비어 있는 정상 저장도 포함한다. 실제 GitHub 응답은 mock이며 사용자 환경의 이전 저장 버튼 현상을 재현한 것은 아니다.
- `npx astro check`: 오류 0·경고 0·기존 hint 4개. `npm run build`, `node scripts/build-writer-test.mjs`: 각 12페이지 성공. 공유 Astro 산출물 충돌을 피하려고 검사를 순서대로 실행했다. 저장 API 로직 변경이 없어 Vitest 및 preview 검사는 재실행하지 않았다.
- 테스트 사이트 배포 완료(`https://dae239b6.fragment-cms-test.pages.dev`). 고정 주소 `/fragments/`에서 HTTP 200, select와 공통 여섯 옵션, 이전 datalist 제거를 확인했다. 실제 브라우저의 OS 선택창과 계정 저장은 수동 검증 대상이다.
- 수동 가이드를 갱신하고 `git diff --check`를 확인한다. 관련 7개 파일만 스테이징하며 새 변경은 수동 판정 후 커밋·push한다.

## G02-UX — 작성 창 닫기·저장 후 복귀 (2026-09-15, 사용자 통과·94585ed push 완료)

- 사용자가 기존 G02-UI 테스트를 명시적으로 통과 판정했다. 승인된 스테이징 트리를 `node scripts/manual-review.mjs approve`로 기록하고 `ffe9bc8`로 커밋·개발 브랜치 push 완료. 최초 승인 명령의 spawnSync EPERM은 권한 허용 후 재실행했다. 실제 생성 커밋 URL의 독립 대조는 아직 하지 않았다.
- 이번 변경은 바깥 클릭 닫기와 저장 성공 후 복귀다. 바깥에서 시작하고 끝난 클릭만 닫으며 입력은 유지한다. 저장·인증 처리 중에는 닫기 버튼과 Escape, 바깥 클릭으로 닫히지 않는다.
- 저장 확인 후 작성 창을 닫고 입력을 초기화하며 새 카드 버튼으로 포커스를 복원한다. 목록 위의 live region에 카드 이름과 완료 안내를 표시하고 선택적인 GitHub 결과 링크를 둔다. 로그인은 유지되어 다음 새 카드를 바로 작성할 수 있다. 실패는 기존 입력·ID와 재시도를 유지한다.
- 공개 목록 자동 갱신과 기존 카드 수정은 별도 작업으로 남긴다. 완료 안내는 공개 목록이 사이트 업데이트 후 반영됨을 명시한다. 저장 성공만으로 공개 배포 완료를 표시하지 않는다.
- 검증: 일반 Playwright 7개 통과, OAuth Playwright 10개 통과(저장 중 닫기 방지·실패 후 입력 보존 추가). 첫 OAuth 실행은 다른 Astro 검사와 동시에 진행하다 응답 유실 시나리오에서 페이지 재로드로 실패했다. 공유 산출물 영향으로 추정하며 다른 검사 종료 후 단독 실행으로 전체 통과했다.
- `npx astro check`: 오류 0·경고 0·기존 hint 4개. `npm run build`와 `node scripts/build-writer-test.mjs`: 각 12페이지 성공. 테스트 빌드 최초 spawn EPERM은 권한 허용 후 동일 명령으로 통과했다. 저장 API·단위 로직 변경이 없어 Vitest와 preview 전체 검사는 이번에 재실행하지 않았다.
- 기존 Cloudflare 테스트 프로젝트를 갱신했다(`https://704c30e5.fragment-cms-test.pages.dev`). 고정 주소 `/fragments/`에서 HTTP 200/noindex, 새 완료 안내 영역 존재·이전 다음 카드 버튼 제거를 확인했다. 최초 배포 명령의 spawn EPERM은 권한 허용 후 재실행했다. 실제 인증은 `https://fragment-cms-test.pages.dev/fragments/`에서 수동 검증한다.
- 수동 가이드 갱신 및 `git diff --check` 통과. 관련 7개 파일만 스테이징한다. 새 변경의 승인·커밋·push는 수동 판정 후 진행한다.

## G02-UI — 전용 폼 로그인·새 카드 저장 (2026-09-15, 사용자 통과·ffe9bc8 push 완료)

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

## Graft 저장소 그래프 및 Codex 연동 (2026-09-16)

- `npm install -g @nanonets/graft`를 실행해 `@nanonets/graft@0.18.0`을 설치했다. 설치 중 `tree-sitter-swift` peer 의존성 경고가 있었지만 설치는 성공했다.
- 저장소에서 `graft init`을 실행해 그래프를 생성했다. 46개 파일을 파싱하고 168 nodes, 422 edges, 46 cards를 생성했으며 `graft/` 폴더에 기록했다.
- 첫 실행에서 Codex 전역 설정 파일 쓰기가 `EPERM`으로 실패해 `graft init --agents agents --no-build`를 권한 승인 후 다시 실행했다. Codex 설정, Graft 훅, `AGENTS.md`, `.gitignore`, `.ignore` 연동을 확인했다.
- 자동 검사: `graft init` 그래프 빌드 성공, `graft/` 존재 확인, `INDEX.md`를 제외한 맵 문서 46개 확인. 애플리케이션 자동 테스트는 동작 코드 변경이 없어 실행하지 않았다.

### Claude Code 쪽 연동 마무리 (2026-09-17)

- Codex용 `AGENTS.md` 안내에 더해 Claude Code 연동 파일이 작업 트리에 남아 있어 이번에 함께 정리했다. `.mcp.json`은 `graft mcp` 서버를, `.claude/settings.json`은 graft 상태줄·훅과 `Bash(graft:*)` 등 읽기 전용 권한을 등록한다. `.claude/helpers/*.cjs`와 `.claude/skills/graft/SKILL.md`가 그 구현이다.
- `.gitignore`는 재생성 가능한 `/graft/` 그래프 캐시와 개인 권한 파일 `.claude/settings.local.json`을 제외한다. `.ignore`는 gitignore된 `graft/`를 ripgrep 검색 대상으로 되돌리되 `.cache/`·`.graph/`는 제외한다. 공유 설정 `.claude/settings.json`만 버전 관리한다.
- `.claude/settings.local.json`에는 이전 세션의 로컬 경로와 임시 스크린샷 명령이 들어 있어 커밋 대상에서 제외했다. 비밀값은 포함되지 않았음을 확인했다.
- 자동 검사: `npm run build` 12페이지 성공, `npm run check` 오류 0·경고 0(기존 hint 4개), `git diff --check` 통과. 동작 코드 변경이 없어 단위·브라우저 테스트는 재실행하지 않았다. 도구 설정 변경이므로 테스트 사이트 재배포도 하지 않았다.
