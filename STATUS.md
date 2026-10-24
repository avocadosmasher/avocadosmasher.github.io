# 현재 상태

> **에이전트 읽기 규칙**: 세션 시작에는 이 파일만 읽는다. 과거 작업이 필요하면 `docs/log/INDEX.md`에서 항목을 고르고 **그 파일 하나만** 연다. 로그 전체를 통독하지 않는다.

콘텐츠 작업 범위를 확인한 뒤 읽을 공통 문서: [작업·판정 절차](./AGENTS.md), [프로젝트 구조·명령](./CLAUDE.md), [AI 콘텐츠 작업 규약](./docs/guide/AI-콘텐츠-작업규약.md). 필요한 문서만 선택해 읽고 규약 원문을 AI별로 복제하지 않는다.

최종 갱신: 2026-10-24

## 지금

- 현재 작업: **NSEC02A — main 보안 변경 개발 브랜치 동기화 검토**. 사용자 PR #9 병합 후 후속 진행 요청에 따라 별도 폴더에서 준비함.
- 작업 브랜치: `sync/node24-ai-content`, 폴더: `.worktrees/node24-ai-content/`임. 원본 `feat/ai-content-tools` HEAD `f839692`에 main `6a8a60bd3fcaab7c7fa16737f02a826f2246dd5a`를 --no-commit 병합한 상태임.
- 마지막 통과: **NSEC01** 사용자 통과·`64d3ca2` 커밋/push·PR #9 병합 완료함. [main 검사·실제 배포](https://github.com/avocadosmasher/avocadosmasher.github.io/actions/runs/40079677559) 모두 성공하고 두 작업의 Node24.22.1 확인함.
- 운영 확인: 홈·블로그·Fragments HTTP200, 카드7개·작성 창·운영 OAuth 설정·로그인 버튼 확인함. 브라우저 오류0·비조회 요청0이며 로그인/저장/발행은 미실행함.
- 병합 범위: 공통 Node24 기준과 main의 발행 콘텐츠6파일 수용함. STATUS·로그 메뉴판 충돌만 기존 기록을 보존해 해결함. src/content는 main과 동일함.
- 자동 검사: clean install·618개 테스트·타입128파일 오류/경고0·기존힌트5·운영 빌드11페이지·preview7·OAuth33·초안15·H01 4·H02 3 통과함.
- AI 추가 검사: 콘텐츠 글13/Fragment7·오류0·기존예외4·미사용예외0, 템플릿4사례와 네 대상 실제 CLI 격리 빌드 통과함. workflow의 기존 콘텐츠·격리 빌드 단계와 CLI 명령 유지함.
- 원본 보존: 원래 Blog 폴더의 스테이징 삭제3건과 ai-content-tools 폴더의 미승인 AIR01 스테이징6파일·기존 HEAD는 그대로 둠. 새로운 통과를 AIR01 또는 M01/M02의 통과로 해석하지 않음.
- 판정 대기: 현재 동기화 검토 트리임. 사용자 통과 전 커밋·push·원본 브랜치 전진 없음. 기존 NSEC01의 통과를 새 병합 트리의 승인으로 사용하지 않음.
- 다음 할 일: [후속 검증 보고](./docs/guide/Node.js-보안-후속-동기화.md)를 열고 현재 변경 설명 후 판정 대기함. 통과 후 각 병합 트리 승인→커밋→개발 push→원격 검사, 원본 반영 시 미승인 변경을 대조·보존함.
- 설치 예외 유지: NSEC01 MSI 구버전 제거에서 앱 종료·재시작 기록 발생함. 이번 후속은 MSI·프로세스 강제 종료·OS 변경 없음. 종료 작업의 미저장 상태 복원과 실제 외부 계정 흐름은 미확인임.
- 현재 적용 경계: `node scripts/content-ops.mjs plan/apply/recover`는 네 대상 생성·부분 수정·계획 전후 상태의 명시적 복구를 지원함. 프로젝트 전체 selector·카테고리 키 충돌·설정 전체 지문·Fragment 명시한 상대 연결 제거 기준 유지함. apply/recover는 저장소 잠금으로 보호함. 미완료 저널은 새 적용을 중단시킴. 같은 호스트의 종료된 소유자만 recover가 점유 가능하며 중단된 recover 점유 자체·확인 불가능한 잠금은 자동 해제하지 않음. local 준비 바이트는 본문/자산을 포함할 수 있으며 Git 제외임. 손상된 중간 파일·외부 수정은 덮어쓰지 않음. 최종 기준 확인/rename 사이 외부 쓰기의 원자적 차단·완전한 다중 파일 트랜잭션은 미보장임. 기존 사용자 승인 뒤 실제 Git 대상의 콘텐츠 정책 검사와 공통 verify 연결함. 도구가 Git 승인·커밋·push를 수행하지 않으며 CI 성공도 대화 승인 인증이 아님.
- 기존 미등록 Infra 4건은 `config/content-policy-baseline.json`에 규칙·정확한 경로·문제 값으로 기록함. 현재 수집 콘텐츠 검사에서 오류 0건·기존 예외 4건·미사용 예외 0건 확인함. 운영 원문은 변경하지 않음.
- ACTK01 파일 교체 EPERM 1건의 원인은 미확정으로 유지함. 이번에는 교체 EBUSY·기록 생성 EACCES를 주입해 원문 보존·재시도를 검증했으며 모든 실제 파일 점유 원인 재현을 주장하지 않음. 별도로 전체 테스트 시작 시 샌드박스 spawn EPERM이 발생해 권한 환경을 명시한 동일 검사 재실행으로 해결함. 기존 사례 생략 없음.
- 기존 별도 건: M01·M02의 통과 판정 증거는 이 대화에서 미확인. 기존 상태를 유지하고 AI-BLOG 승인과 혼동하지 않는다.

## 최근 3건

1. **NSEC02A** (2026-10-24, 검토 자료): main 보안·발행 콘텐츠를 별도 폴더에서 병합하고 기존 개발 기능과 사용자 원본을 보존해 검증함. → [로그](./docs/log/87-NSEC02A.md)
2. **NSEC01** (2026-10-24, 통과 `64d3ca2`): Node24 보안 업데이트·PR #9 병합·main 배포 성공함. → [최초 검토 로그](./docs/log/57-NSEC01.md)
3. **ACWV01** (2026-10-20, 통과 `f839692`): 기존 AI 작업공간 개발 최종 통과 이력 보존함. → [로그](./docs/log/86-ACWV01.md)

## 문서가 있는 곳

| 찾는 것 | 위치 |
| --- | --- |
| 작업 절차·판정 규칙 | `AGENTS.md` |
| 프로젝트 구조·명령 | `CLAUDE.md` |
| 과거 작업 이력 | `docs/log/INDEX.md` (메뉴판 → 항목별 파일) |
| main 배포 확인·개발 브랜치 동기화 검토 | `docs/guide/Node.js-보안-후속-동기화.md` |
| Node.js 보안 업데이트 영향·계획 | `docs/plan/Node.js-보안-업데이트-개발계획.md` |
| Node.js 최초 검증·MSI 설치 예외 | `docs/guide/Node.js-보안-업데이트-검증.md` |
| 현재 작업공간 분리 계획과 완료 기준 | `docs/plan/AI-콘텐츠-작업공간-분리-개발계획.md` |
| 콘텐츠 작업공간·HANDOFF·선택 초안·인계 실제 예시 | `templates/ai-content/workspace/README.md` |
| 작업공간 실제 CLI·회귀·완료 기준·미보장 | `docs/AI-콘텐츠-작업공간-분리-최종보고서.md` |
| 작업공간 구조 선택·세 검토 결과·전환 경계 | `docs/decision/AI-콘텐츠-작업공간-분리-설계결정.md` |
| 완료된 선행 2차 계획과 증거 | `docs/plan/AI-콘텐츠-자동화-2차-개발계획.md` |
| 2차 실제 사용·요청 8개·인계·실패 대응 | `docs/guide/AI-콘텐츠-자동화-운영가이드.md` |
| 2차 최종 증거·원격 CI·보장/미보장·후속 | `docs/AI-콘텐츠-자동화-2차-최종보고서.md` |
| 2차 기존 예외·기록·쓰기·절차 선택 근거 | `docs/decision/AI-콘텐츠-자동화-2차-설계결정.md` |
| 2차 검사 모듈의 진단 예시와 현재 보장 범위 | `docs/guide/AI-콘텐츠-검사기-개발현황.md` |
| 읽기 전용 검사 CLI 명령·결과·종료 코드 | `docs/guide/AI-콘텐츠-검사-CLI-사용법.md` |
| 도구 요청 JSON·계획·완료 기록·1차 요청서 대응 | `docs/guide/AI-콘텐츠-요청-계약.md` |
| 글 생성·부분 수정 plan/apply·원문 보존·재실행·충돌·실패 범위 | `docs/guide/AI-콘텐츠-글-생성-CLI.md` |
| Fragment 고정 ID·부분 수정·관련 카드 연결 제거·재실행·한계 | `docs/guide/AI-콘텐츠-Fragment-CLI.md` |
| 카테고리 고정 키·색·원문 범위 편집·설정 전체 기준·한계 | `docs/guide/AI-콘텐츠-카테고리-CLI.md` |
| 프로젝트 원래 전체 항목·후보 충돌·부분 수정·원문 보존·한계 | `docs/guide/AI-콘텐츠-프로젝트-CLI.md` |
| 동시 적용 잠금·원래 요청/계획 복구·손상 거절·잠금 회수 한계 | `docs/guide/AI-콘텐츠-잠금-복구-CLI.md` |
| 승인 유지·실제 스테이징/전송 Git tree 정책·공통 CI·권한/원격 확인 경계 | `docs/guide/AI-콘텐츠-Git-검사-CLI.md` |
| 2차에서 보존하는 기존 정책 예외 | `config/content-policy-baseline.json` |
| AI-BLOG 개발 계획과 남은 작업 | `docs/plan/AI-블로그-작업-개발계획.md` |
| AI 콘텐츠 작업의 공통 계약 | `docs/guide/AI-콘텐츠-작업규약.md` |
| 다른 AI에 평소 작업을 맡기는 시작점 | `docs/guide/AI-콘텐츠-운영가이드.md` |
| AI-BLOG 1차 산출물·검증·한계·완료 증거 | `docs/AI-블로그-작업-최종보고서.md` |
| 다른 세션·AI에 전달할 요청·인계·완료 보고 | `docs/guide/AI-콘텐츠-작업지시문.md` |
| 신규 콘텐츠 파일 템플릿과 사용 안내 | `templates/ai-content/README.md` |
| 격리 예시·실제 데이터 계약 검사와 한계 | `docs/guide/AI-콘텐츠-검증결과.md` |
| 세션 인계·재실행 검사와 실제 자동 보장의 구분 | `docs/guide/AI-콘텐츠-인계-검증결과.md` |
| 기존 Fragment 개발 계획 | `docs/plan/Fragment-TDD-개발계획.md` |
| AI-BLOG 개발 범위와 분리 근거 | `docs/decision/AI-블로그-작업-개발범위.md` |
| 왜 그렇게 정했나 | `docs/decision/` |
| 개발 결과 총정리 | `docs/Fragment-개발-최종보고서.md` |
| 사람이 읽는 운영법 | `docs/guide/` |
| 끝난 단계의 기록 | `docs/archive/` |

## 알아 둘 것

- 사용자 확인이 필요한 파일은 에이전트가 안내할 때 직접 연다. 상세 절차는 `AGENTS.md`의 수동 검증 준비 항목을 따른다.
- 커밋·push는 사용자의 명시적 **통과** 판정 뒤에만. 훅(`.githooks`)이 승인 트리를 검사한다.
- `fragments-draft` push는 CI를 돌리지 않는다. 검사는 발행 시점의 배포 경로에서 수행한다.
- 로컬에서는 운영 OAuth 로그인이 불가능하다(Worker가 운영 도메인만 허용).
