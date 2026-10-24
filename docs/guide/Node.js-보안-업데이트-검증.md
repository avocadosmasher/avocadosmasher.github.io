# Node.js 보안 업데이트 영향·조치·검증

기준일: 2026-10-24 · 작업: NSEC01 · 브랜치: `chore/node-security-20261024`

## 결과

PC의 Node.js를 24.14.0에서 보안 수정 버전인 **24.22.1**로 업데이트했습니다. 기존 npm 11.12.1과 전역 CLI 패키지는 유지했습니다. GitHub Actions의 두 검사 작업도 같은 버전 파일을 읽도록 수정했으며, 이 저장소 변경은 아직 사용자 통과·커밋·push·main 반영 전입니다. 따라서 **PC 설치 완료와 운영 CI 적용 완료를 구분**해야 합니다.

기능·OAuth 모의 연동·초안/발행·모바일 검사는 통과했습니다. 성능 검사에서는 실제 렌더 시간과 테스트 러너 대기를 섞어 측정하던 문제를 찾아 측정 방식을 보완했습니다. 앱의 그래프 코드는 바꾸지 않았고, 기존 로컬 2초·CI 3초 기준도 유지했습니다.

**중요한 설치 예외가 있었습니다.** 새 MSI에 앱 자동 종료를 막는 옵션을 전달했지만, 기존 버전 제거 단계의 별도 Installer 세션에서는 Restart Manager의 앱 종료·재시작 기록이 확인됐습니다. 사전에 안내한 “앱 강제 종료 없이 적용”을 설치 과정 전체에서 보장하지 못했습니다. 종료된 작업의 메모리 상태나 입력 복구는 확인할 수 없으며, 사용하던 개발 서버·Node 기반 CLI를 다시 실행하고 필요한 작업 상태를 확인해야 합니다.

## 영향 분석과 선택

| 대상 | 업데이트 전 상태 | 선택한 대응 |
| --- | --- | --- |
| PC | Windows x64 MSI Node 24.14.0 | 같은 24 계열의 보안 릴리스 24.22.1 적용 |
| 운영 빌드 | 2026-10-14 마지막 배포 로그에서 Node 20.20.2 | `.node-version`을 읽도록 CI 수정, main 반영은 아직 대기 |
| 기존 패키지 | Wrangler·Miniflare 등은 이미 Node >=22 요구, sanitize-html은 >=22.12 요구 | Node24에서 기존 lock 그대로 깨끗한 설치 검증 |
| 네이티브 모듈 | esbuild·sharp·workerd 포함 | 이미지 빌드와 Miniflare/SQLite Durable Object 통합 검사로 검증 |
| npm | 실제 PC npm 11.12.1, 공식 ZIP npm 11.19.1 | 두 npm 모두 같은 lock 설치 성공, PC npm과 전역 패키지 버전은 보존 |
| TLS·DNS·fetch | 보안 릴리스에서 OpenSSL·Undici·인증서·DNS 수정 포함 | 기존 mock OAuth·초안·발행·로컬 서버 흐름 검증. 실제 운영 로그인은 별도 경계 |
| 전역 CLI | Claude Code·Gemini CLI·gws·graft·Codex의 엔진 조건은 새 Node와 호환 | 새 Node에서 비파괴 버전 조회 5종 성공. 각 도구의 모든 계정 작업을 검증한 것은 아님 |
| 실행 중인 앱 | 업데이트 전 Program Files Node 프로세스 18개 관찰 | 강제 종료 명령은 실행하지 않았으나 MSI 구버전 제거의 Restart Manager 동작을 막지 못함 |
| 공개 블로그 | Astro 정적 산출물을 GitHub Pages에 게시 | 콘텐츠·UI·공개 API·인증 권한·배포 트리거는 변경하지 않음 |
| Cloudflare OAuth Worker | Cloudflare 관리 런타임에서 실행 | Worker 배포·설정 변경 없음. PC 업데이트로 공급자 자체 런타임의 패치를 인증하지 않음 |

Node 26으로 주 버전을 추가 변경하거나 npm 패키지를 일괄 갱신하면 런타임 수정과 패키지 수정의 원인을 분리하기 어렵습니다. PC가 이미 사용하던 24 계열을 유지하고, lock의 루트 engines 외 의존성·버전·integrity를 그대로 보존했습니다. Windows ia32 전용 sharp 선택 패키지의 Node 엔진 차이는 조사했으며, 현재 x64 환경에서 설치되는 패키지와 구분했습니다.

## 적용한 저장소 변경

- `.node-version`: 재현 가능한 기준 버전 `24.22.1` 지정.
- `.github/workflows/verify.yml`: 두 `actions/setup-node` 단계가 `.node-version` 참조.
- `package.json`: `engines.node`를 `>=24.22.1 <25`로 지정.
- `.npmrc`: `engine-strict=true`로 구형 Node에서 설치하는 실수 차단.
- `package-lock.json`: 루트 engines만 동기화, 의존성 그래프 불변 확인.
- `CLAUDE.md`: 기존 Node 18 이상 안내를 새 기준과 재시작 안내로 정정.
- `tests/integration/node-runtime-policy.test.ts`: CI 버전 참조·설치 정책의 재발 방지 검사 2개 추가.
- `tests/h02/performance.spec.ts`: 실제 사용자 클릭→그래프 준비를 브라우저 내부 시계로 측정하도록 보완.

`.node-version`은 CI의 정확한 버전 기준이며 engines는 허용 하한입니다. 향후 24 계열 보안 릴리스가 나오면 버전 파일을 갱신하고 검증해야 합니다. Node 26 등 다른 주 버전은 별도 호환성 확인 후 engines 범위도 함께 조정합니다.

## 자동 검증 결과

| 검사 | 결과와 의미 |
| --- | --- |
| 공식 파일 확인 | ZIP·MSI SHA-256 일치, MSI OpenJS Foundation 서명 Valid |
| 설치 전 기준 | 기존 Node에서 테스트 107개 통과, 타입 79파일 오류 0·경고 0·기존 힌트 5, 운영 옵션 빌드 성공 |
| 보안 정책 Red | 버전 파일·엔진 제한 없는 기존 상태에서 새 검사 2개 실패 확인 |
| 새 런타임 설치 | 공식 ZIP의 Node 24.22.1 + npm 11.19.1로 clean npm ci 성공 |
| 엔진 정책 실제 실행 | 같은 프로젝트 정책을 복사한 격리 npm ci에서 Node24.14는 EBADENGINE, Node24.22.1은 성공 |
| 단위·통합 | 운영 기준 코드 18파일·109개 통과, Miniflare의 실제 로컬 Workers/SQLite 통합 검사 포함 |
| 최종 타입 | 성능 측정 보완 포함 80파일 오류 0·경고 0·기존 힌트 5 |
| 배포 산출물 | 각 버전 비교 빌드의 11페이지·이미지 포함 파일 40개 SHA-256 전부 동일 |
| Preview E2E | 빌드 산출물 대상 7개 통과 |
| OAuth E2E | 외부 계정 없이 모의 GitHub·OAuth 연동 33개 통과 |
| 초안·발행 E2E | 격리된 단독 실행에서 15개 통과 |
| 모바일·테마·접근성 | H01 4개 통과 |
| 대규모 성능 | H02 3개 사례를 각각 3회 반복, 9개 통과·skip 0. 그래프 1304/1528.1/1306.9ms |
| 미병합 AI 글쓰기 기능 | 기존 `feat/ai-content-tools` 코드 33파일·616개를 새 Node로 실행해 통과, 해당 브랜치 파일 변경 없음 |
| PC 실제 설치 후 | Node24.22.1·npm11.12.1로 clean npm ci 및 109개 테스트 통과 |
| 실제 Node 바이너리 | Program Files node.exe가 해시 대조한 공식 ZIP의 node.exe와 동일, 정상 Brotli 압축/해제 왕복 통과 |
| 원격 Linux CI | 현재 변경은 미커밋이므로 아직 실행하지 않음. 최종 통과 후 개발 push로 확인 필요 |

### 발견한 실패와 대응

**초안 검사 실행 간섭:** 비교 빌드와 개발 서버 검사를 같은 폴더에서 겹쳐 실행했던 회차에서 초안 E2E 15개가 실패했습니다. 이후 이전 Node와 새 Node를 각각 단독 실행하자 모두 15개 통과했습니다. 최초 실패의 정확한 원인은 미확정입니다. 후속 빌드·E2E는 같은 작업 폴더에서 순서대로 실행했고 앱 코드를 바꾸거나 기대값을 낮추지 않았습니다.

**빌드 비교:** 첫 해시 대조에서 Fragment HTML 1개가 달랐습니다. 이전 런타임을 같은 설정으로 별도 폴더에 다시 빌드한 결과 새 런타임 산출물 40개와 모두 일치했습니다. 첫 차이의 원인은 확정하지 않았으며, 최초부터 모든 출력이 같았다고 표시하지 않습니다.

**그래프 측정 오류:** 기존 검사는 Node 프로세스의 Date.now()로 Playwright의 클릭 자동 대기와 expect 재시도 시간까지 포함했습니다. 새 Node에서 전체 H02는 2029ms·2018ms로 실패했고 별도 계측도 러너 2042ms 대 브라우저 약 1576ms 차이를 확인했습니다. 비교 3회는 이전 Node 1756~1991ms, 새 Node 1994~1998ms였으나 이를 성능 개선의 증거로 삼지 않았습니다. 실제 브라우저 클릭부터 상태·캔버스가 준비된 프레임까지 측정하도록 바꾼 뒤 전체 9개가 기존 기준 안에서 통과했습니다. 실제 노드 선택→팝업 검증도 유지했습니다.

**검증 도구 오류:** PowerShell의 ConvertFrom-Json은 lock의 빈 문자열 루트 키를 처리하지 못해 해당 비교를 Node JSON 파서로 교체했습니다. 설치 후 첫 npm 검사도 일반 deprecated 경고를 PowerShell ErrorAction=Stop이 오류로 처리해 중단됐습니다. 실제 npm 종료 코드를 판정하는 방식으로 재실행해 clean install·109개 통과를 확인했습니다. 코드 실패와 검증 도구 오류를 구분했습니다.

## PC 설치 및 중요한 예외

공식 ZIP을 작업 폴더에 풀어 먼저 검증한 다음, SHA-256과 서명을 다시 확인한 공식 MSI를 관리자 권한으로 실행했습니다. 설치 결과는 **exit 0**, Windows 설치 목록과 새 node.exe 실행 모두 **24.22.1**입니다. 자동 재부팅은 하지 않았고 재부팅 필요 코드 3010도 반환되지 않았습니다.

설치에는 `REBOOT=ReallySuppress`와 `MSIRESTARTMANAGERCONTROL=Disable`을 전달했습니다. 로그는 새 설치 세션에서 Restart Manager 비활성화를 확인했지만, **구버전 제거의 별도 세션에서 파일을 사용 중인 Node 프로세스를 열거하고 앱 종료·재시작을 수행한 기록**도 남겼습니다. 설치 전 관찰한 18개 PID 중 설치 후 17개가 없었으나, 그 전부의 종료 원인을 MSI로 단정할 수는 없습니다. 영향받은 모든 명령과 미저장 상태는 복원·확인하지 못했습니다.

앞으로 실행 중인 작업 보존이 필요한 PC 업데이트에서는 이 MSI 옵션 하나를 전체 업그레이드의 보호 장치로 취급하지 않습니다. 검증된 휴대용 런타임으로 먼저 작업을 검증하고, 시스템 설치는 개발 서버·CLI 작업을 저장하고 종료한 시점에 수행해야 합니다. 이 사건 때문에 운영 블로그나 Cloudflare Worker가 재배포된 것은 아닙니다.

이미 켜져 있던 터미널·개발 서버·Node 기반 CLI는 필요한 작업을 저장한 뒤 다시 실행해야 합니다. 현재 Node 파일이 새 버전이어도 살아 있는 과거 프로세스의 메모리에 로드된 코드가 새 코드로 바뀌는 것은 아닙니다.

### 설치 파일과 확인 근거

| 대상 | SHA-256 |
| --- | --- |
| 공식 ZIP | `d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5` |
| 공식 MSI | `3bda4baf1ee709b33cf920dd633106ddb23951e322bff9c03ec9f64ab8981b01` |
| 설치 node.exe = ZIP node.exe | `d702daa815eabbff763c7d3808e235cf031cf2ca70211b56847bc72f51e240e5` |

Brotli 버전 문자열은 패치 후에도 1.2.0입니다. Node 24.22.1은 수정 커밋을 backport했으므로 이 문자열만으로 취약 여부를 판단하면 안 됩니다. 실제 설치 버전·공식 바이너리 일치·추가된 오류 상수(-17)·정상 데이터 왕복을 확인했으며 악용 입력은 실행하지 않았습니다.

검사 로그·공식 다운로드·MSI 설치 로그는 Git에서 제외된 `.fragment-test/node-security/`에 있습니다. 이 폴더는 사용자 환경 증거와 재개용 자료이며 배포 산출물이나 감사용 버전 기록은 아닙니다.

## 남은 단계와 적용 경계

1. 현재 저장소 변경에 대한 사용자 통과 후 승인 기록·보안 브랜치 커밋·push.
2. 해당 커밋의 실제 Linux CI 결과 확인.
3. 사용자가 PR로 main 반영 선택. 그 전까지 운영 workflow의 Node20 설정은 유지됩니다.
4. 운영 반영 후 필요한 실제 로그인·저장·발행 흐름 확인. 현재 mock 결과가 실제 계정 연동을 인증하지는 않습니다.

기존 `feat/fragments`·`feat/ai-content-tools`의 workflow에도 아직 Node20 설정이 남아 있습니다. main 반영 뒤 해당 개발 브랜치가 새 기준을 병합·동기화해야 그 브랜치의 후속 CI에도 적용됩니다. 현재 미승인 변경을 섞어 저장하지 않기 위해 다른 worktree의 파일은 수정하지 않았습니다.

GitHub Action 자체 실행기의 Node와 setup-node로 선택한 프로젝트의 Node도 별개입니다. GitHub는 Action 실행기를 2026-09-23 이후 Node24로 전환했다고 공지했지만, 이 저장소의 버전 파일이 공급자 내부 런타임의 정확한 보안 패치까지 지정하지는 않습니다. Cloudflare 관리 런타임과 다른 PC 프로젝트·별도 실행 파일에 포함된 Node도 이번 검사로 일괄 인증하지 않습니다.

보안 수정 전 Node로 되돌리는 것을 문제 해결책으로 사용하지 않습니다. 문제가 있는 도구는 보안 수정된 런타임에서 해당 도구를 격리해 재현하고 조치해야 합니다. 저장소 설정은 현재 보안 브랜치에서 재검토 가능하며, 운영 배포·권한·글 내용은 이 작업에서 변경하지 않았습니다.

## 계획과 공식 근거

- [영향 분석·개발 계획](../plan/Node.js-보안-업데이트-개발계획.md)
- [Node.js 2026-10 보안 공지](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Node.js 24.22.1 릴리스](https://nodejs.org/en/blog/release/v24.22.1)
- [공식 다운로드·해시](https://nodejs.org/dist/v24.22.1/)
- [확인한 운영 배포 로그](https://github.com/avocadosmasher/avocadosmasher.github.io/actions/runs/38569754287)
- [GitHub Actions 자체 Node24 전환](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)
- [Windows Installer Restart Manager 옵션](https://learn.microsoft.com/en-us/windows/win32/msi/msirestartmanagercontrol)
- [Windows Installer 재부팅 옵션](https://learn.microsoft.com/en-us/windows/win32/msi/reboot)
