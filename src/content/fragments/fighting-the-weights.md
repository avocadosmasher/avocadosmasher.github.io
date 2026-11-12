---
id: "fighting-the-weights"
title: "가중치와의 싸움"
summary: "요청한 행동이 모델이 학습한 행동과 반대라서 모델이 지시대로 하지 않는 현상."
category: "AI"
aliases: ["Fighting the Weights","학습된 행동 편향"]
tags: ["컨텍스트 엔지니어링","실패 유형"]
relations: [{"target":"context-engineering","type":"related"}]
---
예시
1. 작은 모델은 Playwright MCP 도구를 첫 시도에 잘못 호출한 뒤 매개변수를 고쳐서 복구합니다.
2. Claude Code 시스템 프롬프트에는 병렬 도구 호출 지시가 2~7번 반복됩니다. 직렬 실행 위주로 학습된 습관을 지시로 누르려는 흔적으로 볼 수 있습니다.

함께 기억할 것: 같은 지시를 여러 번 반복하고 강조하고 있다면 가중치와 싸우는 중인지 의심해 봅니다.

출처: Drew Breunig, [The State of Context Engineering](https://www.dbreunig.com/2026/10/24/the-state-of-context-engineering.html) (2026-10-24) · [긱뉴스 #36019](https://news.hada.io/topic?id=36019)
