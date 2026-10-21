// 수정 메일(교대 통보·정정 요청) 규칙 기반 파서.
// 데모 한정: 실제 서비스는 LLM 추출 + 스키마 검증을 쓰고, 여기서는 줄(문장) 단위 키워드·패턴 규칙으로 해석한다.
// 각 지시에 원문 위치(줄 번호, 문자 시작·끝)를 보존한다.
import { normValue, findRanks, normId, parseDate, normSpace } from './normalize.js';
import { personKey } from './match.js';

const TYPE_RULES = [
  ['correction', /\bcorrect(?:ion|ed)?\b|\bamend(?:ed|ment)?\b|\brectif|\bshould\s+(?:read|be)\b|\bkindly\s+(?:change|update)\b|\bchange[sd]?\b[^.]*\bto\b|\bwrongly\b|\btypo\b|정정|오기|잘못\s*기재|수정\s*요청|수정\s*바랍/i],
  ['rank_change', /\bpromot(?:ed|ion|e)\b|\brank change\b|\bchange of rank\b|\bre-?designat|\bupgraded?\b|직급\s*변경|진급|승진|승격/i],
  ['sign_off', /\bsign(?:s|ed|ing)?[\s-]*off\b|\bdisembark(?:s|ed|ing|ation)?\b|\brepatriat|\bpay(?:s|ing)?[\s-]*off\b|하선|퇴선/i],
  ['sign_on', /\bsign(?:s|ed|ing)?[\s-]*on\b|\bjoin(?:s|ed|ing)?\b|\bembark(?:s|ed|ing)?\b|승선|합류/i],
];

const FIELD_RULES = [
  ['idExpiry', /expir|valid\s+(?:until|till|thru)|만료/i],
  ['idIssuer', /issuing\s+(?:state|country)|issued\s+by|발급\s*국/i],
  ['pob', /place\s+of\s+birth|birth\s*place|\bp\.?o\.?b\b|출생지/i],
  ['dob', /date\s+of\s+birth|birth\s*date|\bd\.?o\.?b\b|생년월일|생일/i],
  ['idNumber', /passport|document\s+(?:no|number)|seaman'?s?\s+book|\bid\s+(?:no|number)|여권|신분증\s*번호|수첩\s*번호/i],
  ['givenNames', /given\s+names?|first\s+name|(?:^|\s)이름/i],
  ['familyName', /family\s+name|surname|last\s+name|(?:^|\s)성(?:을|이|은)?(?:\s|$)/i],
  ['nationality', /nationality|국적/i],
  ['gender', /\bgender\b|\bsex\b|성별/i],
  ['rank', /\brank\b|\brating\b|직급|직책/i],
];

const DATE_RE = /\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b|\b\d{1,2}[-./]\d{1,2}[-./]\d{4}\b|\b\d{1,2}[-\s](?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[-\s]\d{4}\b|\b\d{8}\b/gi;
const TARGET_AFTER = /\b(?:to|into|should\s+read|should\s+be|as)\b|→|->|=>/gi;
const STOP = new Set(['MV', 'M/V', 'PASSPORT', 'NO', 'AT', 'THE', 'AND', 'OF', 'FOR', 'TO', 'ON', 'OFF', 'SIGN', 'JOIN', 'DOB', 'CREW', 'LIST', 'PLEASE', 'MR', 'MS', 'DEAR', 'BUSAN', 'ULSAN', 'INCHEON', 'GWANGYANG', 'PYEONGTAEK', 'NEW', 'IMO', 'FAL', 'ETA', 'ETD', 'KST', 'UTC', 'CC', 'RE', 'FW', 'ID']);

const MAIL_HEADER = /^\s*(?:from|to|cc|subject|date|sent|re|fw|fwd|보낸\s*사람|받는\s*사람|참조|제목|날짜)\s*[:：]/i;

// 실행하면 안 되는 문장: 부정·취소·조건·인용. 값이 문장에 있어도 '그 값으로 바꾸라'는 뜻이 아니다.
// 이런 줄은 지시로 쓰지 않고 경고만 남긴다(해당 변경은 메일 근거 없는 변경으로 남는다 — 안전한 쪽으로 기운다).
const NEGATION = /\b(?:do\s+not|don'?t|does\s+not|no\s+need\s+to|not\s+to|never|must\s+not|should\s+not|shall\s+not)\b|하지\s*(?:마|말|않)|안\s*해|필요\s*없/i;
const CANCEL = /\b(?:cancel(?:led|s|ing)?|disregard|ignore|withdraw[ns]?|withdrawn|rescind(?:ed)?|void|revoke[sd]?|scrap)\b|취소|철회|무시|없던\s*것/i;
const CONDITIONAL = /^\s*(?:if|in\s+case|unless|once|when)\b|\b(?:if|unless|in\s+case|subject\s+to|pending|provided\s+that|only\s+after|once\s+confirmed)\b|경우(?:에만|에는)?|(?:되면|하면|이면)\s|확인되면|확정되면/i;
const QUOTE_START = /^\s*(?:on\s.+wrote:|-{2,}\s*original\s+message|-{2,}\s*forwarded|>{1}|.*님이\s*작성:|-{2,}\s*원본\s*메일)/i;
export function nonAction(text) {
  if (/^\s*>/.test(text)) return 'quote';
  if (CANCEL.test(text)) return 'cancel';
  if (NEGATION.test(text)) return 'negation';
  if (CONDITIONAL.test(text)) return 'conditional';
  return null;
}
const NON_ACTION_LABEL = { quote: '이전 메일 인용', cancel: '취소·철회', negation: '부정(하지 말 것)', conditional: '조건부' };

// 메일을 줄 단위 문장으로 나눈다(원문 위치 보존)
export function splitSentences(mail) {
  const out = [];
  let pos = 0;
  const lines = String(mail ?? '').split('\n');
  lines.forEach((ln, i) => {
    const text = ln.replace(/\r$/, '');
    if (text.trim()) out.push({ line: i + 1, start: pos, end: pos + text.length, text });
    pos += ln.length + 1;
  });
  return out;
}

// 지시 대상 값이 들어 있을 구간: "to/→/should read" 뒤, 또는 "~로/으로" 앞
function targetSegment(text) {
  let last = -1, m;
  TARGET_AFTER.lastIndex = 0;
  while ((m = TARGET_AFTER.exec(text))) last = m.index + m[0].length;
  if (last >= 0) return text.slice(last);
  const k = text.search(/\S+(?:으로|로)\s*(?:정정|수정|변경|진급|승진|기재|바랍|요청|해\s*주)/);
  if (k >= 0) return text.slice(0, text.indexOf(' ', k) > 0 ? text.indexOf(' ', k) : text.length);
  return text;
}

function lastMatch(re, s) {
  const all = [...s.matchAll(re)];
  return all.length ? all[all.length - 1][0] : null;
}

function extractValue(field, text, opts = {}) {
  const seg = targetSegment(text);
  const segKo = seg.replace(/(으로|로)(?=\s|$|[,.])/g, ' ');
  if (field === 'dob' || field === 'idExpiry') {
    const raw = lastMatch(DATE_RE, segKo) || lastMatch(DATE_RE, text);
    return raw ? { raw, value: parseDate(raw.replace(/\s+/g, '-'), opts.dateOrder) || parseDate(raw, opts.dateOrder) } : null;
  }
  if (field === 'idNumber') {
    const toks = [...segKo.toUpperCase().matchAll(/\b[A-Z0-9]{6,12}\b/g)].map((m) => m[0]).filter((t) => /\d/.test(t));
    const raw = toks.at(-1);
    return raw ? { raw, value: normId(raw) } : null;
  }
  if (field === 'rank') {
    const r = findRanks(segKo).at(-1) || findRanks(text).at(-1);
    return r ? { raw: r.canon, value: r.canon } : null;
  }
  if (field === 'nationality' || field === 'idIssuer') {
    const raw = lastMatch(/\b[A-Z]{2,3}\b/g, segKo);
    return raw ? { raw, value: normValue(field, raw).value } : null;
  }
  if (field === 'gender') {
    const raw = lastMatch(/\b(?:M|F|MALE|FEMALE)\b|남성|여성/gi, segKo);
    return raw ? { raw, value: normValue(field, raw).value } : null;
  }
  // 성명·출생지: 따옴표 안 값, 없으면 대상 구간의 대문자 단어열
  const q = text.match(/["“'‘]([^"”'’]+)["”'’]/);
  if (q) return { raw: q[1], value: normValue(field, q[1]).value };
  if (seg !== text) {
    const raw = normSpace(segKo.replace(/[.,;!]+\s*$/, '').replace(/\b(?:please|thanks?|accordingly|in\s+the\s+list)\b.*$/i, ''));
    const caps = raw.match(/[A-Z][A-Z'\- ]*[A-Z]/);
    if (caps) return { raw: caps[0], value: normValue(field, caps[0]).value };
  }
  return null;
}

// 문장에 이름(성+이름 토큰 전부)이나 신분증번호가 나오는 인물 찾기.
// 최초본·수정본에 같은 사람이 이름을 달리해 나올 수 있으므로(성명 정정) 신분증번호·성명이 같은 후보는 한 사람으로 묶는다.
function findPersons(text, persons) {
  const list = text.toUpperCase().split(/[^0-9A-Z가-힣]+/).filter(Boolean);
  const toks = new Set(list);
  const count = (arr) => arr.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
  const have = count(list);
  // 이름 토큰이 문장에 "개수까지" 다 있어야 한다(예: HOANG HOANG LONG 은 HOANG 이 두 번 나와야 함)
  const covers = (nameToks) => [...count(nameToks)].every(([t, n]) => (have.get(t) || 0) >= n);
  const scored = [];
  for (const p of persons) {
    const id = p.cells.idNumber.status === 'ok' ? p.cells.idNumber.value : '';
    const nameToks = personKey(p).split(' ').filter(Boolean);
    let n = 0;
    if (nameToks.length && covers(nameToks)) n = nameToks.length;
    if (id && toks.has(id)) n = Math.max(n, 10);
    if (n) scored.push({ p, n, id, key: personKey(p) });
  }
  if (!scored.length) return [];
  const bestN = Math.max(...scored.map((x) => x.n));
  const top = scored.filter((x) => x.n === bestN);
  // 같은 사람 묶기: 신분증번호 또는 성명이 같으면 같은 묶음
  const groups = [];
  for (const x of top) {
    const g = groups.find((gr) => gr.some((y) => (x.id && x.id === y.id) || x.key === y.key));
    if (g) g.push(x); else groups.push([x]);
  }
  return groups.map((g) => ({ keys: [...new Set(g.map((x) => x.key))], rows: g.map((x) => x.p) }));
}

function guessName(text) {
  const seqs = [...text.matchAll(/\b[A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+)+\b/g)].map((m) => m[0].split(/\s+/).filter((w) => !STOP.has(w) && !findRanks(w).length));
  const best = seqs.filter((w) => w.length >= 2).sort((a, b) => b.length - a.length)[0];
  return best ? best.join(' ') : null;
}

// persons: 최초본·수정본의 행 전체(대응 전)
export function parseNotice(mail, persons = [], opts = {}) {
  const directives = [];
  const warnings = [];
  let quoted = false;
  for (const s of splitSentences(mail)) {
    // 메일 머리 줄(보낸 사람·제목 등)은 지시로 보지 않는다
    if (MAIL_HEADER.test(s.text)) continue;
    // 인용된 이전 메일("On ... wrote:", "-----Original Message-----" 아래)은 지시로 보지 않는다
    if (QUOTE_START.test(s.text) && !/^\s*>/.test(s.text)) { quoted = true; continue; }
    const na = quoted ? 'quote' : nonAction(s.text);
    let type = TYPE_RULES.find(([, re]) => re.test(s.text))?.[0];
    // "항목: 이전 값 → 새 값" 처럼 지시어 없이 화살표만 있는 정정 문형
    if (!type && /→|->|=>/.test(s.text) && FIELD_RULES.some(([, re]) => re.test(s.text))) type = 'correction';
    if (!type) continue;
    const found = findPersons(s.text, persons);
    if (na) {
      warnings.push(`${s.line}번째 줄: ${NON_ACTION_LABEL[na]} 표현이 있어 지시로 쓰지 않음 — 관련 변경은 메일 근거 없는 변경으로 남음`);
      // 취소·철회는 앞서 나온 같은 사람의 지시도 무효로 본다(같은 항목을 말하면 그 항목만)
      if (na === 'cancel' && found.length === 1) {
        const f = FIELD_RULES.find(([, re]) => re.test(s.text))?.[0] || null;
        for (let k = directives.length - 1; k >= 0; k--) {
          const d0 = directives[k];
          if (d0.personKeys.some((x) => found[0].keys.includes(x)) && (!f || d0.field === f)) { warnings.push(`${d0.line}번째 줄 지시는 ${s.line}번째 줄에서 취소되어 쓰지 않음`); directives.splice(k, 1); }
        }
      }
      continue;
    }
    const d = { id: `L${s.line}`, line: s.line, start: s.start, end: s.end, text: s.text, type, field: null, value: null, valueRaw: null, personKey: null, personKeys: [], nameInText: null };
    if (found.length > 1) { warnings.push(`${s.line}번째 줄: 지시 대상이 여러 명으로 해석되어 연결하지 않음`); d.ambiguous = true; }
    else if (found.length === 1) { d.personKeys = found[0].keys; d.personKey = found[0].keys[0]; }
    else {
      d.nameInText = guessName(s.text);
      if (!d.nameInText && !findRanks(s.text).length) { warnings.push(`${s.line}번째 줄: 지시 표현은 있으나 대상 인물을 찾지 못함`); continue; }
    }
    if (type === 'correction') {
      d.field = FIELD_RULES.find(([, re]) => re.test(s.text))?.[0] || null;
      if (d.field) {
        const v = extractValue(d.field, s.text, opts);
        if (v) { d.value = v.value; d.valueRaw = v.raw; }
      }
    } else if (type === 'rank_change') {
      d.field = 'rank';
      const v = extractValue('rank', s.text);
      if (v) { d.value = v.value; d.valueRaw = v.raw; }
    } else if (type === 'sign_on') {
      const r = findRanks(s.text).at(-1);
      if (r) { d.rank = r.canon; }
    }
    directives.push(d);
  }
  return { directives, warnings };
}

export const DIRECTIVE_LABEL = { sign_on: '승선', sign_off: '하선', rank_change: '직급 변경', correction: '정정 요청' };
