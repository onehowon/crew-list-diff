# 메일 지시 해석 시험 결과

- 시험지: eval/mail-challenge/mails.json 102통, 정답 labels.json(반영할 지시 136개, 함정 79개). 명세 SPEC.md.
- 함정을 반영으로 읽음 = 하지 말라·취소·조건부·인용 등 **반영하면 안 되는 문장을 지시로 읽은 수**. 이 경우 오류가 "예상된 변경"으로 덮일 수 있어 가장 위험하다.
- LLM 실행: Claude Code 서브에이전트(사람 개입 없음), 모델 claude-opus-5-5, 프롬프트 eval/mail-challenge/prompt.md, 실행 2026-10-21T00:00:00+09:00. 메일을 직접 읽고 판단, 코드 자동 처리 없음

| 지표 | 규칙 파서 | LLM | LLM + 근거 검사 |
|---|---|---|---|
| 반영할 지시 재현율 (맞힘/전체) | 16.2% (22/136) | 98.5% (134/136) | 97.8% (133/136) |
| 정밀도 (맞힘/낸 지시) | 26.8% (22/82) | 99.3% (134/135) | 99.3% (133/134) |
| **함정을 반영으로 읽음** | **10** / 79 | **0** / 79 | **0** / 79 |
| 근거 검사로 뺀 지시 | 0 | 0 | 1 |

함정 종류별(반영으로 읽음 / 전체)

| 함정 | 규칙 파서 | LLM | LLM + 근거 검사 |
|---|---|---|---|
| cancel | 5 / 13 | 0 / 13 | 0 / 13 |
| conditional | 0 / 9 | 0 / 9 | 0 / 9 |
| info | 3 / 9 | 0 / 9 | 0 / 9 |
| negation | 0 / 10 | 0 / 10 | 0 / 10 |
| other_vessel | 0 / 10 | 0 / 10 | 0 / 10 |
| question | 0 / 9 | 0 / 9 | 0 / 9 |
| quote | 0 / 10 | 0 / 10 | 0 / 10 |
| superseded | 2 / 9 | 0 / 9 | 0 / 9 |

### 규칙 파서 실패 사례(앞 60건 / 전체 174건)

- M002 놓친 지시: sign_off|GARCIA RONALDO
- M002 놓친 지시: sign_on|BAUTISTA RICARDO
- M004 정답에 없는 지시: correction||idNumber|
- M004 놓친 지시: correction|CHOI DONGHYUN|idNumber|MJ5508291
- M005 놓친 지시: correction|AUNG KO KO|idExpiry|2031-04-22
- M008 함정(superseded)을 반영으로 읽음: correction|ANGELICA FLORES|dob|2000-07-27
- M008 놓친 지시: correction|ANGELICA FLORES|dob|2000-07-25
- M009 놓친 지시: correction|HUNG NGUYEN VAN|idExpiry|2030-09-14
- M010 정답에 없는 지시: correction|KYAW LIN ZAW|idNumber|
- M010 놓친 지시: correction|KYAW LIN ZAW|givenNames|ZAW LYNN
- M011 정답에 없는 지시: correction||idNumber|MJ5508291
- M012 놓친 지시: correction|MINH TRAN TUAN|idExpiry|2029-05-17
- M013 정답에 없는 지시: correction|JOMAR REYES|nationality|
- M013 놓친 지시: correction|JOMAR REYES|gender|M
- M015 함정(cancel)을 반영으로 읽음: sign_off|MARK SANTOS
- M016 정답에 없는 지시: correction|DEMO HANBIT|null|
- M016 정답에 없는 지시: correction|AUNG KO KO|nationality|MYS
- M016 놓친 지시: correction|JAEWON LEE|idExpiry|2032-03-08
- M016 놓친 지시: correction|AUNG KO KO|nationality|MMR
- M017 정답에 없는 지시: correction||dob|1985-07-29
- M017 놓친 지시: correction|MELNYK SERHII|dob|1985-07-29
- M018 정답에 없는 지시: sign_on|
- M018 놓친 지시: sign_on|PRATAMA RIZAL
- M019 정답에 없는 지시: correction||idNumber|PA3159082
- M019 놓친 지시: correction|JOMAR REYES|idNumber|PA3159208
- M021 정답에 없는 지시: correction||idNumber|PG2507831
- M021 놓친 지시: correction|ANGELICA FLORES|idExpiry|2030-01-15
- M022 정답에 없는 지시: correction|HUNG NGUYEN VAN|idNumber|
- M022 놓친 지시: correction|ARNEL MENDOZA|familyName|MENDOZA-RIVERA
- M023 정답에 없는 지시: sign_on|
- M023 놓친 지시: sign_on|BONDARENKO TARAS
- M024 놓친 지시: correction|KYAW LIN ZAW|idNumber|MH3304712
- M024 놓친 지시: correction|KYAW LIN ZAW|idIssuer|MMR
- M024 놓친 지시: correction|KYAW LIN ZAW|idExpiry|2036-10-05
- M026 놓친 지시: correction|PARK SANGHOON|pob|BUSAN
- M026 놓친 지시: correction|CHOI DONGHYUN|pob|MOKPO
- M026 놓친 지시: correction|JAEWON LEE|pob|INCHEON
- M027 놓친 지시: sign_off|CRUZ DELA JUAN
- M027 놓친 지시: sign_on|MARIO SORIANO
- M028 정답에 없는 지시: correction||dob|1991-02-08
- M028 놓친 지시: correction|ANDRII KOVALENKO|dob|1991-02-08
- M029 놓친 지시: correction|AGUS SAPUTRA|idIssuer|IDN
- M030 정답에 없는 지시: correction|MARK SANTOS|null|
- M031 놓친 지시: correction|AGUS SAPUTRA|dob|1996-12-01
- M032 놓친 지시: correction|JOMAR REYES|dob|1981-08-25
- M033 정답에 없는 지시: correction|MARK SANTOS|nationality|PHI
- M033 놓친 지시: correction|MARK SANTOS|nationality|PHL
- M034 놓친 지시: sign_on|KIM MINSU
- M035 놓친 지시: correction|CHOI DONGHYUN|idExpiry|2031-10-01
- M036 놓친 지시: correction|PARK SANGHOON|idNumber|MK4820175
- M037 정답에 없는 지시: sign_on|
- M037 놓친 지시: sign_on|AUNG HTET
- M038 정답에 없는 지시: correction|ARNEL MENDOZA|dob|1978-02-14
- M038 정답에 없는 지시: correction|ANGELICA FLORES|nationality|PHL
- M040 정답에 없는 지시: correction||rank|2/O
- M040 정답에 없는 지시: sign_on|
- M040 놓친 지시: correction|MARK SANTOS|rank|2/O
- M040 놓친 지시: sign_off|ANDRII KOVALENKO
- M040 놓친 지시: sign_on|KEVIN TORRES
- M041 놓친 지시: correction|AUNG KO KO|idNumber|MDN251083

### LLM 실패 사례(앞 3건 / 전체 3건)

- M053 정답에 없는 지시: sign_on|HYUK JAE SEO
- M053 놓친 지시: sign_on|JAEHYUK SEO
- M079 놓친 지시: correction|ARNEL MENDOZA|nationality|PHL

### LLM + 근거 검사 실패 사례(앞 4건 / 전체 4건)

- M004 놓친 지시: correction|CHOI DONGHYUN|idNumber|MJ5508291
- M053 정답에 없는 지시: sign_on|HYUK JAE SEO
- M053 놓친 지시: sign_on|JAEHYUK SEO
- M079 놓친 지시: correction|ARNEL MENDOZA|nationality|PHL
