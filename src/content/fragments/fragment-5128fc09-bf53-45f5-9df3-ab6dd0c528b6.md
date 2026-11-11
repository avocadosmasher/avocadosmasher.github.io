---
id: "fragment-5128fc09-bf53-45f5-9df3-ab6dd0c528b6"
title: "LiteLLM"
summary: "100개 이상의 LLM API를 OpenAI 형식 하나로 호출하게 해 주는 오픈소스 도구. SDK와 Proxy 두 방식으로 씀."
category: "AI"
aliases: ["LiteLLM SDK","LiteLLM Proxy"]
tags: ["LLM Gateway","오픈소스"]
relations: [{"target":"fragment-cb07631d-88e2-46da-978a-00c44df77437","type":"part-of"},{"target":"fragment-feb11db2-e299-4742-99c8-75bc3861b428","type":"contrasts"}]
---
다음 두 가지 방식으로 나뉨.
1. **LiteLLM SDK**: Python 코드 안에서 `completion()` 함수 하나로 여러 공급자의 모델을 같은 형식으로 호출함.
2. **LiteLLM Proxy**: 별도 서버로 띄우는 LLM Gateway. 가상 키 발급, 사용량·비용 추적, 로드 밸런싱, 폴백, 속도 제한을 한곳에서 관리함.

함께 기억할 것: LiteLLM은 요청을 어느 모델로 보낼지 정하는 쪽이고, 모델을 직접 실행하지 않음. 직접 실행(서빙)은 vLLM 같은 엔진이 맡음.
