# Fragment OAuth Worker (A04-1)

GitHub OAuth code 교환과 Decap 3.16.2 팝업 연결을 구현했다. 로컬 Workers 런타임과 모의 GitHub 응답으로 검증했으며, 외부 계정·배포·실제 토큰·GitHub 커밋은 아직 연결하지 않았다. 계정 준비는 [외부 인증 안내](../../docs/archive/Fragment-외부-인증.md)를 참고한다.

## 로컬 검증

Node 22 이상이 필요한 개발 도구를 사용한다. 검증 환경은 Windows, Node 24.14.0이다.

```powershell
npm ci
npm test
npm run test:oauth
npm run check
npx tsc --noEmit --skipLibCheck --module ESNext --moduleResolution bundler --target ES2022 workers/fragment-oauth/worker.ts tests/integration/oauth-runtime.test.ts tests/unit/oauth.test.ts
npx wrangler deploy --config workers/fragment-oauth/wrangler.jsonc --dry-run --outdir ../../.fragment-test/oauth-build
```

`--dry-run`은 파일을 빌드하고 binding을 검사할 뿐 Cloudflare에 배포하지 않는다. outdir는 Wrangler 설정 파일 디렉터리 기준이며 프로젝트의 `.fragment-test/oauth-build`에 쓴다. 테스트 계정과 비밀값 없이 모든 검사를 실행할 수 있다.

- `tests/unit/oauth.test.ts`: state 서명·만료·쿠키 결합, PKCE, 잘못된 origin/scope/config, 토큰 교환·취소·상위 서버 오류, 재사용 거부, CMS 테스트 저장소 분리.
- `tests/integration/oauth-runtime.test.ts`: Miniflare의 실제 workerd + SQLite Durable Object에서 모의 토큰 교환, 동시 callback의 단 한 번 소비, 잘못된 binding·만료·재사용 거부. outboundService가 모든 외부 요청을 모의 응답으로 끝낸다.
- `tests/oauth/login.spec.ts`: 실제 고정 Decap 파일로 핸드셰이크 → 가짜 토큰을 GitHub API 요청에 사용, 취소 메시지, origin/source 제한, 스크립트 문자열 이스케이프 확인. GitHub 요청은 Playwright가 가로챈다. 모의 토큰만 사용하며 trace를 저장하지 않는다.

`npm run dev:oauth`는 로컬 개발 서버만 켠다. 빈 기본 변수로는 503을 반환하는 것이 정상이다. 자동 검증은 HTTPS 요청·쿠키를 Miniflare 안에서 처리하므로 직접 `http://localhost`에서 실제 OAuth가 된다는 뜻은 아니다. 브라우저로 실제 로그인하려면 A04-2의 HTTPS 테스트 주소·계정 설정이 필요하다.

## 서버 구성

`wrangler.jsonc`의 일반 변수에 `GITHUB_CLIENT_ID`, `CMS_ORIGIN`, `OAUTH_CALLBACK_URL`을 설정한다. `CMS_ORIGIN`은 경로 없는 HTTPS origin, callback은 Worker의 정확한 `/callback` URL이어야 한다. scope는 공개 테스트 저장소용 `public_repo`만 허용한다.

Secret은 Cloudflare Dashboard에 `GITHUB_CLIENT_SECRET`과 `OAUTH_STATE_SECRET`으로 등록한다. 서명 키는 암호학적으로 무작위인 32바이트 이상으로 만들고 Secret 입력란에만 보관한다. 코드가 검사하는 최소 문자열 길이는 32자다. 로컬 실험용 값을 파일에 보관할 경우 이 디렉터리의 `.dev.vars`를 사용하며 Git에서 제외된다. 실제 비밀값을 README·커밋·정적 사이트 환경변수에 넣지 않는다.

`OAUTH_SESSIONS` binding과 `v1`의 `new_sqlite_classes: ["OAuthSession"]` migration도 함께 배포해야 한다. 로그인마다 별도 객체에 쿠키 해시, PKCE verifier, 10분 만료를 저장하고 트랜잭션에서 한 번만 소비한다. alarm으로 미사용 데이터도 정리한다. 사용자 access token과 Client Secret은 Durable Object에 저장하지 않는다. [Durable Object 저장 계약](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)

SQLite Durable Objects는 Workers Free에서도 사용할 수 있지만 Worker 자체 한도와 별개로 요청·연산·저장 한도가 있다. Free 한도를 넘으면 해당 연산이 실패한다. 계정 연결 시 현재 요금표를 확인한다. 이번 작업에서는 부하·비용을 실측하지 않았다. [Durable Objects 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/)

운영 로그 수집은 설정에서 꺼 두었으며 코드에서 요청·응답·토큰을 출력하지 않는다. 팝업 응답은 `no-store`, `no-referrer`, nonce CSP를 적용하고 서버에 고정한 origin의 opener로만 결과를 전달한다. code 교환은 리다이렉트를 따라가지 않으며 3xx도 인증 실패로 처리한다.

## 테스트 CMS 활성화

다음 값은 **테스트 관리 화면을 만드는 Astro 프로세스**에만 전달한다. Secret은 필요하지 않다. `<...>`는 실제 테스트 주소로 바꾼다.

```powershell
$env:FRAGMENT_CMS_OAUTH_TEST = '1'
$env:FRAGMENT_CMS_TEST_REPO = '<소유자>/fragment-cms-auth-test'
$env:FRAGMENT_CMS_TEST_BRANCH = 'cms-test'
$env:FRAGMENT_CMS_OAUTH_ORIGIN = 'https://fragment-oauth-test.<subdomain>.workers.dev'
npm run build
```

이 빌드는 별도 테스트 호스트에 제공할 산출물이다. 플래그가 없으면 기존 운영 인증 준비 안내가 유지된다. 플래그가 있어도 필수 설정이 잘못되면 CMS를 열지 않고 오류 안내를 표시한다. 운영 저장소와 `main`/`master` 브랜치는 테스트 설정에서 거부한다. `FRAGMENT_CMS_LOCAL=1`과 동시에 사용할 수 없다. 테스트 모드 화면에는 저장소와 브랜치를 표시한다.

같은 터미널에서 일반 작업으로 돌아갈 때는 설정을 지운다.

```powershell
Remove-Item Env:FRAGMENT_CMS_OAUTH_TEST, Env:FRAGMENT_CMS_TEST_REPO, Env:FRAGMENT_CMS_TEST_BRANCH, Env:FRAGMENT_CMS_OAUTH_ORIGIN -ErrorAction SilentlyContinue
```

## 확인된 한계와 A04-2

- 여러 팝업 로그인을 동시에 시작하면 최신 쿠키로 교체되어 이전 시도는 거부된다. 한 번에 한 로그인 흐름을 사용한다.
- GitHub 권한 거부 mock에서 Decap은 repo 접근 오류를 표시하지만 `Logging in...` 버튼이 비활성 상태로 남는다. 성공으로 처리되지는 않는다. 권한·대상을 고친 뒤 새로고침해야 하며 개선은 G05/G06에서 다룬다.
- scope 응답이 `public_repo` 이외 범위를 포함하면 거부한다. 같은 OAuth App에서 예전에 넓은 범위를 승인했다면 승인 범위를 확인하고 필요하면 기존 승인을 해제한 뒤 다시 로그인한다.
- refresh token은 팝업에 전달하지 않으며 자동 갱신을 구현하지 않았다. 실제 access token 만료·재로그인·편집 입력 보존은 G05/G06에서 검증해야 한다.
- 외부 배포 전에는 실제 테스트 저장소·브랜치, HTTPS 관리 화면, Worker 주소, OAuth App과 Secret 설정이 필요하다. A04-2에서 로그인 → 실제 커밋 → 다른 세션 읽기·수정 증거를 남긴다. 로컬 테스트 통과를 실제 인증 성공으로 기록하지 않는다.
