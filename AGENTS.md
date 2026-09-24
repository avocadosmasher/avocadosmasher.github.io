# 작업 및 사용자 검증 절차

이 저장소에서는 `CLAUDE.md`의 프로젝트 설명과 `docs/decision/Fragment-커밋-전략.md`를 함께 따른다.

## 문서 읽기 규칙 (토큰 절약)

1. **세션 시작에는 `STATUS.md`만 읽는다.** 지금 어디까지 왔고 다음에 무엇을 할지가 거기 있다.
2. 과거 작업이 필요하면 `docs/log/INDEX.md`(메뉴판)에서 항목을 고르고 **그 파일 하나만** 연다. 메뉴판 한 줄로 충분하면 파일을 열지 않는다.
3. **작업 로그 전체를 통독하지 않는다.** `docs/log/`를 한꺼번에 읽거나 여러 항목을 예비로 열지 않는다.
4. 코드는 `graft`로 먼저 찾는다(아래 Graft 절). 파일 전체 읽기는 마지막 수단이다.
5. 검사 결과는 요약 리포터로 돌린다. 실패했을 때만 상세 출력을 본다(`npm test`, `npm run test:*`는 기본이 요약).

## 필수 완료 순서

1. 테스트 가능한 작은 단위로 구현하고 관련 자동 테스트와 필요한 검사를 실행한다.
2. 변경 내용과 테스트 결과를 작업 로그에 남기고, 해당 작업의 파일만 스테이징한다.
   - 항목은 `node scripts/log-new.mjs "<제목>"`으로 만든다. 항목 파일 생성, 메뉴판 한 줄 추가, `STATUS.md` 날짜 갱신을 한 번에 처리한다.
   - 한 항목 = 한 파일. 기존 항목에 덧붙이지 않는다.
   - 메뉴판의 결론 한 줄에는 **무엇이 문제였고 어떻게 정했는지**를 적는다. 제목만 적으면 다음 세션이 원문을 다시 열게 되어 절약이 사라진다.
   - 작업이 끝나면 `STATUS.md`의 "지금"과 "최근 3건"을 갱신한다.
3. 사용자에게 아래 형식으로 수동 테스트 가이드를 제공하고 **판정을 기다린다**. 이 단계에서는 커밋·푸시하지 않는다.
   - **테스트 대상**: 기능 이름과 이번에 변경된 동작.
   - **준비**: 실행 명령, 접속 주소, 필요한 데이터나 계정. 가능한 로컬 준비는 에이전트가 수행한다.
   - **테스트 방법 / 예상 결과**: 번호별로 구체적인 조작과 관찰할 결과를 짝지어 설명한다.
   - **자동 검사 결과**: 실행한 검사와 성공/실패, 확인하지 못한 범위.
   - **판정 요청**: “직접 확인 후 ‘통과’ 또는 ‘수정: [문제와 재현 방법]’으로 알려주세요.”

   사용자에게 요청할 항목은 **사람이 봐야 아는 것**으로 한정한다(2026-09-21 사용자 요청).
   - 요청한다: 화면의 배치·색·크기·문구 같은 심미적 판단, 실제 앱에서 눌러 보는 기능 확인, 외부 계정·서비스가 얽힌 실제 흐름.
   - 요청하지 않는다: 반복 실행해도 같은 결과가 나오는 자동 검사(`npm test`, `npm run test:*`, 빌드, 타입 검사) 실행, `git diff`로 코드·문서 내용 확인. 이는 에이전트가 직접 수행하고 결과만 요약해 보고한다.
   - 화면 변화가 있으면 캡처를 만들어 보여 주고, 사용자가 직접 실행할 수 없는 환경(운영 전용 OAuth 등)이면 그 이유와 확인 시점을 명시한다.
   - 사람이 확인할 것이 전혀 없는 변경(문서 정리, 내부 리팩터링 등)은 그 사실과 근거를 밝히고 판정을 요청한다.
4. 사용자가 현재 변경에 대해 명시적으로 **통과**라고 판정한 경우에만 `node scripts/manual-review.mjs approve`로 승인 상태를 기록하고 커밋·푸시한다. 이전 작업의 승인, 응답 없음, 자동 테스트 성공을 승인으로 해석하지 않는다. 사용자 답변을 대신 작성하거나 승인 명령을 미리 실행하지 않는다.
5. **수정** 판정이면 수정 → 자동 검사 → 새 수동 테스트 가이드 → 판정 대기를 반복한다. 승인 후 파일을 변경하면 다시 검증받는다.

문서·설정 변경도 실제 확인할 파일과 기대되는 내용을 안내하고 판정을 받는다. 브라우저 기능이 없으면 억지로 화면 테스트를 만들지 않는다.

## Git 훅

최초 체크아웃에서는 `git config core.hooksPath .githooks`로 훅을 활성화한다. 기존 커스텀 훅 경로가 있으면 덮어쓰지 말고 통합한다.
`pre-commit`과 `pre-push`는 승인받은 Git 트리와 기준 커밋을 확인한다. 승인 정보는 로컬 Git 디렉터리에 저장되며 버전 관리하지 않는다.
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
