# TDD 증거 기록

- B01–B04: `tests/unit/fragments.test.ts` 선작성 → 구현 모듈 부재로 수집 실패 → `src/lib/fragments.ts` 추가 → 4개 통과. 첫 Red는 assertion 실패가 아닌 모듈 부재임을 구분해 기록한다.
- D/F 데이터: `tests/unit/search.test.ts` 선작성 → 미구현 함수 호출로 4개 assertion 경로 실패 → 함수 구현 → 4개 통과.
- B05: `tests/integration/content.test.ts` 선작성 → 렌더링 모듈 부재 → sanitize-html 기반 구현 → 1개 통과. 실제 Astro 빌드 통합 검증은 별도 필요하다.
- C 화면: Fragments 메뉴를 찾는 Playwright 테스트 선작성 → 메뉴 부재로 실패 → 화면 추가 → 통과.
- E/F의 브라우저 시나리오도 구현 전에 작성했지만 개별 시나리오의 Red 실행은 따로 기록하지 못했다. 전체 E2E 통과를 모든 작업에서 엄격한 TDD를 수행했다는 증거로 사용하지 않는다.
