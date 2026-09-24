# Graft 저장소 그래프 및 Codex 연동 (2026-09-16)

- `npm install -g @nanonets/graft`를 실행해 `@nanonets/graft@0.18.0`을 설치했다. 설치 중 `tree-sitter-swift` peer 의존성 경고가 있었지만 설치는 성공했다.
- 저장소에서 `graft init`을 실행해 그래프를 생성했다. 46개 파일을 파싱하고 168 nodes, 422 edges, 46 cards를 생성했으며 `graft/` 폴더에 기록했다.
- 첫 실행에서 Codex 전역 설정 파일 쓰기가 `EPERM`으로 실패해 `graft init --agents agents --no-build`를 권한 승인 후 다시 실행했다. Codex 설정, Graft 훅, `AGENTS.md`, `.gitignore`, `.ignore` 연동을 확인했다.
- 자동 검사: `graft init` 그래프 빌드 성공, `graft/` 존재 확인, `INDEX.md`를 제외한 맵 문서 46개 확인. 애플리케이션 자동 테스트는 동작 코드 변경이 없어 실행하지 않았다.

### Claude Code 쪽 연동 마무리 (2026-09-17)

- Codex용 `AGENTS.md` 안내에 더해 Claude Code 연동 파일이 작업 트리에 남아 있어 이번에 함께 정리했다. `.mcp.json`은 `graft mcp` 서버를, `.claude/settings.json`은 graft 상태줄·훅과 `Bash(graft:*)` 등 읽기 전용 권한을 등록한다. `.claude/helpers/*.cjs`와 `.claude/skills/graft/SKILL.md`가 그 구현이다.
- `.gitignore`는 재생성 가능한 `/graft/` 그래프 캐시와 개인 권한 파일 `.claude/settings.local.json`을 제외한다. `.ignore`는 gitignore된 `graft/`를 ripgrep 검색 대상으로 되돌리되 `.cache/`·`.graph/`는 제외한다. 공유 설정 `.claude/settings.json`만 버전 관리한다.
- `.claude/settings.local.json`에는 이전 세션의 로컬 경로와 임시 스크린샷 명령이 들어 있어 커밋 대상에서 제외했다. 비밀값은 포함되지 않았음을 확인했다.
- 자동 검사: `npm run build` 12페이지 성공, `npm run check` 오류 0·경고 0(기존 hint 4개), `git diff --check` 통과. 동작 코드 변경이 없어 단위·브라우저 테스트는 재실행하지 않았다. 도구 설정 변경이므로 테스트 사이트 재배포도 하지 않았다.
