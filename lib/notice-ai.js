// AI(LLM)가 메일에서 읽은 요청(eval/mail-challenge/prompt.md 출력 형식)을 엔진의 메일 지시로 바꾼다.
// AI는 읽기만 하고 판정은 엔진 규칙이 한다. 여기서 하는 확인:
//   - 반영하지 않는다고 답한 요청(apply=false)은 지시로 쓰지 않고 이유를 경고로 남긴다
//   - 근거 문장이 메일 원문에 글자 그대로 없으면 지시로 쓰지 않는다(근거 확인)
//   - 대상 선원을 명부에서 한 명으로 특정하지 못하면 지시로 쓰지 않는다
import { splitSentences, findPersons } from './notice.js';
import { normValue, findRanks } from './normalize.js';

const REASON = { negation: '하지 말 것', cancel: '취소', conditional: '조건부', quote: '이전 메일 인용', superseded: '뒤 문장으로 바뀜', other_vessel: '다른 배', question: '질문', info: '단순 안내' };

export function noticeFromAI(mail, instructions = [], persons = [], opts = {}) {
  const directives = [];
  const warnings = [];
  const sentences = splitSentences(mail);
  for (const it of instructions) {
    const who = it.person || '';
    if (!it.apply) { warnings.push(`AI: ${who} ${it.type} 요청은 반영하지 않음(${REASON[it.not_applied_reason] || it.not_applied_reason || '이유 없음'})`); continue; }
    const ev = String(it.evidence || '').trim();
    const pos = ev ? mail.indexOf(ev) : -1;
    if (pos < 0) { warnings.push(`AI: ${who} 요청의 근거 문장이 메일 원문에 없어 쓰지 않음`); continue; }
    const s = sentences.find((x) => pos >= x.start && pos <= x.end) || sentences[0];
    const found = findPersons(who, persons);
    if (found.length > 1) { warnings.push(`AI: ${who}를 명부에서 한 명으로 특정하지 못해 쓰지 않음`); continue; }
    const d = { id: `L${s.line}`, line: s.line, start: s.start, end: s.end, text: s.text, type: it.type, field: null, value: null, valueRaw: null, personKey: null, personKeys: [], nameInText: null, source: 'ai' };
    if (found.length === 1) { d.personKeys = found[0].keys; d.personKey = found[0].keys[0]; } else d.nameInText = who.toUpperCase();
    if (it.type === 'correction' || it.type === 'rank_change') {
      d.field = it.type === 'rank_change' ? 'rank' : it.field;
      if (d.field && it.value != null) {
        const raw = String(it.value);
        d.valueRaw = raw;
        d.value = d.field === 'rank' ? (findRanks(raw).at(-1)?.canon || normValue('rank', raw).value) : normValue(d.field, raw, { order: opts.dateOrder }).value;
      }
    } else if (it.type === 'sign_on' && it.value) {
      d.rank = findRanks(String(it.value)).at(-1)?.canon || null;
    }
    directives.push(d);
  }
  return { directives, warnings };
}
