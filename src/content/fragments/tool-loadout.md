---
id: "tool-loadout"
title: "도구 구성 선별"
summary: "작업에 필요한 도구·스킬만 골라 모델에 노출해 과부하를 막는 기법."
category: "AI"
aliases: ["Tool Loadout","도구 선별"]
tags: ["컨텍스트 엔지니어링","관리 기법"]
relations: [{"target":"context-engineering","type":"part-of"},{"target":"context-clash","type":"related"}]
---
예시: 한 기업은 엔지니어마다 시작할 때 스킬 600개를 불러오고 있었습니다.

DSPy 구현에서는 작은 모델이 각 도구가 필요한지 판단하고, 상위 도구만 남겨 큰 모델에 넘깁니다.

함께 기억할 것: 도구 목록도 컨텍스트입니다. 많을수록 혼동·충돌이 생기기 쉽습니다.

출처: Drew Breunig, [The State of Context Engineering](https://www.dbreunig.com/2026/10/24/the-state-of-context-engineering.html) (2026-10-24) · [긱뉴스 #36019](https://news.hada.io/topic?id=36019)
