// 합성 평가셋 생성기(시드 고정). 명부 120개(인원 15~25) → 수정본 쌍 200개, 라벨된 변경 약 1,000건.
// 모든 인물·선박·번호는 가상이다. 이름은 흔한 성·이름 목록을 무작위로 조합했고, 신분증번호는 형식만 흉내 낸 임의 문자열,
// IMO 번호는 일부러 검증 숫자가 틀리게 만들어 실존 선박 번호와 겹치지 않게 했다.
//
// 레이아웃: 개발용 D1·D2·D3, 홀드아웃 H1·H2(최종 평가에만 사용). 홀드아웃은 헤더 별칭·날짜 형식·메일 문체가 개발용과 다르다.
// 사용: node eval/gen.mjs [--seed 20261020] [--out eval/data]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SEED = 20261020;
const FIELDS = ['familyName', 'givenNames', 'rank', 'nationality', 'dob', 'pob', 'gender', 'idType', 'idNumber', 'idIssuer', 'idExpiry'];

// ---------- 난수 ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class Rng {
  constructor(seed) { this.r = mulberry32(seed >>> 0); }
  next() { return this.r(); }
  int(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  weighted(pairs) { let t = pairs.reduce((s, p) => s + p[1], 0) * this.r(); for (const [v, w] of pairs) { if ((t -= w) < 0) return v; } return pairs.at(-1)[0]; }
}

// ---------- 인물 재료(흔한 성·이름. 조합은 가상) ----------
const NAMES = {
  KOR: { f: ['KIM', 'LEE', 'PARK', 'CHOI', 'JUNG', 'KANG', 'CHO', 'YOON', 'JANG', 'LIM', 'HAN', 'OH', 'SEO', 'SHIN', 'KWON'], g: ['MINJUN', 'SEOJUN', 'DOYUN', 'JIHO', 'HYUNWOO', 'SUNGMIN', 'DONGHYUN', 'JAEWON', 'YOUNGSOO', 'SANGHOON', 'JIHOON', 'TAEYANG'], gf: ['SOYEON', 'JIYEON', 'MINJI'] },
  PHL: { f: ['SANTOS', 'REYES', 'CRUZ', 'BAUTISTA', 'GARCIA', 'MENDOZA', 'TORRES', 'VILLANUEVA', 'RAMOS', 'AQUINO', 'CASTILLO', 'FLORES', 'DELA CRUZ', 'DE LEON'], g: ['JUAN', 'MARK', 'JOHN PAUL', 'RONALDO', 'JOMAR', 'MICHAEL', 'JERICHO', 'ARNEL', 'RODEL', 'CHRISTIAN', 'JAYSON', 'RANDY'], gf: ['MARIA CLARA', 'ANGELICA', 'KRISTINE'] },
  MMR: { f: ['AUNG', 'KYAW', 'ZAW', 'HTET', 'MIN', 'THANT', 'NAING', 'SOE', 'WIN', 'TUN'], g: ['MYO MIN', 'KO KO', 'ZAW LIN', 'HTUN HTUN', 'THET NAING', 'AUNG MYO', 'NYI NYI', 'YE LIN'], gf: ['SU MON', 'THIDA'] },
  VNM: { f: ['NGUYEN', 'TRAN', 'LE', 'PHAM', 'HOANG', 'PHAN', 'VU', 'DANG', 'BUI', 'DO'], g: ['VAN AN', 'VAN HUNG', 'MINH TUAN', 'DUC THANG', 'QUANG HUY', 'VAN NAM', 'THANH SON', 'HOANG LONG'], gf: ['THI LAN', 'THU HA'] },
  IND: { f: ['SINGH', 'KUMAR', 'SHARMA', 'PATEL', 'NAIR', 'MENON', 'PILLAI', 'RAO', 'GUPTA', 'YADAV'], g: ['RAHUL', 'AMIT', 'VIKRAM', 'SURESH', 'RAJESH', 'ANIL', 'PRADEEP', 'DEEPAK', 'ARJUN', 'KIRAN'], gf: ['PRIYA', 'ANJALI'] },
  IDN: { f: ['SAPUTRA', 'WIJAYA', 'SANTOSO', 'HIDAYAT', 'NUGROHO', 'PRATAMA', 'SETIAWAN', 'KURNIAWAN', 'SIREGAR', 'HARAHAP'], g: ['AGUS', 'BUDI', 'DEDI', 'RIZKY', 'ANDI', 'EKO', 'FAJAR', 'HENDRA', 'IWAN', 'YUSUF'], gf: ['DEWI', 'SITI'] },
  UKR: { f: ['KOVALENKO', 'BONDARENKO', 'TKACHENKO', 'SHEVCHENKO', 'KRAVCHENKO', 'MELNYK', 'BOYKO', 'MOROZ', 'LYSENKO', 'POLISHCHUK'], g: ['OLEKSANDR', 'ANDRII', 'SERHII', 'DMYTRO', 'MYKOLA', 'VOLODYMYR', 'IHOR', 'YURII', 'MAKSYM', 'VIKTOR'], gf: ['OLENA', 'IRYNA'] },
  CHN: { f: ['WANG', 'LI', 'ZHANG', 'LIU', 'CHEN', 'YANG', 'ZHAO', 'HUANG', 'ZHOU', 'WU'], g: ['WEI', 'JIAN', 'MING', 'HAO', 'LEI', 'JUN', 'PENG', 'TAO', 'QIANG', 'BO'], gf: ['LI NA', 'XIU YING'] },
};
const POB = {
  KOR: ['BUSAN', 'SEOUL', 'MOKPO', 'TONGYEONG', 'YEOSU'], PHL: ['MANILA', 'CEBU', 'ILOILO', 'DAVAO', 'BATANGAS'], MMR: ['YANGON', 'MANDALAY', 'PATHEIN', 'MAWLAMYINE'],
  VNM: ['HAI PHONG', 'HANOI', 'NAM DINH', 'THANH HOA', 'VINH'], IND: ['MUMBAI', 'KOCHI', 'CHENNAI', 'KOLKATA', 'GOA'], IDN: ['JAKARTA', 'SURABAYA', 'SEMARANG', 'MAKASSAR', 'MEDAN'],
  UKR: ['ODESA', 'MYKOLAIV', 'KHERSON', 'IZMAIL', 'KYIV'], CHN: ['DALIAN', 'QINGDAO', 'SHANGHAI', 'NINGBO', 'FUZHOU'],
};
const BAD_CODE = { KOR: 'KR', PHL: 'PHI', MMR: 'MYA', VNM: 'VIE', IND: 'IN', IDN: 'INA', UKR: 'UKA', CHN: 'PRC' };
const OFFICER_NATS = ['KOR', 'UKR', 'IND', 'CHN', 'PHL'];
const RATING_NATS = ['PHL', 'MMR', 'VNM', 'IDN', 'IND', 'CHN'];
const OFFICERS = new Set(['MASTER', 'C/O', '2/O', '3/O', 'C/E', '2/E', '3/E', '4/E', 'ETO']);
const BASE_RANKS = ['MASTER', 'C/O', '2/O', '3/O', 'C/E', '2/E', '3/E', 'BOSUN', 'AB', 'AB', 'OS', 'OILER', 'OILER', 'CH.COOK', 'MESSMAN'];
const EXTRA_RANKS = ['AB', 'OS', 'OILER', 'WIPER', 'FITTER', '4/E', 'ETO', 'D/CDT', 'E/CDT', 'AB', 'OS'];
const PROMO = { OS: 'AB', AB: 'BOSUN', WIPER: 'OILER', OILER: 'FITTER', '3/O': '2/O', '2/O': 'C/O', '3/E': '2/E', '4/E': '3/E', MESSMAN: 'CH.COOK', 'D/CDT': '3/O', 'E/CDT': '4/E' };
const ALL_RANKS = [...new Set([...BASE_RANKS, ...EXTRA_RANKS])];
const RANK_FULL = { MASTER: 'Master', 'C/O': 'Chief Officer', '2/O': 'Second Officer', '3/O': 'Third Officer', 'C/E': 'Chief Engineer', '2/E': 'Second Engineer', '3/E': 'Third Engineer', '4/E': 'Fourth Engineer', ETO: 'Electro-Technical Officer', BOSUN: 'Bosun', AB: 'Able Seaman', OS: 'Ordinary Seaman', FITTER: 'Fitter', OILER: 'Oiler', WIPER: 'Wiper', 'CH.COOK': 'Chief Cook', MESSMAN: 'Messman', 'D/CDT': 'Deck Cadet', 'E/CDT': 'Engine Cadet' };
const RANK_KO = { MASTER: '선장', 'C/O': '1등항해사', '2/O': '2등항해사', '3/O': '3등항해사', 'C/E': '기관장', '2/E': '1등기관사', '3/E': '2등기관사', '4/E': '3등기관사', ETO: '전기사', BOSUN: '갑판장', AB: '갑판수', OS: '갑판원', FITTER: '조기장', OILER: '조기수', WIPER: '기관원', 'CH.COOK': '조리장', MESSMAN: '조리원', 'D/CDT': '갑판실습생', 'E/CDT': '기관실습생' };
const SAFE_LETTERS = 'ACDEFGHJKLMNPRTUVWXY'; // O I S B Z 제외(혼동 문자 주입을 분명히 하기 위해)
const CONF_TO_LETTER = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z' };
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const PORTS = ['BUSAN', 'ULSAN', 'INCHEON', 'GWANGYANG', 'PYEONGTAEK'];
const LAST_PORTS = ['SHANGHAI', 'TOKYO', 'KAOHSIUNG', 'SINGAPORE', 'QINGDAO', 'HONG KONG'];
const FLAGS = ['PAN', 'LBR', 'MHL', 'KOR', 'SGP'];
const SHIP_WORDS = ['ARIRANG', 'HANBIT', 'SEA PIONEER', 'BLUE HARMONY', 'OCEAN ROSE', 'NORTH STAR', 'GREEN WAVE', 'SILVER GULL', 'MORNING CALM', 'EAST BRIDGE'];

// ---------- 날짜 ----------
const pad = (n) => String(n).padStart(2, '0');
const toIso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (iso, n) => { const d = fromIso(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
const parts = (iso) => iso.split('-').map(Number);
function validIso(y, m, d) { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null; }
function swapDM(iso) { const [y, m, d] = parts(iso); return validIso(y, d, m); }

export function fmtDate(iso, fmt) {
  const [y, m, d] = parts(iso);
  switch (fmt) {
    case 'ISO': return iso;
    case 'DMY/': return `${pad(d)}/${pad(m)}/${y}`;
    case 'DMON': return `${pad(d)}-${MON[m - 1]}-${y}`;
    case 'YMD.': return `${y}.${pad(m)}.${pad(d)}`;
    case 'MDY/': return `${pad(m)}/${pad(d)}/${y}`;
    case 'YMD/': return `${y}/${pad(m)}/${pad(d)}`;
    case 'DMY-YY': return `${pad(d)}-${pad(m)}-${String(y).slice(2)}`;
    case 'DMY-': return `${pad(d)}-${pad(m)}-${y}`;
    case 'YMDc': return `${y}${pad(m)}${pad(d)}`;
    case 'DMONYY': return `${pad(d)} ${MON[m - 1]} ${String(y).slice(2)}`;
    default: throw new Error(fmt);
  }
}

// ---------- 레이아웃 ----------
// cols: [필드, 머리글]. 'no'는 순번.
export const LAYOUTS = {
  D1: {
    id: 'D1', split: 'dev', delim: ',', date: 'ISO', rank: 'full', gender: 'M', idType: 'en', mail: 'en1', footer: true,
    pre: (h) => [['CREW LIST (IMO FAL Form 5)', 'Arrival'], ['1.1 Name of ship', h.ship], ['1.2 IMO number', h.imo], ['1.3 Call sign', h.call], ['1.4 Voyage number', h.voy], ['2. Port of arrival/departure', h.port], ['3. Date of arrival/departure', fmtDate(h.date, 'ISO')], ['4. Flag State of ship', h.flag], ['5. Last port of call', h.last]],
    cols: [['no', '6. No.'], ['familyName', '7. Family name'], ['givenNames', '8. Given names'], ['rank', '9. Rank or rating'], ['nationality', '10. Nationality'], ['dob', '11. Date of birth'], ['pob', '12. Place of birth'], ['gender', '13. Gender'], ['idType', '14. Nature of identity document'], ['idNumber', '15. Number of identity document'], ['idIssuer', '16. Issuing State of identity document'], ['idExpiry', '17. Expiry date of identity document']],
  },
  D2: {
    id: 'D2', split: 'dev', delim: '\t', date: 'DMY/', rank: 'abbr', gender: 'M', idType: 'short', mail: 'en1',
    pre: (h) => [['Vessel:', h.ship], ['IMO No.:', h.imo], ['Voy No.:', h.voy], ['Port:', h.port], ['ETA:', fmtDate(h.date, 'DMY/')], ['Flag:', h.flag]],
    cols: [['no', 'No.'], ['rank', 'Rank'], ['familyName', 'Surname'], ['givenNames', 'First name'], ['nationality', 'Nationality'], ['gender', 'Sex'], ['dob', 'D.O.B'], ['pob', 'P.O.B'], ['idType', 'Doc type'], ['idNumber', 'Passport No.'], ['idIssuer', 'Issued by'], ['idExpiry', 'Expiry']],
  },
  D3: {
    id: 'D3', split: 'dev', delim: ';', date: 'DMON', rank: 'full', gender: 'Male', idType: 'en', mail: 'en1',
    pre: (h) => [['Ship name', h.ship], ['Call sign', h.call], ['Voyage', h.voy], ['Arrival date', fmtDate(h.date, 'DMON')], ['Last port', h.last]],
    cols: [['no', 'Seq'], ['familyName', 'Last name'], ['givenNames', 'Given name'], ['rank', 'Position'], ['nationality', 'Nation'], ['dob', 'Birth date'], ['pob', 'Birthplace'], ['gender', 'M/F'], ['idType', 'ID type'], ['idNumber', 'Seaman book no.'], ['idIssuer', 'Issuing country'], ['idExpiry', 'Valid until']],
  },
  // ---- 홀드아웃: 개발·튜닝에 쓰지 않음 ----
  H1: {
    id: 'H1', split: 'holdout', delim: '\t', date: 'YMD.', rank: 'ko', gender: 'ko', idType: 'ko', mail: 'ko',
    pre: (h) => [['선원명부'], ['선명', h.ship], ['호출부호', h.call], ['항차', h.voy], ['입항지', h.port], ['입항일', fmtDate(h.date, 'YMD.')], ['직전기항지', h.last]],
    cols: [['no', '번호'], ['rank', '직책'], ['familyName', '성'], ['givenNames', '이름'], ['gender', '성별'], ['nationality', '국적'], ['dob', '생년월일'], ['pob', '출생지'], ['idType', '신분증 종류'], ['idNumber', '여권번호'], ['idIssuer', '발급국'], ['idExpiry', '만료일']],
  },
  H2: {
    id: 'H2', split: 'holdout', delim: ',', date: 'MDY/', rank: 'abbr', gender: 'M', idType: 'short', mail: 'en2',
    pre: (h) => [[`VSL: ${h.ship}`], [`VOY: ${h.voy}`], [`ETA: ${fmtDate(h.date, 'MDY/')}`], [`PORT: ${h.port}`]],
    cols: [['no', 'SN'], ['familyName', 'LAST NAME'], ['givenNames', 'FIRST & MIDDLE NAME'], ['nationality', "NAT'Y"], ['rank', 'RANK/RATING'], ['dob', 'BIRTH DATE (MM/DD/YYYY)'], ['pob', 'BIRTH PLACE'], ['gender', 'SEX'], ['idType', 'TRAVEL DOC.'], ['idNumber', 'TRAVEL DOC. NO.'], ['idIssuer', 'ISSUING AUTHORITY'], ['idExpiry', 'DOC. EXPIRY (MM/DD/YYYY)']],
  },
  // ---- 홀드아웃 H3: eval/H3-spec.md (엔진 고정 후 설계, 1회만 실행) ----
  H3: {
    id: 'H3', split: 'holdout3', delim: ',', date: 'YMD/', dateExp: 'DMONYY', rank: 'abbr', gender: 'M', idType: 'sirb', mail: 'en3',
    pre: (h) => [[`Vessel Name: ${h.ship}`], [`Voyage: ${h.voy}`], [`ETA: ${fmtDate(h.date, 'YMD/')}`], [`Port of Arrival: ${h.port}`]],
    cols: [['no', '#'], ['rank', 'Rank (Cargo)'], ['familyName', '7. Family name (Apellido)'], ['givenNames', '8. Given names (Nombres)'], ['nationality', 'Nacionalidad'], ['gender', 'Sexo'], ['dob', 'Date of Birth (Fecha de nac.)'], ['pob', 'Lugar de nacimiento'], ['idType', 'Doc. Type'], ['idNumber', 'Passport/SIRB No.'], ['idIssuer', 'Issuing State'], ['idExpiry', 'Expiry date']],
  },
  // ---- 홀드아웃 H4: eval/H4-spec.md (일반화 개선 후 설계, 1회만 실행). 열 순서는 쌍마다 무작위 ----
  H4: {
    id: 'H4', split: 'holdout4', delim: ';', date: 'DMY-YY', dateExp: 'YMDc', rank: 'abbr', gender: 'LP', idType: 'de', mail: 'id4', shuffleCols: true,
    pre: (h) => [[`Schiffsname: ${h.ship}`], [`Reise-Nr.: ${h.voy}`], [`ETA: ${fmtDate(h.date, 'DMY-').replace(/-/g, '.')}`], [`Hafen: ${h.port}`]],
    cols: [['no', 'Lfd. Nr.'], ['familyName', 'Nachname'], ['givenNames', 'Vorname(n)'], ['rank', 'Dienstgrad / Jabatan'], ['nationality', 'Staatsangehörigkeit'], ['dob', 'Geburtsdatum'], ['pob', 'Geburtsort / Tempat lahir'], ['gender', 'Geschlecht'], ['idType', 'Ausweisart'], ['idNumber', 'Nomor Paspor'], ['idIssuer', 'Ausstellungsstaat'], ['idExpiry', 'Gültig bis / Berlaku s.d.']],
  },
};
export const SPLIT_LAYOUTS = { dev: ['D1', 'D2', 'D3'], holdout: ['H1', 'H2'], holdout3: ['H3'], holdout4: ['H4'] };

function fmtRank(c, style) {
  if (style === 'full') return RANK_FULL[c];
  if (style === 'ko') return RANK_KO[c];
  return c;
}
function fmtGender(g, style) {
  if (style === 'Male') return g === 'M' ? 'Male' : 'Female';
  if (style === 'ko') return g === 'M' ? '남' : '여';
  if (style === 'LP') return g === 'M' ? 'L' : 'P';
  return g;
}
function fmtIdType(t, style) {
  if (style === 'ko') return t === 'PASSPORT' ? '여권' : '선원수첩';
  if (style === 'short') return t === 'PASSPORT' ? 'PP' : 'SB';
  if (style === 'sirb') return t === 'PASSPORT' ? 'PASSPORT' : 'SIRB';
  if (style === 'de') return t === 'PASSPORT' ? 'Reisepass' : 'Seefahrtsbuch';
  return t === 'PASSPORT' ? 'Passport' : "Seaman's book";
}
export function fmtCell(f, p, L) {
  const v = p[f];
  if (f === 'rank') return fmtRank(v, L.rank);
  if (f === 'dob') return fmtDate(v, L.date);
  if (f === 'idExpiry') return fmtDate(v, L.dateExp || L.date);
  if (f === 'gender') return fmtGender(v, L.gender);
  if (f === 'idType') return fmtIdType(v, L.idType);
  return v;
}
function csvCell(s, delim) {
  s = String(s ?? '');
  return s.includes(delim) || s.includes('"') || /\n/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// rows: [{p, ov}] → { text, raws: [[raw per FIELDS]] }
function renderList(L, head, rows) {
  const out = [];
  for (const r of L.pre(head)) out.push(r.map((c) => csvCell(c, L.delim)).join(L.delim));
  out.push('');
  out.push(L.cols.map(([, h]) => csvCell(h, L.delim)).join(L.delim));
  const raws = [];
  rows.forEach((r, i) => {
    const cell = (f) => (f === 'no' ? String(i + 1) : r.ov && f in r.ov ? r.ov[f] : fmtCell(f, r.p, L));
    out.push(L.cols.map(([f]) => csvCell(cell(f), L.delim)).join(L.delim));
    raws.push(Object.fromEntries(FIELDS.map((f) => [f, cell(f)])));
  });
  if (L.footer) { out.push(''); out.push('18. Date and signature by master, authorized agent or officer'); }
  return { text: out.join('\n') + '\n', raws };
}

// ---------- 인물·명부 ----------
function makeId(r, type) {
  for (;;) {
    const letters = type === 'PASSPORT' ? 2 : 3;
    const digits = type === 'PASSPORT' ? 7 : 6;
    let s = '';
    for (let i = 0; i < letters; i++) s += SAFE_LETTERS[r.int(0, SAFE_LETTERS.length - 1)];
    for (let i = 0; i < digits; i++) s += r.int(0, 9);
    if (/[01258]/.test(s)) return s;
  }
}
function makePerson(r, pid, rank, nat, arrival, taken) {
  const pool = NAMES[nat];
  const gender = !['MASTER', 'C/E'].includes(rank) && r.chance(0.05) ? 'F' : 'M';
  let familyName, givenNames;
  for (;;) {
    familyName = r.pick(pool.f);
    givenNames = r.pick(gender === 'F' ? pool.gf : pool.g);
    const key = `${familyName} ${givenNames}`.split(' ').sort().join(' ');
    if (!taken.has(key) && familyName !== givenNames) { taken.add(key); break; }
  }
  const [lo, hi] = OFFICERS.has(rank) ? [28, 62] : /CDT/.test(rank) ? [19, 24] : [20, 58];
  const dob = addDays(arrival, -(r.int(lo, hi) * 365 + r.int(0, 364)));
  const idType = r.chance(0.85) ? 'PASSPORT' : 'SEAMAN BOOK';
  return {
    pid, familyName, givenNames, rank, nationality: nat, dob, pob: r.pick(POB[nat]), gender, idType,
    idNumber: makeId(r, idType), idIssuer: nat, idExpiry: addDays(arrival, r.int(200, 3600)),
  };
}
function makeImo(r) {
  // 7자리. 마지막 검증 숫자를 일부러 틀리게 해 실존 IMO 번호와 겹치지 않게 한다
  const d = [9, r.int(0, 9), r.int(0, 9), r.int(0, 9), r.int(0, 9), r.int(0, 9)];
  const check = d.reduce((s, x, i) => s + x * (7 - i), 0) % 10;
  return d.join('') + ((check + 1 + r.int(0, 8)) % 10);
}
function makeRoster(seed, idx) {
  const r = new Rng(seed * 31 + idx * 1009 + 7);
  const n = r.int(15, 25);
  const ranks = [...BASE_RANKS];
  while (ranks.length < n) ranks.push(r.pick(EXTRA_RANKS));
  const offNat = r.pick(OFFICER_NATS);
  const ratNats = r.shuffle(RATING_NATS).slice(0, r.int(1, 2));
  const date = toIso(new Date(Date.UTC(2026, 9, 25 + r.int(0, 60))));
  const head = {
    ship: `DEMO ${r.pick(SHIP_WORDS)} ${r.int(1, 9)}`, imo: makeImo(r), call: `D${SAFE_LETTERS[r.int(0, 19)]}${SAFE_LETTERS[r.int(0, 19)]}${r.int(10, 99)}`,
    voy: `26${pad(r.int(1, 40))}${r.pick(['E', 'W', 'N', 'S'])}`, port: r.pick(PORTS), date, flag: r.pick(FLAGS), last: r.pick(LAST_PORTS),
  };
  const taken = new Set();
  const persons = ranks.map((rank, i) => makePerson(r, `R${idx}-${i + 1}`, rank, OFFICERS.has(rank) || /CDT/.test(rank) ? offNat : r.pick(ratNats), date, taken));
  return { idx, head, persons, taken };
}

// ---------- 메일 문체 ----------
function mailName(p, style) {
  if (style === 'en2') return `${title(p.givenNames)} ${title(p.familyName)}`;
  if (style === 'en3') return `${p.givenNames} ${p.familyName}`;
  if (style === 'id4') return `${p.familyName}, ${p.givenNames}`;
  return `${p.familyName} ${p.givenNames}`;
}
const title = (s) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
function mailRank(c, style) { return style === 'en2' ? RANK_FULL[c] : c; }
function mailDate(iso, style) { return style === 'ko' ? fmtDate(iso, 'YMD.') : style === 'en2' ? fmtDate(iso, 'MDY/') : style === 'en3' ? fmtDate(iso, 'YMD/') : style === 'id4' ? fmtDate(iso, 'DMY-') : iso; }
const FIELD_WORD = {
  en1: { dob: 'date of birth', idNumber: 'passport number', givenNames: 'given name', pob: 'place of birth', idExpiry: 'passport expiry date' },
  en2: { dob: 'birth date', idNumber: 'travel document number', givenNames: 'first name', pob: 'birthplace', idExpiry: 'document expiry' },
  en3: { dob: 'DOB', idNumber: 'passport no.', givenNames: 'first name', pob: 'place of birth', idExpiry: 'passport expiry' },
  id4: { dob: 'tanggal lahir (DOB)', idNumber: 'no. paspor', givenNames: 'nama depan', pob: 'tempat lahir', idExpiry: 'masa berlaku paspor' },
  ko: { dob: '생년월일', idNumber: '여권번호', givenNames: '이름', pob: '출생지', idExpiry: '여권 만료일' },
};
function mailValue(f, v, style, r) {
  if (f === 'dob' || f === 'idExpiry') return style === 'en1' && r.chance(0.5) ? fmtDate(v, 'DMON') : mailDate(v, style);
  return v;
}
const T = {
  sign_off: {
    en1: (p, h, r) => r.pick([`${mailRank(p.rank, 'en1')} ${mailName(p, 'en1')} will sign off at ${h.port} on ${mailDate(addDays(h.date, 1), 'en1')}.`, `Please note ${mailRank(p.rank, 'en1')} ${mailName(p, 'en1')} to disembark at ${h.port} for repatriation.`]),
    en2: (p, h) => `OFF-SIGNER: ${mailRank(p.rank, 'en2')} ${mailName(p, 'en2')} - disembarking ${title(h.port)} ${mailDate(addDays(h.date, 1), 'en2')}.`,
    ko: (p, h) => `${p.rank} ${mailName(p, 'ko')} ${h.port}에서 하선 예정입니다.`,
    id4: (p, h) => `Mohon dicatat: ${p.rank} ${mailName(p, 'id4')} sign off di ${h.port}.`,
    en3: (p, h) => `Pls be advised that ${p.rank} ${mailName(p, 'en3')} will disembark at ${h.port}.`,
  },
  sign_on: {
    en1: (p, h, r) => r.pick([`${mailRank(p.rank, 'en1')} ${mailName(p, 'en1')} (passport ${p.idNumber}) will join the vessel at ${h.port}.`, `New crew: ${mailRank(p.rank, 'en1')} ${mailName(p, 'en1')}, ${p.nationality}, to sign on at ${h.port}.`]),
    en2: (p, h) => `ON-SIGNER: ${mailRank(p.rank, 'en2')} ${mailName(p, 'en2')}, PP NO. ${p.idNumber}, embarking ${title(h.port)}.`,
    ko: (p, h) => `${p.rank} ${mailName(p, 'ko')}(여권 ${p.idNumber}) ${h.port}에서 승선합니다.`,
    id4: (p, h) => `Crew baru: ${p.rank} ${mailName(p, 'id4')} (paspor ${p.idNumber}) join di ${h.port}.`,
    en3: (p) => `Joining: ${p.rank} ${mailName(p, 'en3')}, PPT ${p.idNumber}, ${p.nationality}.`,
  },
  rank_change: {
    en1: (p, o, n, r) => r.pick([`${mailName(p, 'en1')} promoted from ${o} to ${n} with effect from arrival.`, `Rank change: ${mailName(p, 'en1')} ${o} -> ${n}.`]),
    en2: (p, o, n) => `${mailName(p, 'en2')} upgraded from ${RANK_FULL[o]} to ${RANK_FULL[n]}.`,
    ko: (p, o, n) => `${mailName(p, 'ko')} 직급 변경: ${o} → ${n}`,
    id4: (p, o, n) => `Kenaikan jabatan ${mailName(p, 'id4')}: ${o} menjadi ${n}.`,
    en3: (p, o, n) => `Promotion - ${mailName(p, 'en3')} from ${o} to ${n}.`,
  },
  correction: {
    en1: (p, f, v, r) => r.pick([`Please correct ${FIELD_WORD.en1[f]} of ${mailName(p, 'en1')} to ${v}.`, `${FIELD_WORD.en1[f][0].toUpperCase() + FIELD_WORD.en1[f].slice(1)} of ${mailName(p, 'en1')} should read ${f === 'givenNames' || f === 'pob' ? `"${v}"` : v}.`]),
    en2: (p, f, v) => `Kindly amend ${FIELD_WORD.en2[f]} for ${mailName(p, 'en2')} to read ${v}.`,
    id4: (p, f, v, r) => (r.chance(0.5) ? `Mohon koreksi ${FIELD_WORD.id4[f]} ${mailName(p, 'id4')} menjadi ${v}.` : `Koreksi data ${p.familyName} ${p.givenNames}, ${FIELD_WORD.id4[f]}: ${mailValue(f, p[f], 'id4', r)} -> ${v}`),
    en3: (p, f, v) => `Kindly correct the ${FIELD_WORD.en3[f]} of ${mailName(p, 'en3')}, should be ${v}.`,
    ko: (p, f, v) => `${mailName(p, 'ko')} ${FIELD_WORD.ko[f]} ${f === 'givenNames' || f === 'pob' ? `"${v}"` : v}(으)로 정정 바랍니다.`.replace('(으)로', /[가-힣]$/.test(v) ? '으로' : '로'),
  },
};
const NOISE = {
  en1: { head: (h) => ['Dear Agent,', '', `Please find attached the revised crew list for ${h.ship} V.${h.voy}.`], extra: (h) => `Joining crew will arrive by air on ${addDays(h.date, -1)}.`, none: 'No crew change at this port.', tail: ['', 'Best regards,', 'Crewing Dept. (demo)'] },
  en2: { head: () => ['Good day,', '', 'Attached pls find updated crew list.'], extra: () => 'Crew change subject to immigration clearance.', none: 'No crew change.', tail: ['', 'Rgds,', 'Manning (demo)'] },
  id4: { head: (h) => ['Selamat siang Bapak/Ibu,', '', `Terlampir crew list revisi untuk ${h.ship}.`], extra: (h) => `Crew change di ${h.port} sesuai jadwal.`, none: 'Tidak ada pergantian crew.', tail: ['', 'Terima kasih,', 'Crewing (demo)'] },
  en3: { head: () => ['Hi Sir/Maam,', '', 'Pls see attached crew list.'], extra: () => 'Crew change via Manila, flight details to follow.', none: 'No crew change this port.', tail: ['', 'Thanks and regards,', 'Crewing (demo)'] },
  ko: { head: (h) => ['대리점 담당자님 안녕하세요.', '', `${h.ship} ${h.voy} 항차 수정 선원명부 송부드립니다.`], extra: () => '교대 인원은 항공편으로 전날 도착합니다.', none: '이번 기항에는 선원 교대가 없습니다.', tail: ['', '감사합니다.', '선원관리팀 (데모)'] },
};

// ---------- 쌍 생성 ----------
const EXPECTED_TYPES = [['crew_change', 3], ['sign_off', 1], ['sign_on', 1], ['rank_change', 2], ['correction', 3]];
const CHECK_TYPES = [['rank_silent', 1], ['renewal', 1], ['sign_on_silent', 0.6], ['sign_off_silent', 0.6], ['pob_silent', 0.8]];
const SUSPECT_TYPES = [['R1', 1], ['R2', 1], ['R3', 1], ['R4', 1], ['R5', 1], ['R6', 1], ['R7nat', 0.5], ['R7dob', 0.5], ['R8off', 0.4], ['R8on', 0.4], ['R8rank', 0.4], ['R8corr', 0.4], ['R8wrong', 0.4]];
const COSMETIC_TYPES = ['case', 'space', 'datefmt', 'rankalias'];

function makePair(seed, i, roster, split) {
  const r = new Rng(seed * 17 + i * 7919 + 3);
  const lays = SPLIT_LAYOUTS[split];
  const LA = LAYOUTS[lays[i % lays.length]];
  let LB = lays.length > 1 && r.chance(0.2) ? LAYOUTS[r.pick(lays.filter((x) => x !== LA.id))] : LA;
  let LAx = LA;
  if (LA.shuffleCols) { LAx = { ...LA, cols: r.shuffle(LA.cols) }; LB = LAx; }
  const style = LA.mail;
  const h = roster.head;
  const taken = new Set(roster.taken);
  const A = roster.persons.map((p) => ({ ...p }));
  const B = A.map((p) => ({ p: { ...p }, ov: {} }));
  const bOf = (pid) => B.find((e) => e.p.pid === pid);
  const labels = [];
  const dirs = []; // { text, labels: [] } → 줄 번호는 마지막에
  const eventFields = new Map(); // pid → Set(fields) 이벤트가 건드린 항목(표기 변경 라벨에서 제외)
  const touch = (pid, ...fs) => { if (!eventFields.has(pid)) eventFields.set(pid, new Set()); for (const f of fs) eventFields.get(pid).add(f); };
  let newCount = 0;
  const newPerson = (rank, nat) => makePerson(r, `P${i}-N${++newCount}`, rank, nat, h.date, taken);
  const used = new Set();
  const take = (pred = () => true) => {
    const c = r.shuffle(A).filter((p) => !used.has(p.pid) && pred(p));
    if (!c.length) return null;
    used.add(c[0].pid);
    return c[0];
  };
  const dir = (text) => { const d = { text, labels: [] }; dirs.push(d); return d; };
  const lab = (key, truth, extra = {}) => { const l = { key, truth, ...extra }; labels.push(l); return l; };
  const lab8 = (d, extra = {}) => { const l = lab(null, 'suspect', { rule: 'R8', kind: 'directive', ...extra }); d.labels.push(l); return l; };
  const removeB = (pid) => { const k = B.findIndex((e) => e.p.pid === pid); B.splice(k, 1); return k; };
  const events = [];

  // 1) 예상된 변경(메일 지시 있음)
  for (let k = r.int(1, 3); k > 0; k--) {
    const t = r.weighted(EXPECTED_TYPES);
    if (t === 'crew_change' || t === 'sign_off') {
      const x = take((p) => p.rank !== 'MASTER'); if (!x) continue;
      const k2 = removeB(x.pid);
      const d1 = dir(T.sign_off[style](x, h, r));
      d1.labels.push(lab(`${x.pid}|-`, 'expected', { kind: 'remove' }));
      if (t === 'crew_change') {
        const y = newPerson(x.rank, x.nationality);
        B.splice(k2, 0, { p: y, ov: {} });
        const d2 = dir(T.sign_on[style](y, h, r));
        d2.labels.push(lab(`${y.pid}|+`, 'expected', { kind: 'add' }));
      }
      events.push(t);
    } else if (t === 'sign_on') {
      const y = newPerson(r.pick(['AB', 'OS', 'OILER', 'WIPER', 'D/CDT']), r.pick(RATING_NATS));
      B.push({ p: y, ov: {} });
      dir(T.sign_on[style](y, h, r)).labels.push(lab(`${y.pid}|+`, 'expected', { kind: 'add' }));
      events.push(t);
    } else if (t === 'rank_change') {
      const x = take((p) => PROMO[p.rank]); if (!x) continue;
      const n = PROMO[x.rank];
      bOf(x.pid).p.rank = n; touch(x.pid, 'rank');
      dir(T.rank_change[style](x, x.rank, n, r)).labels.push(lab(`${x.pid}|rank`, 'expected', { kind: 'modify' }));
      events.push(t);
    } else if (t === 'correction') {
      const f = r.pick(['dob', 'dob', 'idNumber', 'idNumber', 'givenNames', 'pob', 'idExpiry']);
      const x = take((p) => (f !== 'givenNames' || p.givenNames.replace(/ /g, '').length >= 4)); if (!x) continue;
      const truth = x[f];
      let wrong, hard = false;
      if (f === 'dob') {
        const sw = swapDM(truth);
        if (sw && sw !== truth && r.chance(0.6)) { wrong = sw; hard = true; } else wrong = addDays(truth, r.pick([-365, 365, -31, 31, 10, -10]));
      } else if (f === 'idNumber') {
        const pos = [...truth].map((c, j) => (CONF_TO_LETTER[c] ? j : -1)).filter((j) => j >= 0);
        if (pos.length && r.chance(0.6)) { const j = r.pick(pos); wrong = truth.slice(0, j) + CONF_TO_LETTER[truth[j]] + truth.slice(j + 1); hard = true; } else {
          const j = r.int(truth.length - 7, truth.length - 2); wrong = truth.slice(0, j) + truth[j + 1] + truth[j] + truth.slice(j + 2);
          if (wrong === truth) wrong = truth.slice(0, -1) + ((+truth.at(-1) + 3) % 10);
        }
      } else if (f === 'givenNames') {
        const j = r.int(1, truth.length - 2);
        wrong = truth[j] === ' ' ? truth.slice(0, j) + truth.slice(j + 1) : truth.slice(0, j) + truth.slice(j + 1);
      } else if (f === 'pob') wrong = r.pick(POB[x.nationality].filter((c) => c !== truth));
      else wrong = addDays(truth, 365);
      // 최초본이 틀렸고 수정본에서 바로잡은 경우
      x[f] = wrong; // A 값
      bOf(x.pid).p[f] = truth; touch(x.pid, f);
      dir(T.correction[style]({ ...x, [f]: wrong }, f, mailValue(f, truth, style, r), r)).labels.push(lab(`${x.pid}|${f}`, 'expected', { kind: 'modify', hardNegative: hard ? (f === 'dob' ? 'R2' : 'R1') : null }));
      events.push(t + ':' + f + (hard ? ':hard' : ''));
    }
  }
  // 2) 지시 없는 실질 변경 → 정답 check
  for (let k = r.int(0, 2); k > 0; k--) {
    const t = r.weighted(CHECK_TYPES);
    if (t === 'rank_silent') {
      const x = take((p) => PROMO[p.rank]); if (!x) continue;
      bOf(x.pid).p.rank = PROMO[x.rank]; touch(x.pid, 'rank');
      lab(`${x.pid}|rank`, 'check', { kind: 'modify' });
    } else if (t === 'renewal') {
      const x = take(); if (!x) continue;
      const e = bOf(x.pid).p;
      e.idNumber = makeId(r, e.idType); e.idExpiry = addDays(h.date, r.int(3000, 3650)); touch(x.pid, 'idNumber', 'idExpiry');
      lab(`${x.pid}|idNumber`, 'check', { kind: 'modify' }); lab(`${x.pid}|idExpiry`, 'check', { kind: 'modify' });
    } else if (t === 'sign_on_silent') {
      const y = newPerson(r.pick(['AB', 'OS', 'OILER', 'WIPER']), r.pick(RATING_NATS));
      B.splice(r.int(1, B.length), 0, { p: y, ov: {} });
      lab(`${y.pid}|+`, 'check', { kind: 'add' });
    } else if (t === 'sign_off_silent') {
      const x = take((p) => p.rank !== 'MASTER'); if (!x) continue;
      removeB(x.pid); lab(`${x.pid}|-`, 'check', { kind: 'remove' });
    } else if (t === 'pob_silent') {
      const x = take(); if (!x) continue;
      bOf(x.pid).p.pob = r.pick(POB[x.nationality].filter((c) => c !== x.pob)); touch(x.pid, 'pob');
      lab(`${x.pid}|pob`, 'check', { kind: 'modify' });
    }
    events.push(t);
  }
  // 3) 오류 주입 → 정답 suspect
  for (let k = r.pick([0, 1, 1, 2, 2, 3]); k > 0; k--) {
    const t = r.weighted(SUSPECT_TYPES);
    if (t === 'R1') {
      const x = take((p) => /[01258]/.test(p.idNumber.slice(-7))); if (!x) continue;
      const pos = [...x.idNumber].map((c, j) => (CONF_TO_LETTER[c] ? j : -1)).filter((j) => j >= 0);
      const j = r.pick(pos);
      bOf(x.pid).p.idNumber = x.idNumber.slice(0, j) + CONF_TO_LETTER[x.idNumber[j]] + x.idNumber.slice(j + 1); touch(x.pid, 'idNumber');
      lab(`${x.pid}|idNumber`, 'suspect', { rule: 'R1', kind: 'modify' });
    } else if (t === 'R2') {
      const x = take((p) => { const s = swapDM(p.dob); return s && s !== p.dob; }); if (!x) continue;
      bOf(x.pid).p.dob = swapDM(x.dob); touch(x.pid, 'dob');
      lab(`${x.pid}|dob`, 'suspect', { rule: 'R2', kind: 'modify' });
    } else if (t === 'R3') {
      const x = take(); if (!x) continue;
      const e = bOf(x.pid).p; [e.familyName, e.givenNames] = [x.givenNames, x.familyName]; touch(x.pid, 'familyName', 'givenNames');
      lab(`${x.pid}|familyName`, 'suspect', { rule: 'R3', kind: 'modify' }); lab(`${x.pid}|givenNames`, 'suspect', { rule: 'R3', kind: 'modify' });
    } else if (t === 'R4') {
      const x = take(); if (!x) continue;
      bOf(x.pid).p.idExpiry = addDays(h.date, -r.int(15, 400)); touch(x.pid, 'idExpiry');
      lab(`${x.pid}|idExpiry`, 'suspect', { rule: 'R4', kind: 'modify' });
    } else if (t === 'R5') {
      const x = take(); if (!x) continue;
      const k0 = B.findIndex((e) => e.p.pid === x.pid);
      B.splice(r.int(k0 + 1, B.length), 0, { p: { ...bOf(x.pid).p }, ov: {}, dup: true });
      lab(`${x.pid}|dup`, 'suspect', { rule: 'R5', kind: 'duplicate' });
    } else if (t === 'R6') {
      const x = take(); if (!x) continue;
      const f = r.pick(['idNumber', 'dob', 'idExpiry', 'nationality', 'givenNames', 'gender', 'idIssuer']);
      bOf(x.pid).ov[f] = r.pick(['???', '', '#N/A', '?']); touch(x.pid, f);
      lab(`${x.pid}|${f}`, 'suspect', { rule: 'R6', kind: 'modify' });
    } else if (t === 'R7nat') {
      const x = take(); if (!x) continue;
      const f = r.pick(['nationality', 'idIssuer']);
      bOf(x.pid).p[f] = BAD_CODE[x.nationality]; touch(x.pid, f);
      lab(`${x.pid}|${f}`, 'suspect', { rule: 'R7', kind: 'modify' });
    } else if (t === 'R7dob') {
      const x = take(); if (!x) continue;
      const [, m, d] = parts(x.dob);
      const y = parts(h.date)[0] - r.int(3, 12);
      bOf(x.pid).p.dob = validIso(y, m, d) || validIso(y, m, 28); touch(x.pid, 'dob');
      lab(`${x.pid}|dob`, 'suspect', { rule: 'R7', kind: 'modify' });
    } else if (t === 'R8off') {
      const x = take((p) => p.rank !== 'MASTER'); if (!x) continue;
      lab8(dir(T.sign_off[style](x, h, r)));
    } else if (t === 'R8on') {
      const y = newPerson(r.pick(['AB', 'OS', 'OILER']), r.pick(RATING_NATS));
      lab8(dir(T.sign_on[style](y, h, r)));
    } else if (t === 'R8rank') {
      const x = take((p) => PROMO[p.rank]); if (!x) continue;
      lab8(dir(T.rank_change[style](x, x.rank, PROMO[x.rank], r)));
    } else if (t === 'R8corr') {
      const x = take(); if (!x) continue;
      const f = r.pick(['dob', 'idNumber', 'pob']);
      const v = f === 'dob' ? addDays(x.dob, r.pick([-365, 365, 40])) : f === 'idNumber' ? makeId(r, x.idType) : r.pick(POB[x.nationality].filter((c) => c !== x.pob));
      lab8(dir(T.correction[style](x, f, mailValue(f, v, style, r), r)));
    } else if (t === 'R8wrong') {
      const x = take((p) => PROMO[p.rank]); if (!x) continue;
      const n = PROMO[x.rank];
      const wrong = r.pick(ALL_RANKS.filter((c) => c !== n && c !== x.rank && c !== 'MASTER'));
      bOf(x.pid).p.rank = wrong; touch(x.pid, 'rank');
      dir(T.rank_change[style](x, x.rank, n, r)).labels.push(lab(`${x.pid}|rank`, 'suspect', { rule: 'R8', kind: 'modify' }));
    }
    events.push(t);
  }
  // 4) 표기만 변경(대소문자·공백·날짜 형식·직급 약어) → 정답 cosmetic
  for (let k = r.int(1, 4); k > 0; k--) {
    const x = take(); if (!x) continue;
    const e = bOf(x.pid); if (!e) continue;
    const t = r.pick(COSMETIC_TYPES);
    if (t === 'case') { const f = r.pick(['familyName', 'givenNames']); e.ov[f] = title(e.p[f]); }
    else if (t === 'space') { const f = r.pick(['familyName', 'givenNames', 'pob']); e.ov[f] = r.chance(0.5) ? ` ${e.p[f]} ` : e.p[f].includes(' ') ? e.p[f].replace(' ', '  ') : `${e.p[f]} `; }
    else if (t === 'datefmt') { const f = r.pick(['dob', 'idExpiry']); e.ov[f] = fmtDate(e.p[f], LB.date === 'ISO' ? 'DMON' : 'ISO'); }
    else { e.ov.rank = LB.rank === 'full' ? e.p.rank : RANK_FULL[e.p.rank]; }
    events.push('cosmetic:' + t);
  }
  const shuffled = r.chance(0.35);
  const Bfinal = shuffled ? r.shuffle(B) : B;

  // 메일 조립(지시 줄 순서 섞기 + 인사·잡음 줄)
  const N = NOISE[style];
  const body = r.shuffle(dirs);
  const lines = [...N.head(h)];
  if (!body.length) lines.push(N.none);
  for (const d of body) { d.line = lines.length + 1; lines.push(d.text); }
  if (r.chance(0.4)) lines.push(N.extra(h));
  lines.push(...N.tail);
  for (const d of dirs) for (const l of d.labels) { l.line = d.line; if (!l.key) l.key = `R8|L${d.line}`; }

  const ra = renderList(LAx, h, A.map((p) => ({ p, ov: {} })));
  const rb = renderList(LB, h, Bfinal);
  const rowPidsA = A.map((p) => p.pid);
  const rowPidsB = Bfinal.map((e) => e.p.pid);
  // 표기만 다른 셀: 양쪽에 있는 같은 사람의, 이벤트가 건드리지 않은 항목 중 원문 문자열이 다른 것
  const cosmetic = [];
  const firstB = new Map();
  rowPidsB.forEach((pid, k) => { if (!firstB.has(pid)) firstB.set(pid, k); });
  rowPidsA.forEach((pid, ka) => {
    const kb = firstB.get(pid);
    if (kb == null) return;
    for (const f of FIELDS) {
      if (eventFields.get(pid)?.has(f)) continue;
      if (ra.raws[ka][f] !== rb.raws[kb][f]) cosmetic.push(`${pid}|${f}`);
    }
  });
  return {
    id: `${split === 'holdout3' ? 'h3-' : split === 'holdout4' ? 'h4-' : ''}pair-${String(i + 1).padStart(3, '0')}`, split, roster: roster.idx, layoutA: LA.id, layoutB: LB.id, mailStyle: style, shuffled,
    a: ra.text, b: rb.text, mail: lines.join('\n') + '\n', rowPidsA, rowPidsB, labels, cosmetic, events, cellsB: rowPidsB.length * FIELDS.length,
  };
}

export function generate(seed = DEFAULT_SEED) {
  const rosters = Array.from({ length: 120 }, (_, k) => makeRoster(seed, k));
  const pairs = [];
  for (let i = 0; i < 200; i++) {
    const split = i < 140 ? 'dev' : 'holdout';
    const roster = split === 'dev' ? rosters[i % 84] : rosters[84 + ((i - 140) % 36)];
    pairs.push(makePair(seed, i, roster, split));
  }
  return { seed, rosters: rosters.length, pairs };
}

// 홀드아웃 H3: 새 시드·새 명부 36개·쌍 60개 (eval/H3-spec.md)
export const H3_SEED = 20261101;
export function generateH3(seed = H3_SEED) {
  const rosters = Array.from({ length: 36 }, (_, k) => makeRoster(seed, k));
  const pairs = Array.from({ length: 60 }, (_, i) => makePair(seed, i, rosters[i % 36], 'holdout3'));
  return { seed, rosters: rosters.length, pairs };
}

// 홀드아웃 H4: 새 시드·새 명부 36개·쌍 60개 (eval/H4-spec.md)
export const H4_SEED = 20261115;
export function generateH4(seed = H4_SEED) {
  const rosters = Array.from({ length: 36 }, (_, k) => makeRoster(seed, k));
  const pairs = Array.from({ length: 60 }, (_, i) => makePair(seed, i, rosters[i % 36], 'holdout4'));
  return { seed, rosters: rosters.length, pairs };
}

export function stats(ds) {
  const s = {};
  for (const p of ds.pairs) {
    const t = (s[p.split] ||= { pairs: 0, persons: 0, labels: 0, byTruth: {}, byRule: {}, cosmetic: 0, shuffled: 0, layouts: {} });
    t.pairs++; t.persons += p.rowPidsA.length; t.labels += p.labels.length; t.cosmetic += p.cosmetic.length; t.shuffled += p.shuffled ? 1 : 0;
    t.layouts[p.layoutA] = (t.layouts[p.layoutA] || 0) + 1;
    for (const l of p.labels) { t.byTruth[l.truth] = (t.byTruth[l.truth] || 0) + 1; if (l.rule) t.byRule[l.rule] = (t.byRule[l.rule] || 0) + 1; }
  }
  return s;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const seed = Number(arg('--seed', DEFAULT_SEED));
  const out = arg('--out', join(dirname(fileURLToPath(import.meta.url)), 'data'));
  const ds = generate(seed);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'pairs.json'), JSON.stringify(ds));
  writeFileSync(join(out, 'stats.json'), JSON.stringify(stats(ds), null, 2));
  console.log(JSON.stringify(stats(ds), null, 2));
}
