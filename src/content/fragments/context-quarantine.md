---
id: "context-quarantine"
title: "컨텍스트 격리"
summary: "하위 에이전트가 빈 대화 이력으로 시작해 독립된 하위 작업을 처리하게 하는 기법."
category: "AI"
aliases: ["Context Quarantine","서브에이전트 격리"]
tags: ["컨텍스트 엔지니어링","관리 기법"]
relations: [{"target":"context-engineering","type":"part-of"}]
---
하위 에이전트는 이력만 비어 있고 같은 환경(파일·도구)에서 작업합니다. DSPy 구현에서는 독립된 하위 작업을 새 에이전트에 맡기는 위임 함수를 도구로 노출합니다.

함께 기억할 것: 메인 컨텍스트에는 하위 작업의 결과만 돌아옵니다. 중간 과정의 잡음은 들어오지 않습니다.

출처: Drew Breunig, [The State of Context Engineering](https://www.dbreunig.com/2026/10/24/the-state-of-context-engineering.html) (2026-10-24) · [긱뉴스 #36019](https://news.hada.io/topic?id=36019)
