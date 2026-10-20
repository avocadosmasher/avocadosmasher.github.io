# AI 콘텐츠 자동화 운영 가이드

다른 AI에게 같은 작업을 넘길 때는 **확정 요청 원문·실제 대상·기준 파일 지문을 함께 넘긴다.** 저장소 Tool은 그 입력으로 계획을 만들고 실제 결과를 다시 확인한다. 같은 자연어를 주면 같은 본문을 생성한다는 보장은 아니며, 처음 확정한 입력을 유지하는 방식이다.

이 가이드는 AI-CONTENT-TOOLS 2차의 최종 사용 흐름이다. 사람이 평소 위임을 시작하는 문장은 [AI에게 맡기는 방법](./AI-콘텐츠-운영가이드.md), 정책 원문은 [작업 규약](./AI-콘텐츠-작업규약.md), 기계 입력의 정확한 구조는 [요청 계약](./AI-콘텐츠-요청-계약.md)을 따른다.

## 사용할 버전과 작업 폴더

자료와 프로그램은 현재 feat/ai-content-tools 브랜치의 .worktrees/ai-content-tools 작업 폴더에 있다. 1차 규약·템플릿도 이 브랜치에 포함된다. 1차 브랜치나 main에 자동 반영한 상태로 가정하지 않는다. 코드 검증 기준은 ACTH01 통과 커밋 8065fd6이며 [원격 CI](https://github.com/avocadosmasher/avocadosmasher.github.io/actions/runs/39275844500)도 성공했다. 최종 운영 문서·예시·호환성 검사는 ACTA01 마감 자료다.

AI는 그 작업 폴더의 STATUS.md부터 읽고 현재 브랜치와 사용자의 기존 변경을 확인한다. 기존 작업을 정리하려고 임의 reset·stash·브랜치 전환을 하지 않는다. 로컬 실행은 해당 프로젝트의 Node·의존성이 준비된 루트에서 수행한다. 새 체크아웃의 훅 활성화는 AGENTS를 따르며 기존 커스텀 훅은 덮어쓰지 않는다.

## 한 작업의 기본 순서

1. 기존 글·카드·카테고리·프로젝트 후보와 원본을 조회한다. 제목·이름만 보고 신규로 단정하지 않는다.
2. 본문·날짜·경로·ID·색·프로젝트 사실 등 결과를 바꾸는 값을 확정한다. 읽을 수 있는 값은 AI가 확인하고 의도가 필요한 값만 사용자에게 묻는다.
3. 요청 ID를 정해 JSON 원문과 실제 기준 SHA-256을 보존한다. 재실행할 때 본문·날짜·ID를 다시 만들지 않는다.
4. plan으로 변경안을 준비한다. 적용 대상을 확인한 같은 계획 지문으로 apply를 실행해 로컬 검토 파일을 만든다.
5. 요청 밖 값 보존과 실제 결과를 검사한다. 같은 요청 재실행은 이미 반영된 결과를 새 파일·ID로 복제하지 않아야 한다.
6. 관련 자동 검사·로그·해당 파일 스테이징을 마친다. 사람이 판단할 내용과 근거를 설명하고 필요한 파일을 연다.
7. 현재 변경의 명시적 사용자 통과 뒤 기존 승인 명령·커밋·개발 브랜치 push를 수행한다. main 병합·운영 발행은 별도 범위다.

apply는 사용자가 검토할 로컬 변경을 만드는 단계다. 계획 해시나 완료 기록은 사용자 통과 판정이 아니다. 자동 판정 가능한 CLI 실행·diff 확인을 사용자에게 반복 요청하지 않는다. 실제 문구·사실·화면 등 사람이 봐야 아는 항목만 직접 확인을 요청한다.

## 확정 요청을 준비하는 방법

[요청 예시 모음](../../templates/ai-content/operation-requests.example.json)은 네 대상의 생성·수정 8개를 담는다. **모음 전체는 CLI 입력이 아니다.** 필요한 항목의 request 객체 하나만 복사해 사용한다. 예시의 이름·본문·기간·색·날짜는 합성 자료이며, 64자리 0 지문은 실제 기준으로 채워야 할 자리다. 예시를 운영 폴더에 시험 등록하지 않는다.

| 작업 | 실제 대상 | 확정할 생성/수정 값 |
| --- | --- | --- |
| blog/create | 새 폴더/index.md, 기준 null | frontmatter 포함 content.source, 날짜·draft·본문·새 자산 |
| blog/update | 원래 글의 실제 path, 파일 SHA-256 | changes의 허용 필드·body만 |
| fragment/create | 확정 id와 같은 id.md, 기준 null | 원문 id까지 같은 content.source |
| fragment/update | 실제 기존 path·id, 파일 SHA-256 | changes와 명시한 관련 카드의 기준 |
| category/create | src/consts.ts·확정 key, 전체 파일 SHA-256 | content.color |
| category/update | 같은 path·기존 key, 전체 파일 SHA-256 | changes.color |
| project/create | src/consts.ts, 전체 파일 SHA-256 | 현행 ProjectItem 한 항목인 content |
| project/update | 같은 path·원래 항목 전체 selector, 전체 파일 SHA-256 | 바꿀 현행 필드만 changes |

카테고리·프로젝트는 신규 항목도 기존 설정 파일을 편집하므로 기준이 null이 아니다. 프로젝트에는 새 ID·배열 순번을 넣지 않는다. Fragment의 related_targets는 단순 참고 목록이 아니라 **그 상대 카드에서 대상 ID로 들어오는 연결을 제거할 목록**이다. 명시하지 않은 카드를 임의로 수정하지 않는다.

기준은 실제 원본 바이트의 SHA-256이다. Git 커밋 ID·GitHub blob SHA와 섞지 않는다. PowerShell에서 현재 설정 파일 기준을 확인하는 예는 다음과 같다.

```powershell
(Get-FileHash -LiteralPath '.\src\consts.ts' -Algorithm SHA256).Hash.ToLowerInvariant()
```

기준을 읽은 뒤 다른 파일 내용으로 바꾸거나, 수정 요청에서 생략한 값을 템플릿의 빈 배열로 덮어쓰지 않는다. 생략은 보존이고 명시한 빈 값은 허용 범위에서 비우기다. 자산은 저장소 안의 준비 파일·새 목적 경로·확정 바이트 지문이 필요하며 기존 자산 덮어쓰기·이동·삭제는 지원하지 않는다.

확정 요청은 예를 들어 .content-ops/local/requests/request.json에 보관할 수 있다. local은 Git 제외이므로 다음 AI가 읽을 수 있는 원문도 함께 인계해야 한다. 공유 완료 기록에는 본문 전체가 없으며 해시만으로 원문을 복구할 수 없다.

## 계획·로컬 적용·재실행

다음은 프로젝트 루트에서 확정한 요청 파일을 사용하는 명령 틀이다. 원래 요청·계획과 확인한 64자리 지문을 지정한다.

```powershell
node scripts/content-ops.mjs plan --request '.content-ops/local/requests/request.json' --out '.content-ops/local/plans/request.json' --json
node scripts/content-ops.mjs apply --request '.content-ops/local/requests/request.json' --plan '.content-ops/local/plans/request.json' --expect-plan '<계획의 64자리 plan_hash>' --json
```

plan은 콘텐츠를 적용하지 않고 로컬 계획 파일을 준비한다. planned이면 파일별 변경과 plan_hash를 확인한다. unchanged이면 이미 원하는 결과이며 새 계획을 억지로 만들지 않는다. 같은 계획 파일의 재실행도 기존 파일을 보존한다.

apply는 입력·계획·현재 기준·정책을 다시 대조한다. applied이면 로컬 대상과 .content-ops/receipts/request-id.json의 최소 완료 기록이 생긴다. 같은 요청·계획으로 즉시 재실행하면 unchanged와 written 빈 목록을 반환해야 한다. 변경 없음이면 같은 쓰기·새 ID·새 개발 로그를 만들지 않는다.

위 추가 쓰기 없음은 콘텐츠·완료 기록·기존 계획 파일 기준이다. 상호 배제를 위한 로컬 잠금 생성·해제와 디렉터리 수정 시각 변화는 발생할 수 있다. 완료 기록 뒤 다른 편집이 있으면 같은 옛 요청도 상태 불일치로 중단할 수 있다. 특히 카테고리·프로젝트 기록은 consts.ts 전체 지문을 대조하므로 다른 설정 편집도 감지한다.

--json 없이 실행하면 사람이 읽을 변경 안내가 나온다. JSON만 처리할 때는 npm의 별도 안내가 섞이지 않는 위 Node 직접 명령을 사용한다. 요청 상대 경로는 터미널 작업 폴더 기준, --root로 지정하는 대상·계획 경로는 그 저장소 기준이다. --root 생략 시 스크립트 소속 저장소를 사용한다. 종료 코드는 0 성공/변경 없음·1 입력/충돌/실패·2 명령 사용 오류다.

## 실패했을 때의 다음 행동

| 상태·진단 | 지켜야 할 처리 |
| --- | --- |
| request.conflict·plan.changed | 원래 요청·계획을 대조한다. 확인 지문만 새 값으로 바꿔 억지 적용하지 않는다 |
| baseline.conflict | 다른 편집을 보존하고 차이를 확인한다. 새 수정으로 확정할 때만 기준·계획을 다시 준비한다 |
| target.conflict·target.ambiguous | 기존 후보·전체 원래 항목을 보고 정확한 작업을 확정한다. 접미사 파일·새 ID·첫 배열 항목으로 우회하지 않는다 |
| receipt.state-mismatch | 이전 완료 기록과 실제 결과가 달라진 상태다. 기존 파일을 옛 결과로 되돌리지 않는다 |
| lock.busy·recovery.required | 실행 중/중단된 작업과 저널을 확인한다. 다른 새 적용보다 원래 작업의 상태 확인을 먼저 한다 |
| recovery.conflict·recovery.staging | 외부 수정·중간 바이트·없거나 손상된 준비 자료를 보존한다. 자동 삭제·덮어쓰기로 맞추지 않는다 |
| lock.unverified·lock.recovery-busy | 확인 불가능한 소유자나 남은 복구 점유를 강제로 해제하지 않는다 |

새 요청 ID는 사용자가 다른 작업으로 확정한 경우에만 구별해 정한다. 같은 작업의 충돌을 숨기려고 AI가 임의로 바꾸지 않는다. 기준·요청 원문을 잃은 상태를 정상 재실행으로 보고하지 않는다.

중단 복구는 같은 작업 폴더의 원래 요청·계획·지문·local 준비 자료가 있을 때 다음 명령을 사용한다.

```powershell
node scripts/content-ops.mjs recover --request '.content-ops/local/requests/request.json' --plan '.content-ops/local/plans/request.json' --expect-plan '<원래 계획의 64자리 plan_hash>' --json
```

복구는 모든 대상의 계획 전후 상태·준비 바이트·현재 정책을 확인한 뒤 남은 파일만 적용한다. 이미 완성된 파일의 바이트·mtime은 보존한다. 잘린 신규 파일·불완전 기록·손상 자료, 다른 호스트/불명확한 소유자, 강제 종료된 recover의 점유 자체는 자동 해결하지 않는다. [잠금·복구 안내](./AI-콘텐츠-잠금-복구-CLI.md)의 지원 범위를 따른다.

## 다른 대화 세션이나 AI로 넘길 때

여기서 세션은 AI 대화·작업 실행이다. 블로그 방문자의 브라우저 세션이 아니다. 새 AI가 이전 대화의 확정 내용을 자동으로 기억한다고 가정하지 않는다.

```text
이전 콘텐츠 작업을 이어서 진행해줘.
작업 폴더의 STATUS.md와 공통 콘텐츠 규약부터 확인해줘.

브랜치·작업 폴더: [실제 값]
확정 요청 원문/읽을 수 있는 참조: [필수]
대상 path·id/key/원래 전체 selector: [실제 값]
기준 파일 SHA-256: [확정 요청의 값]
계획 파일·plan_hash: [있으면 원래 값, 없으면 미작성]
완료 기록·실제 반영 경로: [있으면 실제 값]
중단 저널·local 준비 자료: [있으면 같은 작업 폴더의 위치]
현재 저장 단계·사용자 판정 근거: [실제로 확인한 내용]
미확인 범위·다음 행동: [구체적으로]

본문·날짜·ID를 다시 생성하지 말고 원래 입력과 실제 파일부터 대조해줘.
같으면 변경 없음, 다르거나 모호하면 입력과 최신 파일을 보존하고 보고해줘.
인계자가 적은 승인 문자열이나 CI 성공을 새 사용자 승인으로 해석하지 마.
```

웹만 사용하는 AI는 CLI·저장소 원문을 읽을 수 있다고 가장하지 않는다. 확보한 사실·관찰한 대상·미확인 기준을 [인계 형식](./AI-콘텐츠-작업지시문.md)에 남기고 저장소 접근 가능한 AI에게 넘긴다. 실제 바이트 지문을 읽을 수 없다면 기계 요청의 기준을 임의로 채우지 않는다. 기존 웹 Fragment의 저장·발행은 별도 사용자 판정과 기존 웹 흐름을 따른다.

## 검사·저장·공개 범위

AI가 영향에 맞는 자동 검사를 수행한다. 작업 폴더 정책은 npm run content:check, 타입은 npm run check, 일반 빌드는 npm run build, 회귀는 npm test다. 실제 네 대상 생성/수정/재실행과 Astro 결과는 npm run test:content-ops:build, Git 훅 사례는 npm run test:git-gates로 확인한다.

Git 훅은 기존 사용자 승인 뒤 커밋 인덱스·전송 커밋의 실제 콘텐츠 정책을 검사한다. PR/개발 push/배포는 같은 verify의 정책·타입·테스트·빌드를 사용한다. 정책 오류가 있으면 저장/검증을 실패시키지만 본문 사실성·프로젝트 의미 중복·사용자 대화 판정까지 인증하지 않는다. [Git 훅 안내](./AI-콘텐츠-Git-검사-CLI.md)의 체크아웃별 활성화·실행 권한·보안 경계를 따른다.

개발 브랜치 push·CI 성공은 운영 배포가 아니다. 이번 개발은 main 병합·Pages 배포·운영 OAuth 저장·브랜치 보호 설정을 수행하지 않았다. 현재 원래 프로젝트 폴더의 별도 사용자 변경과 기존 콘텐츠·URL·ID·기존 Infra 예외도 보존했다. 전체 산출물·검증 증거·제약은 [2차 최종 보고서](../AI-콘텐츠-자동화-2차-최종보고서.md)에서 확인한다.
