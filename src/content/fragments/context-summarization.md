---
id: "context-summarization"
title: "컨텍스트 요약"
summary: "오래된 대화를 요약으로 바꾸고 그 요약에서 새 컨텍스트를 시작하는 기법. 흔히 압축(compaction)이라고 부른다."
category: "AI"
aliases: ["Context Summarization","Compaction","압축"]
tags: ["컨텍스트 엔지니어링","관리 기법"]
relations: [{"target":"context-engineering","type":"part-of"},{"target":"context-pruning","type":"related"}]
---
DSPy 구현에서는 메시지가 20개를 넘으면 이력을 브리핑 하나로 바꿉니다.

함께 기억할 것: 요약하기 전에 관련성 평가(가지치기)로 먼저 이력을 줄이면 더 쓸모 있는 요약이 나옵니다.

출처: Drew Breunig, [The State of Context Engineering](https://www.dbreunig.com/2026/10/24/the-state-of-context-engineering.html) (2026-10-24) · [긱뉴스 #36019](https://news.hada.io/topic?id=36019)
