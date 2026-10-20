# 작업 및 사용자 검증 절차

이 저장소에서는 [CLAUDE.md](./CLAUDE.md)의 프로젝트 설명과 이 파일의 공통 작업 절차를 따른다. `STATUS.md`는 개발 현황·문서 위치의 진입점이다. 현재 사용자 요청을 아래 기준으로 분류한 뒤 필요한 기록만 갱신한다. Fragment 기능 개발에는 `docs/decision/Fragment-커밋-전략.md`를 함께 적용한다.

## 문서 읽기 규칙 (토큰 절약)

1. **세션 시작에는 `STATUS.md`만 읽는다.** 개발 현황·문서 위치를 확인하고 실제 브랜치·작업 폴더와 대조한다. 콘텐츠 요청을 STATUS의 개발 건·다음 작업으로 바꾸어 해석하지 않는다.
2. 과거 작업이 필요하면 `docs/log/INDEX.md`(메뉴판)에서 항목을 고르고 **그 파일 하나만** 연다. 메뉴판 한 줄로 충분하면 파일을 열지 않는다.
3. **작업 로그 전체를 통독하지 않는다.** `docs/log/`를 한꺼번에 읽거나 여러 항목을 예비로 열지 않는다.
4. 코드는 `graft`로 먼저 찾는다(아래 Graft 절). 파일 전체 읽기는 마지막 수단이다.
5. 검사 결과는 요약 리포터로 돌린다. 실패했을 때만 상세 출력을 본다(`npm test`, `npm run test:*`는 기본이 요약).

## 콘텐츠 작업의 공통 진입점

1. `STATUS.md`로 현재 작업 범위를 확인한 뒤, 글·Fragment·카테고리·프로젝트 이력·경력·프로필을 다룰 때는 [AI 콘텐츠 작업 규약](./docs/guide/AI-콘텐츠-작업규약.md)을 읽는다. 저장소 직접 수정과 웹 화면 작업 모두 같은 원문을 따른다.
2. 각 문서의 역할을 구분한다. 이 파일은 작업·검증·판정 절차, `CLAUDE.md`는 프로젝트 구조·명령, 공통 규약은 콘텐츠 입력·대상 식별·재실행·충돌·저장 경로별 승인 기준을 담당한다. 세부 콘텐츠 규칙을 AI별 지침에 복제하지 않는다.
3. 개발 작업의 계획·결정 기록과 작업 ID는 `STATUS.md`를 따른다. AI-BLOG 1차는 `AB`, AI-CONTENT-TOOLS 2차는 `ACT`, 작업공간 분리는 `ACW` ID를 사용한다. 일반 콘텐츠 요청에는 이 개발 ID·개발 대기를 이어받지 않고 실제 콘텐츠 대상과 확정 request_id를 사용한다. Fragment 기능을 조사하는 경우에만 그 개발 계획·결정 기록을 추가로 읽는다.
4. 과거 경위가 필요하면 기존 메뉴판 규칙을 따른다. 아직 작성하지 않은 지시문·템플릿·처리 명령·웹 기능을 사용 가능한 진입점으로 안내하지 않는다.

## 작업 분류와 기록 소유권

| 현재 요청의 목적 | 진행 기록·갱신 범위 |
| --- | --- |
| 사이트 기능·콘텐츠 Tool·검사·운영 규칙 개발 | 기존 개발 계획·`docs/log/`·루트 `STATUS.md` 사용 |
| 글·Fragment·카테고리·프로젝트·경력·프로필의 내용 작성·수정 | 해당 콘텐츠 작업공간의 `HANDOFF.md`·초안·메모 사용, 개발 로그 생성과 루트 STATUS의 지금·최근 3건·날짜 갱신 제외 |
| 개발과 콘텐츠 변경이 섞인 요청 | 목적·변경 범위를 나누어 각각 기록하고 실제 Git 검토 대상 전체는 함께 확인 |

- 파일 확장자가 아니라 작업 목적으로 분류한다. 카테고리·프로젝트 내용 변경은 `src/consts.ts`를 편집해도 콘텐츠 작업이며, 이 AGENTS·공통 규약·템플릿 변경은 운영 규칙 개발이다.
- 저장소 접근이 가능한 콘텐츠 작업공간은 `.content-ops/local/tasks/<작업명-고유값>/`이다. 기존 폴더를 찾아 재개하고 한 작업의 개별 확정 요청은 `requests/<request_id>/`에 보존한다. 폴더 이름을 새 CLI 필드로 추가하지 않는다. 초안·HANDOFF는 갱신 가능하지만 계획에 사용한 확정 입력은 덮어쓰지 않는다. 파일 접근이 없는 AI는 인계 원문에 현재 상태를 남기며 로컬 파일을 만들었다고 주장하지 않는다.
- 완료된 콘텐츠의 실제 적용은 파일·완료 기록·저널로 재확인한다. HANDOFF의 완료·승인 문구만으로 적용·사용자 통과·커밋·push를 인증하지 않는다. 기존 완료 기록·잠금·복구 경로는 Tool이 관리하며 메모 정리를 이유로 이동·삭제하지 않는다.
- 무관한 개발 확인 대기를 콘텐츠 요청의 승인 대기로 전파하지 않는다. 다만 같은 대상·기존 사용자 변경·스테이징 범위가 겹치면 그 충돌을 먼저 확인한다. 기록 분리를 이유로 다른 변경까지 승인된 것으로 해석하지 않는다.
- gated-tdd 같은 개발 스킬을 일반 콘텐츠 요청에 자동 적용하지 않는다. 사용자가 명시한 경우 해당 요청의 범위를 맞추되 저장소의 사용자 통과 조건을 유지한다. 추가 작성 스킬의 메모는 작업공간으로 지정하고 경로를 지원하지 않으면 충돌을 보고한다. 스킬 출력을 위해 CLI 실행 루트를 바꾸지 않는다.
- 이 절의 기록 범위는 가이드·복사 지시문에도 적용한다. [작업공간·HANDOFF·초안 예시](./templates/ai-content/workspace/README.md)와 [복사용 지시문](./docs/guide/AI-콘텐츠-작업지시문.md)을 필요한 범위만 읽고 현재 존재하는 기능·파일만 안내한다. 새 개발 기록은 개발 절차를, 콘텐츠 진행은 해당 작업 기록을 사용한다.

## 사용자에게 설명하는 방식

- 결론을 먼저 제시하고 의미별 블록을 구분한다. 사용자가 원하는 정보를 바로 찾을 수 있게 한다.
- 보고·진행 알림은 한 항목에 한 사실을 두고 명사형으로 끝내는 개조식을 사용한다. 긴 서술문에 bullet만 붙이지 않는다.
- 결과 목록만 제시하지 않는다. 해결하려는 문제·구체적 예시·선택 이유·영향과 한계를 함께 설명한다.
- 운영 가이드·최종 보고서 본문은 처음 읽는 사람을 위한 연결된 설명으로 작성한다.

## 필수 완료 순서

1. 테스트 가능한 작은 단위로 구현하고 관련 자동 테스트와 필요한 검사를 실행한다.
2. 변경 내용과 검사 결과를 위 분류에 맞는 기록에 남기고, 해당 작업의 파일만 스테이징한다.
   - 개발 항목은 `node scripts/log-new.mjs "<제목>"`으로 만든다. 항목 파일 생성, 메뉴판 한 줄 추가, `STATUS.md` 날짜 갱신을 한 번에 처리한다. 한 항목 = 한 파일이며 기존 항목에 덧붙이지 않는다.
   - 개발 메뉴판의 결론에는 **무엇이 문제였고 어떻게 정했는지**를 적는다. 개발 작업을 마치면 `STATUS.md`의 "지금"과 "최근 3건"을 갱신한다.
   - 일반 콘텐츠 작업에는 log-new를 실행하지 않는다. 해당 HANDOFF에 확정 요청·검사·실제 결과·다음 행동을 기록한다. Git 제외 local 메모를 감사 기록으로 삼기 위해 강제 추가하지 않으며 실제 콘텐츠·필요한 완료 기록 등 해당 검토 파일만 스테이징한다.
   - 혼합 작업은 개발 변경에 대해서만 개발 항목을 만들고 콘텐츠 진행을 그 항목이나 STATUS로 대체하지 않는다. 기존 개발 로그·사용자 변경을 이동·삭제하지 않는다.
3. 사용자에게 아래 형식으로 수동 테스트 가이드를 제공하고 **판정을 기다린다**. 이 단계에서는 커밋·푸시하지 않는다.
   - **테스트 대상**: 기능 이름과 이번에 변경된 동작.
   - **준비**: 실행 명령, 접속 주소, 필요한 데이터나 계정. 가능한 로컬 준비는 에이전트가 수행한다.
     - 사용자가 확인해야 할 파일이 있으면 안내할 때 기본 연결 프로그램으로 직접 열고 파일 링크도 제공한다(2026-10-13 사용자 요청). 열 수 없는 환경이면 이유와 링크를 안내한다.
   - **테스트 방법 / 예상 결과**: 번호별로 구체적인 조작과 관찰할 결과를 짝지어 설명한다.
   - **자동 검사 결과**: 실행한 검사와 성공/실패, 확인하지 못한 범위.
   - **판정 요청**: “직접 확인 후 ‘통과’ 또는 ‘수정: [문제와 재현 방법]’으로 알려주세요.”

   사용자에게 요청할 항목은 **사람이 봐야 아는 것**으로 한정한다(2026-09-21 사용자 요청).
   - 요청한다: 화면의 배치·색·크기·문구 같은 심미적 판단, 실제 앱에서 눌러 보는 기능 확인, 외부 계정·서비스가 얽힌 실제 흐름.
   - 요청하지 않는다: 반복 실행해도 같은 결과가 나오는 자동 검사(`npm test`, `npm run test:*`, 빌드, 타입 검사) 실행, `git diff`로 코드·문서 내용 확인. 이는 에이전트가 직접 수행하고 결과만 요약해 보고한다.
   - CLI의 계획·적용·재실행·충돌처럼 실제 파일과 종료 코드로 자동 검증 가능한 흐름도 에이전트가 수행한다(2026-10-18 사용자 요청). 사람이 판단할 동작·문구가 없다면 직접 실행을 요청하지 않고, 확인할 것이 없는 이유와 자동 검사 근거를 설명한 뒤 판정을 요청한다.
   - 화면 변화가 있으면 캡처를 만들어 보여 주고, 사용자가 직접 실행할 수 없는 환경(운영 전용 OAuth 등)이면 그 이유와 확인 시점을 명시한다.
   - 사람이 확인할 것이 전혀 없는 변경(문서 정리, 내부 리팩터링 등)은 그 사실과 근거를 밝히고 판정을 요청한다.
4. 사용자가 현재 변경에 대해 명시적으로 **통과**라고 판정한 경우에만 `node scripts/manual-review.mjs approve`로 승인 상태를 기록하고 커밋·푸시한다. 이전 작업의 승인, 응답 없음, 자동 테스트 성공을 승인으로 해석하지 않는다. 사용자 답변을 대신 작성하거나 승인 명령을 미리 실행하지 않는다.
5. **수정** 판정이면 수정 → 자동 검사 → 새 수동 테스트 가이드 → 판정 대기를 반복한다. 승인 후 파일을 변경하면 다시 검증받는다.

문서·설정 변경도 실제 확인할 파일과 기대되는 내용을 안내하고 판정을 받는다. 브라우저 기능이 없으면 억지로 화면 테스트를 만들지 않는다.

## Git 훅

최초 체크아웃에서는 `git config core.hooksPath .githooks`로 훅을 활성화한다. 기존 커스텀 훅 경로가 있으면 덮어쓰지 말고 통합한다.
`pre-commit`과 `pre-push`는 승인받은 Git 트리와 기준 커밋을 확인한다. 승인 정보는 로컬 Git 디렉터리에 저장되며 버전 관리하지 않는다.
승인 검사 통과 뒤 기존 콘텐츠 정책도 검사한다. 커밋은 스테이징된 Git tree, push는 전송할 각 고유 tree를 검사하며 작업 폴더로 대체하지 않는다. [Git 훅·공통 CI 안내](./docs/guide/AI-콘텐츠-Git-검사-CLI.md)의 범위와 한계를 따른다. 검사 성공을 사용자 통과 판정으로 해석하지 않는다.
훅은 대화 내용을 판독하지 못하므로 실제 사용자 판정 확인은 에이전트의 책임이다. `--no-verify`, 훅 비활성화 또는 승인 파일 조작으로 절차를 우회하지 않는다.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
