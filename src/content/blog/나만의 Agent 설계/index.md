---
title: 나만의 AI Agent 설계하기
description: 연습삼아서 만들어볼 나만의 Agent 설계
category: Frontend
tags:
  - 글-탬플릿
  - 마크다운
pubDate: 2026-07-01
readingTime: 5분
draft: true
---
# 좋은 Agent 설계
좋은 Agent라고 말하기는 좀 뭐하지만 Agent의 존재 의의?에 가까운 Agent들은 다음과 같은 요소들을 확실하게 결정짓고 있습니다.

- Goal : 무엇을 달성할 것인가
- Input : 사용자에게 무엇을 받을 것인가
- Tools : 어떤 도구를 쓸 것인가
- State : 무엇을 기억할 것인가
- Output : 어떤 형식으로 답할 것인가
- Failure : 실패하면 어떻게 할 것인가

목표가 너무 넓고 모호하면 Agent는 쉽게 흔들릴 수 있습니다.

* Bad Goal
	* 사용자를 도와주는 Agent
* Good Goal
	* 도시의 현재 날씨를 확인하고, 외출 목적에 맞는 준비물을 추천하는 Agent

Tool Spec을 명확하게 지정해줘야한다. (설명이 모호하면 모델이 도구를 잘못 고르거나 잘못된 입력을 한다던지 하는 상황이 발생한다.)

Human in the loop를 통해서 위험한 결정은 사용자에게 승인을 받도록 하여 

Agent One Pager로 구현전에 빠르게 기획을 한다.


- **핵심 요약 (Summary):** 에이전트의 이름, 역할, 그리고 한 줄 소개 (Elevator Pitch)
- **문제 정의 (Problem):** 이 에이전트가 해결하고자 하는 주된 문제점
- **해결책 및 역할 (Solution/Role):** 에이전트가 어떤 방식으로 문제를 해결하며, 어떤 페르소나와 역할을 수행하는지
- **핵심 기능 (Key Features):** 에이전트가 제공하는 주요 기능 및 활용 시나리오
- **타겟 사용자 (Target Audience):** 이 에이전트를 주로 사용할 사용자층
- **성공 지표 (Metrics):** 에이전트의 성과나 효율성을 측정할 수 있는 데이터/지표

* 업무 하나를 고른다. 너무 큰 문제는 작게 자른다
* Agent 목표를 한 문장으로 쓴다
* 필요한 Tool을 2개 이하로 정한다
* Tool Spec을 입력, 출력, 실패 기준으로 쓴다
* 최종 응답 형식을 고정한다
* 실패 케이스를 최소 3개 적는다


---
# 취직준비 Helper Agent
- **핵심 요약 (Summary):
	- 이름 : 취준 도우미 Agent
	- 역할 : 특정 회사로 취직/이직 준비를 위해서 나에게 필요한 역량을 제시
	- 한 줄 소개 (Elevator Pitch) : LinkedIn, 
- **문제 정의 (Problem):** 이 에이전트가 해결하고자 하는 주된 문제점
- **해결책 및 역할 (Solution/Role):** 에이전트가 어떤 방식으로 문제를 해결하며, 어떤 페르소나와 역할을 수행하는지
- **핵심 기능 (Key Features):** 에이전트가 제공하는 주요 기능 및 활용 시나리오
- **타겟 사용자 (Target Audience):** 이 에이전트를 주로 사용할 사용자층
- **성공 지표 (Metrics):** 에이전트의 성과나 효율성을 측정할 수 있는 데이터/지표

# Confluence 관리 Agent
Goal : 등록해놓은 Confluence 사이트에 접근하 검색, 수정, 생성, 
Input : 
Tools : 
State : 
Output : 
Failure : 

# 취업 정보 조사 Agent
목표 : 
- **핵심 요약 (Summary):
	- 이름 : 
	- 역할 : 
	- 한 줄 소개 (Elevator Pitch) : 
- **문제 정의 (Problem):** 이 에이전트가 해결하고자 하는 주된 문제점
- **해결책 및 역할 (Solution/Role):** 에이전트가 어떤 방식으로 문제를 해결하며, 어떤 페르소나와 역할을 수행하는지
- **핵심 기능 (Key Features):** 에이전트가 제공하는 주요 기능 및 활용 시나리오
- **타겟 사용자 (Target Audience):** 이 에이전트를 주로 사용할 사용자층
- **성공 지표 (Metrics):** 에이전트의 성과나 효율성을 측정할 수 있는 데이터/지표

# 주식 뉴스 수집 및 정리.
Goal : 내가 원하는 뉴스를 수집하고 정리.
forward goal :
- 주식 시장에 악재인지 호재인지 분석
- 원하는 개별 종목에 대한 정보를 수집하는걸로도 확장
Input : 내가 원하는 뉴스의 테마(카테고리), 기간
Tools : 뉴스 사이트별 스크래핑, 
State :
Output :
Failure : 

# Jira PM Agent


---
# Jira & Confluence Log 분석 및 해결 방안 제시


---
