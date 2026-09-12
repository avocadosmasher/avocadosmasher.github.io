---
id: ept
title: EPT
aliases: [Extended Page Tables]
summary: 게스트 물리 주소를 호스트 물리 주소로 변환하는 Intel의 하드웨어 지원 페이지 테이블.
category: Infra
tags: [가상화, 메모리]
relations:
  - target: gpa
    type: prerequisite
  - target: hpa
    type: related
---
게스트의 페이지 테이블이 **가상 주소 → 게스트 물리 주소**를 변환하면, EPT는 **게스트 물리 주소 → 호스트 물리 주소** 변환에 사용됩니다.

함께 기억할 것: EPT는 Intel 용어입니다. AMD의 대응 기술은 NPT입니다.
