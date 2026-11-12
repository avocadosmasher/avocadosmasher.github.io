---
id: "context-poisoning"
title: "컨텍스트 오염"
summary: "들어가면 안 되는 정보(환각·잘못된 사실)가 컨텍스트에 들어가 모델이 거기서 벗어나지 못하는 현상."
category: "AI"
aliases: ["Context Poisoning"]
tags: ["컨텍스트 엔지니어링","실패 유형"]
relations: [{"target":"context-failure","type":"part-of"}]
---
예시: Pokémon Red를 플레이하던 Gemini 2.5 Pro가 후속작 FireRed에만 있는 '아이스티'가 필요하다고 믿었습니다. 그리고 그 목표를 쫓는 데 몇 시간을 썼습니다.

함께 기억할 것: 잘못된 내용이 목표나 할 일 목록에 한 번 들어가면 계속 다시 참조됩니다. 가지치기나 격리로 끊어야 합니다.

출처: Drew Breunig, [The State of Context Engineering](https://www.dbreunig.com/2026/10/24/the-state-of-context-engineering.html) (2026-10-24) · [긱뉴스 #36019](https://news.hada.io/topic?id=36019)
