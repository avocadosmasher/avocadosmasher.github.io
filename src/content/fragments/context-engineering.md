---
id: "context-engineering"
title: "컨텍스트 엔지니어링"
summary: "모델이 작업하는 동안 볼 컨텍스트를 시스템이 골라 조립하도록 설계하고, 코드가 맡을 일과 모델이 판단할 일을 나누는 일."
category: "AI"
aliases: ["Context Engineering"]
tags: ["컨텍스트 엔지니어링","개념"]
relations: [{"target":"prompt-engineering","type":"prerequisite"}]
---
사람이 프롬프트를 직접 고르던 프롬프트 엔지니어링을 자동화한 것으로, 시스템이 스스로 컨텍스트를 조립합니다.

모델의 출력은 **컨텍스트**와 **가중치** 두 가지로 정해집니다. 더 큰 모델이나 더 긴 추론에 비해 컨텍스트를 고치는 쪽이 싸고 빠른 수단입니다.

관리 기법 여섯 가지: 보강 · 도구 선별 · 격리 · 가지치기 · 외부 저장 · 요약(압축).

함께 기억할 것: 프롬프트(2023) → 컨텍스트(2025) → 하네스(2026)로 이름이 바뀌어도 목표는 같습니다. 일이 확률적인 모델 호출에서 결정론적인 코드로 옮겨 가는 흐름입니다.

출처: Drew Breunig, [The State of Context Engineering](https://www.dbreunig.com/2026/10/24/the-state-of-context-engineering.html) (2026-10-24) · [긱뉴스 #36019](https://news.hada.io/topic?id=36019)
