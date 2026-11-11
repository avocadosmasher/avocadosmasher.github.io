---
id: "gpa"
title: "GPA"
summary: "가상 머신 내부의 운영체제가 물리 메모리 주소로 인식하는 주소."
category: "Infra"
aliases: ["Guest Physical Address","게스트 물리 주소"]
tags: ["가상화","메모리"]
relations: []
---
게스트가 보는 물리 주소와 호스트의 실제 물리 주소는 같다고 가정할 수 없습니다.

주소 변환 순서: GVA(게스트 가상 주소) → GPA → HPA(호스트 물리 주소). 앞 단계는 게스트의 페이지 테이블이, 뒤 단계는 EPT·NPT가 맡습니다.
