# 현재 상태

> **에이전트 읽기 규칙**: 세션 시작에는 이 파일만 읽는다. 과거 작업이 필요하면 `docs/log/INDEX.md`에서 항목을 고르고 **그 파일 하나만** 연다. 로그 전체를 통독하지 않는다.

최종 갱신: 2026-10-24

## 지금

- 현재 작업: **NSEC02F — main 보안 변경 개발 브랜치 동기화 검토**. 사용자 PR #9 병합 후 후속 진행 요청에 따라 별도 폴더에서 준비함.
- 작업 브랜치: `sync/node24-fragments`, 폴더: `.worktrees/node24-fragments/`임. 원본 `feat/fragments` HEAD `f2d0081`에 main `6a8a60bd3fcaab7c7fa16737f02a826f2246dd5a`를 --no-commit 병합한 상태임.
- 마지막 통과: **NSEC01** 사용자 통과·`64d3ca2` 커밋/push·PR #9 병합 완료함. [main 검사·실제 배포](https://github.com/avocadosmasher/avocadosmasher.github.io/actions/runs/40079677559) 모두 성공하고 두 작업의 Node24.22.1 확인함.
- 운영 확인: 홈·블로그·Fragments HTTP200, 카드7개·작성 창·운영 OAuth 설정·로그인 버튼 확인함. 브라우저 오류0·비조회 요청0이며 로그인/저장/발행은 미실행함.
- 병합 범위: 공통 Node24 기준과 main의 발행 콘텐츠6파일 수용함. STATUS·로그 메뉴판 충돌만 기존 기록을 보존해 해결함. src/content는 main과 동일함.
- 자동 검사: clean install·109개 테스트·타입81파일 오류/경고0·기존힌트5·운영 빌드11페이지·preview7·OAuth33·초안15·H01 4·H02 3 통과함.
- 원본 보존: 원래 Blog 폴더의 스테이징 삭제3건과 ai-content-tools 폴더의 미승인 AIR01 스테이징6파일·기존 HEAD는 그대로 둠. 새로운 통과를 AIR01 또는 M01/M02의 통과로 해석하지 않음.
- 판정 대기: 현재 동기화 검토 트리임. 사용자 통과 전 커밋·push·원본 브랜치 전진 없음. 기존 NSEC01의 통과를 새 병합 트리의 승인으로 사용하지 않음.
- 다음 할 일: [후속 검증 보고](./docs/guide/Node.js-보안-후속-동기화.md)를 열고 현재 변경 설명 후 판정 대기함. 통과 후 각 병합 트리 승인→커밋→개발 push→원격 검사, 원본 반영 시 미승인 변경을 대조·보존함.
- 설치 예외 유지: NSEC01 MSI 구버전 제거에서 앱 종료·재시작 기록 발생함. 이번 후속은 MSI·프로세스 강제 종료·OS 변경 없음. 종료 작업의 미저장 상태 복원과 실제 외부 계정 흐름은 미확인임.

## 최근 3건

1. **NSEC02F** (2026-10-24, 검토 자료): main 보안·발행 콘텐츠를 별도 폴더에서 병합하고 기존 개발 기능과 사용자 원본을 보존해 검증함. → [로그](./docs/log/60-NSEC02F.md)
2. **NSEC01** (2026-10-24, 통과 `64d3ca2`): Node24 보안 업데이트·PR #9 병합·main 배포 성공함. → [최초 검토 로그](./docs/log/57-NSEC01.md)
3. **M02** (2026-09-27, 기존 상태 유지): 방법론 검토 보완 기록의 별도 판정은 이번 작업에서 대신하지 않음. → [로그](./docs/log/59-M02.md)

## 문서가 있는 곳

| 찾는 것 | 위치 |
| --- | --- |
| 작업 절차·판정 규칙 | `AGENTS.md` |
| 프로젝트 구조·명령 | `CLAUDE.md` |
| 과거 작업 이력 | `docs/log/INDEX.md` (메뉴판 → 항목별 파일) |
| main 배포 확인·개발 브랜치 동기화 검토 | `docs/guide/Node.js-보안-후속-동기화.md` |
| Node.js 보안 업데이트 영향·계획 | `docs/plan/Node.js-보안-업데이트-개발계획.md` |
| Node.js 최초 검증·MSI 설치 예외 | `docs/guide/Node.js-보안-업데이트-검증.md` |
| 개발 계획과 남은 작업 | `docs/plan/Fragment-TDD-개발계획.md` |
| 왜 그렇게 정했나 | `docs/decision/` |
| 개발 결과 총정리 | `docs/Fragment-개발-최종보고서.md` |
| 사람이 읽는 운영법 | `docs/guide/` |
| 끝난 단계의 기록 | `docs/archive/` |

## 알아 둘 것

- 커밋·push는 사용자의 명시적 **통과** 판정 뒤에만. 훅(`.githooks`)이 승인 트리를 검사한다.
- `fragments-draft` push는 CI를 돌리지 않는다. 검사는 발행 시점의 배포 경로에서 수행한다.
- 로컬에서는 운영 OAuth 로그인이 불가능하다(Worker가 운영 도메인만 허용).
