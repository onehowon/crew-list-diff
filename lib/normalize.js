// 셀 값 정규화. "표기만 다른 것"(대소문자·공백·날짜 형식·직급 약어·국가명)을 같은 값으로 만든다.
import { ISO_ALPHA3, COUNTRY_NAMES } from './iso3166.js';

export const UNREADABLE = new Set(['?', '??', '???', '????', '#n/a', 'n/a', 'na', '#value!', '#ref!', '###', '-', '--', '—', '–', '(illegible)', 'illegible', 'unreadable', '판독불가', '판독 불가', '확인불가', 'null', 'undefined']);

export function normSpace(s) {
  return String(s ?? '').replace(/[ 　]/g, ' ').replace(/\s+/g, ' ').trim();
}

// 빈칸 또는 판독 불가 표시인지
export function cellStatus(raw) {
  const s = normSpace(raw);
  if (s === '') return 'empty';
  if (UNREADABLE.has(s.toLowerCase())) return 'unreadable';
  if (/^\?+$/.test(s) || /\?{2,}/.test(s)) return 'unreadable';
  return 'ok';
}

export function normName(s) {
  return normSpace(s).toUpperCase().replace(/\s*-\s*/g, '-').replace(/\.$/, '');
}

export function normId(s) {
  return normSpace(s).toUpperCase().replace(/[\s\-.]/g, '');
}

// R1 문자 혼동: O↔0, I↔1, S↔5, B↔8, Z↔2 를 한쪽으로 접는다
const CONFUSE = { O: '0', I: '1', S: '5', B: '8', Z: '2' };
export const CONFUSABLE_PAIRS = [['O', '0'], ['I', '1'], ['S', '5'], ['B', '8'], ['Z', '2']];
export function confusableFold(id) {
  return normId(id).replace(/[OISBZ]/g, (c) => CONFUSE[c]);
}

const RANKS = [
  ['MASTER', ['master', 'captain', 'capt', 'mstr', 'mst', '선장']],
  ['C/O', ['co', 'chiefofficer', 'chiefmate', 'cmate', 'chofficer', '1등항해사', '일등항해사']],
  ['2/O', ['2o', '2ndofficer', 'secondofficer', '2ndmate', 'secondmate', '2off', '2등항해사', '이등항해사']],
  ['3/O', ['3o', '3rdofficer', 'thirdofficer', '3rdmate', 'thirdmate', '3off', '3등항해사', '삼등항해사']],
  ['C/E', ['ce', 'chiefengineer', 'cheng', 'chiefeng', '기관장']],
  ['2/E', ['2e', '2ndengineer', 'secondengineer', '2ndeng', '1등기관사', '일등기관사']],
  ['3/E', ['3e', '3rdengineer', 'thirdengineer', '3rdeng', '2등기관사', '이등기관사']],
  ['4/E', ['4e', '4thengineer', 'fourthengineer', '4theng', '3등기관사', '삼등기관사']],
  ['ETO', ['eto', 'electrotechnicalofficer', 'electrician', 'elec', 'elect', '전기사', '전기기사']],
  ['BOSUN', ['bosun', 'boatswain', 'bsn', 'bos', '갑판장']],
  ['AB', ['ab', 'ableseaman', 'ablebodiedseaman', 'ablebodied', '갑판수']],
  ['OS', ['os', 'ordinaryseaman', '갑판원']],
  ['FITTER', ['fitter', 'ftr', '조기장']],
  ['OILER', ['oiler', 'olr', 'motorman', '조기수']],
  ['WIPER', ['wiper', 'wpr', '기관원']],
  ['CH.COOK', ['chcook', 'chiefcook', 'cook', 'ckk', '조리장']],
  ['MESSMAN', ['messman', 'steward', 'msm', 'messboy', '조리원', '사주']],
  ['D/CDT', ['dcdt', 'deckcadet', 'cadetdeck', '갑판실습생']],
  ['E/CDT', ['ecdt', 'enginecadet', 'cadetengine', '기관실습생']],
];
const RANK_MAP = new Map();
for (const [canon, aliases] of RANKS) for (const a of [canon, ...aliases]) RANK_MAP.set(a.toLowerCase().replace(/[^0-9a-z가-힣]/g, ''), canon);
export const RANK_CANON = RANKS.map((r) => r[0]);

export function normRank(s) {
  const k = normSpace(s).toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
  return RANK_MAP.get(k) || normSpace(s).toUpperCase();
}

// 문장 안에서 직급 표현 찾기(메일 해석용). 연속 토큰 3개→1개 순으로 별칭 사전과 맞춘다
export function findRanks(sentence) {
  const out = [];
  const flat = ' ' + sentence.toLowerCase().replace(/[^0-9a-z가-힣/]+/g, ' ') + ' ';
  const squash = (x) => x.replace(/[^0-9a-z가-힣]/g, '');
  // 토큰 단위(1~3개 연속 토큰)로 맞춰 본다
  const toks = flat.trim().split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    for (let n = 3; n >= 1; n--) {
      if (i + n > toks.length) continue;
      const k = squash(toks.slice(i, i + n).join(''));
      const canon = RANK_MAP.get(k);
      if (canon && (k.length > 2 || ['ab', 'os', 'co', 'ce', '2o', '3o', '2e', '3e', '4e'].includes(k))) { out.push({ canon, index: i }); i += n - 1; break; }
    }
  }
  return out;
}

export function normGender(s) {
  const k = normSpace(s).toLowerCase();
  if (['m', 'male', 'man', '남', '남성', '남자'].includes(k)) return 'M';
  if (['f', 'female', 'woman', '여', '여성', '여자'].includes(k)) return 'F';
  if (['x', 'unspecified'].includes(k)) return 'X';
  return normSpace(s).toUpperCase();
}

export function normIdType(s) {
  const k = normSpace(s).toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
  if (['passport', 'pp', 'ppt', 'pass', 'nationalpassport', '여권'].includes(k)) return 'PASSPORT';
  if (['seamanbook', 'seamansbook', 'seamenbook', 'sb', 'sirb', 'seafareridentitydocument', 'seafarerid', 'sid', 'cdc', 'dischargebook', '선원수첩', '선원신분증명서', '선원신분증'].includes(k)) return 'SEAMAN BOOK';
  return normSpace(s).toUpperCase();
}

export function normCountry(s) {
  const t = normSpace(s).toUpperCase();
  if (ISO_ALPHA3.has(t)) return t;
  const k = t.replace(/[^0-9A-Z가-힣]/g, '');
  return COUNTRY_NAMES[k] || t;
}

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad = (n) => String(n).padStart(2, '0');
export function isoDate(y, m, d) {
  y = +y; m = +m; d = +d;
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 날짜 정규화. order: 숫자만 있는 a/b/YYYY 형식의 해석('DMY' 기본, 열 단위 추정 결과를 넘겨 받음)
export function parseDate(raw, order = 'DMY') {
  const s = normSpace(raw).toUpperCase();
  let m;
  if ((m = s.match(/^(\d{4})[-./ ](\d{1,2})[-./ ](\d{1,2})\.?$/))) return isoDate(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return isoDate(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일$/))) return isoDate(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})([-./ ])(\d{1,2})\2(\d{4})$/))) {
    // 점(.) 구분은 유럽식 DD.MM.YYYY 로 본다
    if (m[2] === '.' || order !== 'MDY') return isoDate(m[4], m[3], m[1]);
    return isoDate(m[4], m[1], m[3]);
  }
  if ((m = s.match(/^(\d{1,2})[-\s]?([A-Z]{3,4})[A-Z]*[-\s,]*(\d{4})$/)) && MONTHS[m[2]]) return isoDate(m[3], MONTHS[m[2]], m[1]);
  if ((m = s.match(/^([A-Z]{3,4})[A-Z]*[\s-]+(\d{1,2}),?[\s-]+(\d{4})$/)) && MONTHS[m[1]]) return isoDate(m[3], MONTHS[m[1]], m[2]);
  return null;
}

// 숫자 a/b/YYYY 형식이 몇 개 섞인 열에서 일·월 순서를 추정
export function inferDateOrder(raws) {
  let dmy = 0, mdy = 0;
  for (const r of raws) {
    const m = normSpace(r).match(/^(\d{1,2})([-/ ])(\d{1,2})\2(\d{4})$/);
    if (!m) continue;
    if (+m[1] > 12 && +m[3] <= 12) dmy++;
    if (+m[3] > 12 && +m[1] <= 12) mdy++;
  }
  return mdy > dmy ? 'MDY' : 'DMY';
}

// R2: 일·월 교환
export function swapDayMonth(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  return isoDate(m[1], m[3], m[2]);
}

export function normValue(field, raw, opts = {}) {
  const st = cellStatus(raw);
  if (st !== 'ok') return { value: '', status: st };
  switch (field) {
    case 'familyName':
    case 'givenNames':
      return { value: normName(raw), status: 'ok' };
    case 'pob':
      return { value: normName(raw), status: 'ok' };
    case 'rank':
      return { value: normRank(raw), status: 'ok' };
    case 'nationality':
    case 'idIssuer':
      return { value: normCountry(raw), status: 'ok' };
    case 'dob':
    case 'idExpiry': {
      const v = parseDate(raw, opts.order);
      return v ? { value: v, status: 'ok' } : { value: '', status: 'unreadable' };
    }
    case 'gender':
      return { value: normGender(raw), status: 'ok' };
    case 'idType':
      return { value: normIdType(raw), status: 'ok' };
    case 'idNumber':
      return { value: normId(raw), status: 'ok' };
    default:
      return { value: normSpace(raw), status: 'ok' };
  }
}

// 성명 비교용: 토큰을 정렬해 성/이름 순서와 무관하게
export function nameKey(family, given) {
  return `${family || ''} ${given || ''}`.toUpperCase().split(/[\s,-]+/).filter(Boolean).sort().join(' ');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function similarity(a, b) {
  if (!a && !b) return 1;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length);
}
