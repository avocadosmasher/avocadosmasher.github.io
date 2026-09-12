# Fragment 로컬 CMS 실행

A03-2 기준: 관리 화면 연결과 기존 카드 읽기까지 검증했다. 실제 폼 생성·수정 후 파일 저장 및 ID 유지 인수는 A03-3에서 진행한다.

1. `npm run dev:admin` 실행.
2. `http://127.0.0.1:4400/admin/` 접속 후 `Login` 클릭. 여기서는 로컬 proxy 접속이며 GitHub OAuth 로그인이 아니다.
3. `CMS 격리 연결 확인` 카드를 열어 용어·요약·본문을 확인한다.
4. 터미널에서 Ctrl+C를 눌러 Astro와 proxy를 함께 종료한다.

저장 루트는 `.fragment-test/cms`로 고정한다. 그 아래 `src/content/fragments`와 `public/uploads`만 연습 데이터로 사용한다. 프로젝트의 운영 카드 폴더에는 연결하지 않는다. 시작할 때 확인용 카드를 없을 경우에만 만들며 기존 연습 파일은 덮어쓰거나 삭제하지 않는다. 이 폴더는 Git에서 제외한다.

4400(Astro)과 8082(proxy) 포트가 사용 중이면 실행을 중단한다. 실행 스크립트는 proxy의 작업 경로와 GIT_REPO_DIRECTORY를 격리 폴더로 고정하고 127.0.0.1에 바인딩한다. 일반 `npm run dev`와 프로덕션 build에서는 로컬 CMS를 활성화하지 않는다. 운영 `/admin/`은 인증 연결 준비 안내만 표시한다.

`npm run test:admin`은 별도의 Playwright 설정으로 두 서버를 자동 실행·종료한다. 현재 확인용 카드 1개가 있는 기본 연습 폴더를 기준으로 검증하며, A03-3에서 저장 테스트용 fixture 생명주기를 확장할 예정이다. 일반 E2E 보고서와 충돌하지 않도록 결과를 `.fragment-test/admin-results`에 저장한다.

CMS는 3.16.2 브라우저 배포 파일을 저장소에 고정해 런타임 CDN 요청 없이 로드한다. 출처·해시·라이선스는 `public/admin/vendor/README.md`에 기록했다. Astro 페이지에서 설정을 직접 넘기므로 public/admin/index.html이나 config.yml은 중복으로 만들지 않는다.

연결 근거: [Decap 수동 초기화](https://decapcms.org/docs/manual-initialization/), [preSave 이벤트](https://decapcms.org/docs/registering-events/). 현재 preSave에 A03-1 저장 준비 함수를 연결했으며 실제 폼 저장 순서·빈 선택 필드·파일명과 ID 보존은 다음 단계의 검증 대상이다.
