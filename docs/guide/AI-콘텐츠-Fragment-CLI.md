# AI 콘텐츠 Fragment 생성·부분 수정 CLI

- 개발 건: AI-CONTENT-TOOLS / ACTF01, 2026-10-19, 사용자 판정 대기.
- 선행: ACTB02 사용자 통과, `736c11a` 커밋·개발 브랜치 push 완료.
- 위치: C3 중 Fragment 처리 구현. 카테고리·프로젝트·잠금/복구·Hook/CI 저장 차단은 후속 작업.

## 무엇이 가능해졌는가

확정한 ID와 Markdown으로 Fragment를 생성하고, 기존 카드의 요청 필드만 수정할 수 있다. 원래 ID·실제 파일명·요청 밖 별칭·태그·관계·본문은 보존한다. 같은 입력을 다시 실행하면 실제 파일과 완료 기록을 대조해 추가 쓰기 없이 끝낸다.

기존 [글 생성·부분 수정 CLI](./AI-콘텐츠-글-생성-CLI.md)와 같은 plan/apply 명령을 사용한다. 요청의 resource가 fragment이면 Fragment 어댑터를 선택한다. 기존 웹 작성기·OAuth·저장 API는 변경하지 않았으며 이 도구는 로컬 파일과 최소 완료 기록만 준비한다. Git 승인·커밋·push·운영 발행은 기존 절차로 별도 수행한다.

## 입력과 실행

[JSON 요청 계약](./AI-콘텐츠-요청-계약.md)을 따른다. 날짜·draft는 현재 Fragment 필드가 아니므로 추가하지 않는다. 도구가 새 UUID를 뽑거나 제목을 보고 새 ID를 결정하지 않는다.

| 작업 | 확정할 입력 |
| --- | --- |
| 생성 | resource=fragment, operation=create, target.path·id, baseline.sha256=null, content.source |
| 부분 수정 | operation=update, 기존 target.path·id, 실제 원문 바이트의 baseline.sha256, changes |
| 관련 카드의 들어오는 관계 제거 | changes.relations와 함께 related_targets의 실제 path·원래 id·원문 sha256 |

신규 생성은 원문 ID와 target.id, `src/content/fragments/<id>.md`가 일치해야 한다. 기존 수정은 실제 파일명과 ID가 달라도 그 경로와 ID를 그대로 사용한다. 예를 들어 파일이 old-name.md이고 내부 ID가 alpha여도 alpha.md로 이동하지 않는다. 실제 ID가 요청과 다르면 중단한다.

```powershell
node scripts/content-ops.mjs plan --request 'input/fragment-request.json' --root 'C:\작업폴더' --out '.content-ops/local/fragment-plan.json'
node scripts/content-ops.mjs apply --request 'input/fragment-request.json' --root 'C:\작업폴더' --plan '.content-ops/local/fragment-plan.json' --expect-plan '<plan에서 확인한 64자리 지문>'
```

요청 상대 경로는 터미널 작업 폴더, 대상·계획 경로는 지정한 root를 기준으로 한다. root 생략 시 스크립트 소속 저장소다. plan은 콘텐츠를 쓰지 않고 로컬 계획 파일만 추가하며, 수정 전후 원문을 `-`와 `+`로 보여 준다. 같은 계획 파일은 다시 쓰지 않는다. JSON은 `--json`을 붙인다. 종료 코드는 0 성공/변경 없음, 1 입력·충돌·적용 실패, 2 명령 사용 오류다.

## 제목만 수정하는 예시

changes에 title 하나만 지정하면 그 YAML 값의 위치만 바꾼다. ID·summary·category·aliases·tags·relations·본문과 주석·BOM·줄바꿈을 보존한다. 글 부분 수정과 같은 원문 범위 편집을 공유하며 YAML 전체를 재직렬화하지 않는다. 변경한 필드의 인용·배열 표현은 바뀔 수 있다.

changes의 aliases: []나 body: ""는 명시적인 비우기다. 해당 필드가 생략되면 원래 값을 유지한다. 태그·별칭 순서는 의미 있는 차이로 취급한다. 생략된 선택 필드의 기본값과 같은 요청이면 필드를 새로 삽입하지 않는다.

기존 Fragment의 지원 밖 필드는 현행 작성기처럼 거절한다. 모르는 필드를 지우고 저장하지 않는다. 수정할 값에 앵커가 있거나 흐름 매핑의 메타데이터를 바꿔야 하는 경우는 patch.unsupported로 중단한다. 기존 Infra 예외는 정확한 경로·규칙·값을 유지하며 제목 수정 때문에 새 카테고리를 등록하지 않는다.

## 관계를 수정하는 예시

관계는 저장된 방향을 기준으로 수정한다. 화면에서 양쪽에 보이는 연결을 두 카드에 복제하지 않는다. changes.relations는 대상 카드 안에 저장할 최종 관계 목록이다. related_targets는 **명시한 상대 카드에서 대상 카드로 들어오는 관계를 제거할 목록**이다. 단순히 읽어 볼 참고 카드 목록으로 넣지 않는다. 기존 웹 작성기의 detach 처리와 같은 범위다.

예를 들어 현재 beta → alpha와 beta → gamma가 있고, alpha → beta로 관계를 옮기려는 경우를 생각한다. alpha의 changes.relations에 beta를 지정하고, related_targets에 beta의 실제 경로·ID·기준 지문을 넣는다. 도구는 alpha의 새 관계와 beta에서 alpha로 들어오는 관계 제거를 한 계획에 포함한다. beta → gamma와 beta의 제목·본문은 그대로 둔다.

| 입력 | 결과 |
| --- | --- |
| alpha에 beta 연결 추가, related_targets에 beta 지정 | beta → alpha를 제거하고 alpha → beta를 계획, beta의 다른 연결 보존 |
| 같은 요청에서 related_targets 생략 | 기존 beta → alpha를 임의 제거하지 않으며 관계 쌍 중복으로 실패 |
| alpha의 relations: []만 지정 | alpha에 저장된 목록만 비움. 다른 카드에서 들어오는 연결은 유지 |
| relations: []와 related_targets에 beta 지정 | alpha의 목록을 비우고 beta → alpha도 제거 |
| 명시한 관련 카드에 제거할 연결이 없음 | 그 카드는 쓰지 않지만 계획과 완료 기록에는 상태 포함 |

관계 수정에 포함한 모든 파일의 경로·원래 ID·기준 지문을 확인한다. 제안된 전체 문서 집합에서 중복 ID·없는 대상·자기 참조·같은 두 카드의 방향/유형 무관 관계 쌍 중복·등록 카테고리를 검사한다. 관련 카드 전체가 유효한 결과가 되기 전에 첫 파일을 쓰지 않는다. plan이 보여 준 관련 파일의 수정도 같은 검토 범위에 포함한다.

## 재실행과 충돌

| 현재 상태 | 처리 |
| --- | --- |
| 같은 신규 경로에 같은 해석 정보·본문이 있음 | 변경 없음. 기존 YAML 표현 보존, 새 기록 없음 |
| 같은 경로에 다른 내용 또는 다른 경로에 같은 ID가 있음 | 충돌/전체 정책 오류, 다른 이름·ID 생성으로 우회하지 않음 |
| 기록 없이 요청한 필드·관계 제거 결과가 이미 반영됨 | 오래된 기준이어도 변경 없음, 요청 밖 최신 원문 보존 |
| 계획 뒤 대상 또는 관련 카드에 다른 편집 발생 | 아직 변경이 필요하면 baseline.conflict, 덮어쓰기 없음 |
| 대상 카드만 바뀌고 관련 카드에는 옛 관계가 남음 | 부분 결과로 충돌. 전체 완료로 오인하지 않음 |
| 기록이 있고 전체 실제 파일이 최종 지문과 같음 | 변경 없음, 응답 유실 뒤 같은 요청으로 재시도 가능 |
| 완료 기록 뒤 대상·관련 파일이 달라짐 | receipt.state-mismatch. 변경하지 않았던 관련 파일도 대조 |
| 같은 요청 ID에 다른 내용 또는 다른 계획 지문 지정 | request.conflict 또는 plan.changed |

완료 기록은 `.content-ops/receipts/<request_id>.json`에 마지막으로 저장한다. 내용은 요청/계획 지문·대상별 전후 지문·결과이며 카드 본문·채팅·토큰·승인은 저장하지 않는다. 계획 지문이나 기록 자체는 사람의 통과 판정을 증명하지 않는다.

## 확인한 범위와 남은 한계

Fragment 통합 39개를 추가해 전체 429개·28파일을 통과했다. 공통 원문 편집과 계획 파일 저장을 분리했으며 기존 글 API와 테스트도 유지했다. 타입 검사 111파일에서 오류·경고 0건과 기존 힌트 5건을 확인했다. 일반 빌드는 11페이지·18이미지로 성공했다. 현재 콘텐츠 검사도 오류 0·기존 Infra 예외 4·미사용 예외 0이다.

`npm run test:content-ops:build`는 격리 사본에서 실제 CLI로 글과 이미지를 생성·수정하고, 두 Fragment를 생성한 뒤 역방향 관계 제거·새 관계·제목 수정을 적용한다. 각 재실행에서 파일 목록·바이트·mtime 보존을 확인한다. 실제 Astro 산출물에서도 글의 제목·본문·이미지·검색과 Fragment ID·제목·관계를 검증한다. 이 별도 빌드의 공통 CI 연결은 ACTH01 범위다.

전체 결과를 한 계획으로 검사하지만 여러 파일의 반영은 순차적이다. 최종 기준 확인과 rename 사이의 외부 쓰기를 원자적으로 차단하지 않으며 중간 실패 시 사용자 파일을 자동으로 되돌리지 않는다. 부분 변경과 최소 기록의 복구·도구 간 잠금·실패 주입은 ACTS01에서 다룬다. 카테고리·프로젝트 적용과 Hook/CI 저장 차단도 후속 작업이다.

이번에는 화면·운영 계정 흐름을 바꾸지 않았다. CLI의 파일 결과·종료 코드·재실행 여부는 자동 확인했으므로 사용자 직접 실행은 요구하지 않는다. 동작과 한계를 설명하고 현재 변경의 판정을 받는다.
