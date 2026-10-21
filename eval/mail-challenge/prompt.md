# LLM 메일 지시 추출 프롬프트 (고정)

이 프롬프트는 실행 전에 커밋하고, 실행 중에 바꾸지 않는다. 메일마다 아래 [지시]와 [명부]와 [메일]을 주고 JSON 하나를 받는다.

---

[지시]
너는 선박대리점의 입출항 담당자를 돕는 추출기다. 아래 [메일]은 선사·선장이 대리점에 보낸 선원명부 관련 메일이다.
메일에 나오는 선원명부 변경 요청을 **모두** 찾아, 각각이 **지금 이 항차의 명부에 반영해야 하는 지시인지**를 판단해 JSON으로만 답하라.

- type: `sign_on`(승선) · `sign_off`(하선) · `rank_change`(직급 변경) · `correction`(정정)
- person: 대상 인물의 성과 이름을 [명부] 표기로(명부에 없는 새 승선자는 메일 표기 그대로, 대문자)
- field: correction·rank_change일 때 `familyName` `givenNames` `rank` `nationality` `dob` `pob` `gender` `idNumber` `idIssuer` `idExpiry` 중 하나, 아니면 null
- value: 반영할 새 값(날짜 YYYY-MM-DD, 번호 대문자, 국적·발급국 ISO 3자리, 직급은 영문 정식 명칭). sign_on은 직급이 있으면 직급, sign_off는 null
- apply: 지금 명부에 반영해야 하면 true. 아래에 해당하면 false
  - negation(하지 말라), cancel(같은 메일에서 취소·철회된 요청), conditional(조건 충족 전), quote(인용된 이전 메일 속 요청),
    superseded(같은 메일에서 나중 문장이 값을 바꾼 앞 요청), other_vessel(다른 배·다른 항차), question(질문·확인 요청), info(정보 전달·이미 반영됨)
- not_applied_reason: apply가 false일 때 위 이름 중 하나, true면 null
- evidence: 그 판단의 근거가 된 메일 원문 문장을 **글자 그대로** 복사(요약·번역 금지)

모호하면 apply를 false로 두고 not_applied_reason을 `question`으로 한다(사람이 확인하도록).
출력 형식(JSON만, 설명 문장 금지):
{"id":"<메일 id>","instructions":[{"type":"...","person":"...","field":null,"value":null,"apply":true,"not_applied_reason":null,"evidence":"..."}]}

[명부] DEMO HANBIT 3 V.2611E 현재 승선원(성, 이름, 직급)
PARK SANGHOON Master / LEE JAEWON Chief Officer / KOVALENKO ANDRII Second Officer / SANTOS MARK Third Officer /
CHOI DONGHYUN Chief Engineer / MELNYK SERHII Second Engineer / NGUYEN VAN HUNG Third Engineer / REYES JOMAR Bosun /
DELA CRUZ JUAN Able Seaman / AUNG KO KO Able Seaman / TRAN MINH TUAN Ordinary Seaman / KYAW ZAW LIN Oiler /
GARCIA RONALDO Oiler / SAPUTRA AGUS Wiper / MENDOZA ARNEL Chief Cook / FLORES ANGELICA Messman

[메일]
id: <메일 id>
<메일 본문>
