# Fragment 로컬 CMS 실행

A03-3 기준: 관리 화면에서 카드 생성·수정·Markdown 저장·다른 브라우저에서 재열기·Astro 수집을 검증했다. GitHub OAuth와 운영 저장·배포는 아직 연결하지 않았다.

1. `npm run dev:admin` 실행.
2. `http://127.0.0.1:4400/admin/` 접속 후 `Login` 클릭. 여기서는 로컬 proxy 접속이며 GitHub OAuth 로그인이 아니다.
3. `CMS 격리 연결 확인` 카드를 열거나 새 카드를 만든다. `Publish` → `Publish now`로 로컬 파일에 저장하며 `Changes saved`를 확인한다.
4. 터미널에서 Ctrl+C를 눌러 Astro와 proxy를 함께 종료한다.

수동 실행의 저장 루트는 `.fragment-test/cms`로 고정한다. 그 아래 `src/content/fragments`와 `public/uploads`만 연습 데이터로 사용한다. 프로젝트의 운영 카드 폴더에는 연결하지 않는다. 시작할 때 확인용 카드를 없을 경우에만 만들며 기존 연습 파일은 덮어쓰거나 삭제하지 않는다. 이 폴더는 Git에서 제외한다.

이 실행의 `/fragments/`도 같은 격리 폴더를 Astro 컬렉션으로 읽는다. 파일 저장과 Astro의 비동기 파일 감지는 별도 단계이므로, 저장 후 새 탭에서 목록을 확인하고 필요한 경우 새로고침한다. 일반 `npm run dev`로 실행한 목록은 운영 카드 폴더를 읽는다.

4400(Astro)과 8082(proxy) 포트가 사용 중이면 실행을 중단한다. 실행 스크립트는 proxy의 작업 경로와 GIT_REPO_DIRECTORY를 격리 폴더로 고정하고 127.0.0.1에 바인딩한다. 일반 `npm run dev`와 프로덕션 build에서는 로컬 CMS를 활성화하지 않는다. 운영 `/admin/`은 인증 연결 준비 안내만 표시한다.

`npm run test:admin`은 별도의 Playwright 설정으로 두 서버를 자동 실행·종료한다. 실행마다 `.fragment-test/cms-runs/run-*/cms`에 새 폴더와 fixture 두 개를 만든다. 카드 생성 테스트는 새 ID를 쓰고 기존 카드 수정 테스트는 전용 `legacy-card.md`를 사용한다. 수동 연습 폴더를 건드리지 않으며 실패 시에도 파일을 보존한다. 최근 실행 경로는 `.fragment-test/admin-run.json`, 브라우저 결과는 `.fragment-test/admin-results`에 남는다. 테스트 실행은 1 worker로 직렬화하며 같은 포트로 중복 실행하지 않는다.

CMS는 3.16.2 브라우저 배포 파일을 저장소에 고정해 런타임 CDN 요청 없이 로드한다. 출처·해시·라이선스는 `public/admin/vendor/README.md`에 기록했다. Astro 페이지에서 설정을 직접 넘기므로 public/admin/index.html이나 config.yml은 중복으로 만들지 않는다.

연결 근거: [Decap 수동 초기화](https://decapcms.org/docs/manual-initialization/), [preSave 이벤트](https://decapcms.org/docs/registering-events/). preSave에 연결한 A03-1 저장 준비 함수로 새 ID를 생성한다. 제목 변경, 별칭/태그 비우기, Markdown 본문 저장을 검증했다. 기존 파일명과 명시적 ID가 달라도 수정 시 각각 유지하며 기존 관계도 보존한다. 관계를 폼에서 새로 지정하는 동작은 G04에서 별도로 인수한다.
