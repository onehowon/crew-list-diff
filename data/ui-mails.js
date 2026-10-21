// 오른쪽 메일함 표시용(가상). 판정에는 쓰지 않는다.
// 메일 본문은 data/scenarios.js의 사례 메일, AI 해석은 data/ai/scenario-ai.json(미리 실행한 결과)을 그대로 쓴다.
// 여기에는 화면에만 보이는 보낸 사람·업무 태그만 둔다.

// 배마다 선사 쪽 보낸 사람(화면 표시명)
export const SENDER = {
  hanbit: '가상 선사 A · 선원팀',
  sora: '가상 선사 B · 선원팀',
  gaon: '가상 선사 C · 선원관리팀',
  nuri: '가상 선사 D · 선원팀',
  haeun: '가상 선사 E · 선원관리팀',
};
export const MASTER = '선장 · DEMO HANBIT 3';
export const ME = '나 · ○○해운대리점';

// 사례 메일의 업무 태그
export const KIND_BY_SCENARIO = { 1: '교대 통보', 2: '정정 요청', 3: '정정 요청', 4: '양식 변경', 5: '회신', 6: '정정 요청' };
export const TAG = { list: '선원명부', v1: '최초본', sent: '확인 요청(보냄)' };

// AI 요약 칩에 쓰는 짧은 말
export const AI_TYPE_SHORT = { correction: '정정', sign_on: '승선', sign_off: '하선', rank_change: '직급' };
export const AI_SKIP_SHORT = { negation: '부정', cancel: '취소', conditional: '조건부', quote: '인용', superseded: '번복', other_vessel: '다른 배', question: '질문', info: '안내' };
