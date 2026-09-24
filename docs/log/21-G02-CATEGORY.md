# G02-CATEGORY — 블로그 공통 카테고리 선택 (2026-09-16, 수동 판정 대기)

- 추가 피드백: 사용자가 카테고리 기능은 통과 판정하고 화살표 오른쪽 여백 개선을 요청했다. select를 감싼 요소에 CSS 화살표를 두고 right 18px·텍스트 우측 padding 44px로 조정했다. 화살표는 pointer-events:none으로 클릭을 선택창에 전달하며, 강제 색상 모드에서는 기본 화살표를 사용한다. 기존 카드 편집은 G03 미구현임을 안내했다. 수정된 외관은 새 수동 판정 대상이다.
- 여백 조정 후 `npx playwright test tests/e2e/fragment-editor.spec.ts`: 2개 통과. 선택·입력 보존과 모바일 너비 회귀를 확인했다. CSS 중심의 변경으로 새 자동 테스트는 추가하지 않았다.
- 여백 수정 테스트 빌드 12페이지 성공, Cloudflare 테스트 사이트 갱신 완료(`https://b9bbb696.fragment-cms-test.pages.dev`). 일반 빌드·타입·OAuth 전체 검사는 여백 수정 후 재실행하지 않았다. 외관과 실제 화살표 클릭은 사용자 수동 확인 대상으로 남긴다.

- 시작 기준 `94585ed`, `feat/fragments`, 작업 폴더 깨끗함. 이전 작성 창 개선은 사용자 1~4 통과 판정 후 승인 기록·커밋·push 완료했다.
- 작성 폼이 블로그 Sidebar와 동일한 `src/consts.ts`의 `CATEGORIES`를 직접 읽는다. AI, Frontend, Backend, DevOps, Database, 회고/생각 순서를 공유하며 글 수와 관계없이 설정된 모든 카테고리를 표시한다. Fragment 예제에서 추출하던 작성 폼 props를 제거했다. 기존 카드와 조회 필터는 변경하지 않았다.
- 브라우저 자동완성 datalist를 필수 select로 교체했다. 첫 항목은 선택 안내이며 목록의 값만 선택한다. 저장 필드 수집에 select를 포함하고, 저장 재시도 시에는 기존 선택값을 비활성 상태로 보존한다. 성공 후 reset하면 선택 안내로 돌아간다.
- 일반 Playwright 8개 통과: 실제 블로그 사이드바와 선택 목록·순서 일치, 미선택 validity, 선택 후 닫기·재열기 보존을 추가했다. 첫 실행은 label에 option 문구가 포함되어 정확한 이름 탐색이 실패했고 명시적인 카테고리 접근성 이름을 부여한 후 통과했다. 이번 작업의 구현 전 Red는 별도 실행하지 않았다.
- OAuth Playwright 10개 통과: DevOps 선택과 저장 Markdown 값, 성공 후 선택 초기화, 응답 유실 시 선택값 고정과 재시도 검증. 별칭·태그·보충 설명이 비어 있는 정상 저장도 포함한다. 실제 GitHub 응답은 mock이며 사용자 환경의 이전 저장 버튼 현상을 재현한 것은 아니다.
- `npx astro check`: 오류 0·경고 0·기존 hint 4개. `npm run build`, `node scripts/build-writer-test.mjs`: 각 12페이지 성공. 공유 Astro 산출물 충돌을 피하려고 검사를 순서대로 실행했다. 저장 API 로직 변경이 없어 Vitest 및 preview 검사는 재실행하지 않았다.
- 테스트 사이트 배포 완료(`https://dae239b6.fragment-cms-test.pages.dev`). 고정 주소 `/fragments/`에서 HTTP 200, select와 공통 여섯 옵션, 이전 datalist 제거를 확인했다. 실제 브라우저의 OS 선택창과 계정 저장은 수동 검증 대상이다.
- 수동 가이드를 갱신하고 `git diff --check`를 확인한다. 관련 7개 파일만 스테이징하며 새 변경은 수동 판정 후 커밋·push한다.
