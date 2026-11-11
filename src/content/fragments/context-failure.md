---
id: "context-failure"
title: "컨텍스트 실패"
summary: "컨텍스트에 들어간 정보 때문에 모델이 잘못 동작하는 현상들을 묶어 부르는 말."
category: "AI"
aliases: ["Context Failure","How Long Contexts Fail"]
tags: ["컨텍스트 엔지니어링","실패 유형"]
relations: [{"target":"context-engineering","type":"related"}]
---
네 가지 유형: 오염(poisoning) · 주의 분산(distraction) · 혼동(confusion) · 충돌(clash).

컨텍스트 창은 12.8만 토큰에서 100만, 1,000만 토큰으로 커졌습니다. 하지만 창이 커지면 잘못된 정보가 들어갈 공간도 함께 커집니다. 그래서 긴 컨텍스트는 만능이 아닙니다.

함께 기억할 것: "RAG는 죽었다"는 주장이 나왔지만, 긴 컨텍스트에 전부 넣는 방식은 고르는 방식을 대신하지 못합니다.

출처: Drew Breunig, [The State of Context Engineering](https://www.dbreunig.com/2026/10/24/the-state-of-context-engineering.html) (2026-10-24) · [긱뉴스 #36019](https://news.hada.io/topic?id=36019)
