---
id: "context-pruning"
title: "컨텍스트 가지치기"
summary: "더 이상 필요 없는 이력과 도구 결과를 컨텍스트에서 지우는 기법."
category: "AI"
aliases: ["Context Pruning"]
tags: ["컨텍스트 엔지니어링","관리 기법"]
relations: [{"target":"context-engineering","type":"part-of"}]
---
Claude Code와 Codex는 압축의 초기 단계에서 오래된 도구 결과부터 지웁니다. DSPy 구현에서는 작은 모델이 지난 차례 하나하나가 아직 필요한지 판단합니다.

함께 기억할 것: 앞부분 이력을 지우면 프롬프트 캐시가 깨질 수 있습니다. 캐싱 비용을 함께 고려합니다.

출처: Drew Breunig, [The State of Context Engineering](https://www.dbreunig.com/2026/10/24/the-state-of-context-engineering.html) (2026-10-24) · [긱뉴스 #36019](https://news.hada.io/topic?id=36019)
