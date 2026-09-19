---
name: capture-compare
description: 화면·시각 요소를 바꾸기 전에 후보 여러 개를 같은 조건에서 캡처해 비교 시트(PNG)로 보여주고 사용자가 고르게 하는 절차. 사용자가 "캡처로 보여줘", "어떻게 보일지 비교해줘", "다른 모양이면 어때?", "몇 가지 시안", "before/after"를 말하거나, 그래프 배치·색·아이콘·선/화살표 모양·레이아웃·컨트롤 모양처럼 말로는 판단하기 어려운 시각 결정을 앞두고 있으면 — 명시적으로 캡처를 요청하지 않아도 — 코드를 고치기 전에 이 스킬을 사용한다. Use for any visual design decision (layout, styling, chart/graph appearance, UI control look) where showing side-by-side screenshots beats describing options in words.
---

# 후보 캡처 비교 (capture-compare)

이 스킬의 본문은 Codex와 함께 쓰도록 `.agents/skills/capture-compare/`에 한 벌만 둔다. 내용이 갈라지지 않게 여기에는 복사하지 않는다.

1. 저장소 루트의 `.agents/skills/capture-compare/SKILL.md`를 읽고 그 절차를 그대로 따른다.
2. 스크립트는 `.agents/skills/capture-compare/scripts/capture-sheet.mjs`, 설정 예시는 `.agents/skills/capture-compare/references/example-graph-arrows.mjs`다.
