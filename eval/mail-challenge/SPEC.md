# 메일 지시 해석 시험지(mail-challenge) 명세

목적: 선사·선장이 대리점에 보내는 "선원명부 수정 메일"에서 **실제로 명부에 반영해야 하는 지시**만 골라내는 능력을 잰다.
규칙 기반 파서(lib/notice.js)와 LLM 추출기를 **같은 시험지·같은 채점 코드**로 비교한다.

## 공정성 장치
- 시험지(메일·정답)는 규칙 파서 코드를 보지 않는 별도 작성자가 이 명세만 보고 만든다.
- 시험지는 어느 쪽 파서도 실행하기 **전에** 커밋한다. 결과를 본 뒤 시험지·정답을 고치지 않는다.
- LLM 추출기는 정답 파일을 보지 않고, 고정된 프롬프트(`prompt.md`)와 메일 본문만 받는다.
- 채점은 `score.mjs` 하나로 두 파서를 같은 방식으로 매긴다.

## 명부(이 배의 현재 승선원, 모두 가상 인물) — 가상 선박 DEMO HANBIT 3, V.2611E, 부산 입항 2026-11-03

| 성(Family) | 이름(Given) | 직급 | 국적 | 생년월일 | 신분증 |
|---|---|---|---|---|---|
| PARK | SANGHOON | Master | KOR | 1971-05-14 | Passport MK4820157 |
| LEE | JAEWON | Chief Officer | KOR | 1983-09-21 | Passport MR7031846 |
| KOVALENKO | ANDRII | Second Officer | UKR | 1990-02-08 | Passport FT2950813 |
| SANTOS | MARK | Third Officer | PHL | 1994-11-03 | Passport PE8105274 |
| CHOI | DONGHYUN | Chief Engineer | KOR | 1969-12-30 | Passport MJ5508219 |
| MELNYK | SERHII | Second Engineer | UKR | 1985-07-19 | Passport FK6620485 |
| NGUYEN | VAN HUNG | Third Engineer | VNM | 1991-04-11 | Passport CN1182905 |
| REYES | JOMAR | Bosun | PHL | 1980-08-25 | Passport PA3159028 |
| DELA CRUZ | JUAN | Able Seaman | PHL | 1992-03-06 | Passport PC7024581 |
| AUNG | KO KO | Able Seaman | MMR | 1996-10-17 | Seaman's book MDN215083 |
| TRAN | MINH TUAN | Ordinary Seaman | VNM | 1999-06-02 | Passport CK2560918 |
| KYAW | ZAW LIN | Oiler | MMR | 1988-01-29 | Passport MF8051236 |
| GARCIA | RONALDO | Oiler | PHL | 1986-05-09 | Passport PD5021784 |
| SAPUTRA | AGUS | Wiper | IDN | 1997-12-01 | Passport XC8205513 |
| MENDOZA | ARNEL | Chief Cook | PHL | 1978-02-14 | Passport PF1085627 |
| FLORES | ANGELICA | Messman | PHL | 2000-07-23 | Passport PG2507813 |

새로 승선하는 사람(명부에 없는 이름)도 메일에 나올 수 있다.

## 지시의 종류와 항목
- `sign_on` 승선(새 사람이 이번 항에서 탄다) — person, (있으면) rank
- `sign_off` 하선(명부의 사람이 이번 항에서 내린다) — person
- `rank_change` 직급 변경 — person, field=`rank`, value=새 직급
- `correction` 정정 — person, field, value=고쳐야 할 새 값
  - field: `familyName` `givenNames` `rank` `nationality`(ISO 3자리) `dob`(생년월일) `pob`(출생지) `gender` `idNumber`(여권·선원수첩 번호) `idIssuer`(발급국) `idExpiry`(만료일)

## 정답 형식(labels.json)
```json
[{ "id": "M001",
   "apply": [ { "type": "correction", "person": "DELA CRUZ JUAN", "field": "dob", "value": "1992-06-03" } ],
   "traps": [ { "category": "negation", "person": "SANTOS MARK", "field": "dob", "value": "1994-03-11", "note": "하지 말라는 문장" } ] }]
```
- `apply`: 명부에 **반영해야 하는** 지시만. 날짜 값은 `YYYY-MM-DD`, 번호는 대문자, 국적·발급국은 ISO 3자리, 직급은 영문 정식 명칭(Able Seaman 등).
- `traps`: 문장에 사람·항목·값이 들어 있지만 **반영하면 안 되는** 것. category는 아래 목록 중 하나.

## 함정(trap) 종류 — 각 종류가 시험지 전체에 고르게 들어가야 한다
- `negation` 하지 말라는 문장
- `cancel` 앞에서 요청했다가 같은 메일 안에서 취소·철회(앞의 요청도 반영하면 안 됨 → 그 요청은 apply에 넣지 않고 traps에 넣는다)
- `conditional` 조건이 충족돼야 하는 요청(확인되면, 선주 승인 시 등) — 아직 반영하지 않음
- `quote` 회신 메일 아래 인용된 이전 메일 속 요청(이미 처리됐거나 지금 메일의 지시가 아님)
- `superseded` 같은 메일 안에서 나중 문장이 값을 바꿈(앞 값은 trap, 뒤 값은 apply)
- `other_vessel` 다른 배·다른 항차에 대한 이야기
- `question` 질문·확인 요청(“맞습니까?”)이라 아직 지시가 아님
- `info` 정보 전달일 뿐 명부 변경이 아님(예: 이미 반영된 내용 언급, 과거 항차 이야기)

## 구성
- 메일 100통 내외. 한 통에 apply 0~4개, trap 0~3개.
- 대략 30통은 함정 없는 일반 메일, 70통은 함정이 1개 이상.
- 언어: 영어 위주, 한국어 메일 15통 내외, 영어·인도네시아어 섞인 메일 몇 통.
- 문체를 다양하게(정중한 업무 메일, 짧은 메모, 목록형, 회신·전달 메일, 오타·대소문자 섞임). 같은 문형을 반복하지 말 것.
- 날짜 표기도 섞을 것(2026-11-03, 03 NOV 2026, Nov 3 2026, 2026.11.03 등). **일·월 순서가 모호한 표기(03/06/1992)는 쓰지 않는다.**
- 이름 표기도 섞을 것(성 먼저/이름 먼저, 대소문자, "Mr. Reyes" 같은 성만 부르는 경우는 명부상 한 명으로 특정될 때만).
