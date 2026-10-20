// 데모 시나리오 3개. 모든 인물·선박·번호는 가상(흔한 성·이름 조합, 형식만 흉내 낸 번호, 검증 숫자가 틀린 IMO 번호).
const HEAD = { ship: 'DEMO HANBIT 3', imo: '9412573', call: 'DHK57', voy: '2611E', port: 'BUSAN', date: '2026-11-03', flag: 'PAN', last: 'SHANGHAI' };

// 최초본 기준 인원 16명
const BASE = [
  ['PARK', 'SANGHOON', 'Master', 'KOR', '1971-05-14', 'BUSAN', 'M', 'Passport', 'MK4820157', 'KOR', '2031-03-02'],
  ['LEE', 'JAEWON', 'Chief Officer', 'KOR', '1983-09-21', 'MOKPO', 'M', 'Passport', 'MR7031846', 'KOR', '2029-11-18'],
  ['KOVALENKO', 'ANDRII', 'Second Officer', 'UKR', '1990-02-08', 'ODESA', 'M', 'Passport', 'FT2950813', 'UKR', '2028-06-30'],
  ['SANTOS', 'MARK', 'Third Officer', 'PHL', '1994-11-03', 'ILOILO', 'M', 'Passport', 'PE8105274', 'PHL', '2030-01-25'],
  ['CHOI', 'DONGHYUN', 'Chief Engineer', 'KOR', '1969-12-30', 'YEOSU', 'M', 'Passport', 'MJ5508219', 'KOR', '2027-01-20'],
  ['MELNYK', 'SERHII', 'Second Engineer', 'UKR', '1985-07-19', 'MYKOLAIV', 'M', 'Passport', 'FK6620485', 'UKR', '2027-09-14'],
  ['NGUYEN', 'VAN HUNG', 'Third Engineer', 'VNM', '1991-04-11', 'HAI PHONG', 'M', 'Passport', 'CN1182905', 'VNM', '2029-04-01'],
  ['REYES', 'JOMAR', 'Bosun', 'PHL', '1980-08-25', 'CEBU', 'M', 'Passport', 'PA3159028', 'PHL', '2028-12-12'],
  ['DELA CRUZ', 'JUAN', 'Able Seaman', 'PHL', '1992-03-06', 'MANILA', 'M', 'Passport', 'PC7024581', 'PHL', '2030-05-20'],
  ['AUNG', 'KO KO', 'Able Seaman', 'MMR', '1996-10-17', 'YANGON', 'M', "Seaman's book", 'MDN215083', 'MMR', '2027-08-31'],
  ['TRAN', 'MINH TUAN', 'Ordinary Seaman', 'VNM', '1999-06-02', 'NAM DINH', 'M', 'Passport', 'CK2560918', 'VNM', '2031-02-28'],
  ['KYAW', 'ZAW LIN', 'Oiler', 'MMR', '1988-01-29', 'MANDALAY', 'M', 'Passport', 'MF8051236', 'MMR', '2028-03-15'],
  ['GARCIA', 'RONALDO', 'Oiler', 'PHL', '1986-05-09', 'BATANGAS', 'M', 'Passport', 'PD5021784', 'PHL', '2029-10-10'],
  ['SAPUTRA', 'AGUS', 'Wiper', 'IDN', '1997-12-01', 'SURABAYA', 'M', 'Passport', 'XC8205513', 'IDN', '2030-08-08'],
  ['MENDOZA', 'ARNEL', 'Chief Cook', 'PHL', '1978-02-14', 'DAVAO', 'M', 'Passport', 'PF1085627', 'PHL', '2027-12-05'],
  ['FLORES', 'ANGELICA', 'Messman', 'PHL', '2000-07-23', 'CEBU', 'F', 'Passport', 'PG2507813', 'PHL', '2031-06-16'],
];
const COLS = ['familyName', 'givenNames', 'rank', 'nationality', 'dob', 'pob', 'gender', 'idType', 'idNumber', 'idIssuer', 'idExpiry'];
const base = () => BASE.map((r) => Object.fromEntries(COLS.map((c, i) => [c, r[i]])));
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const dmon = (iso) => { const [y, m, d] = iso.split('-'); return `${d}-${MON[+m - 1]}-${y}`; };
const ABBR = { Master: 'MASTER', 'Chief Officer': 'C/O', 'Second Officer': '2/O', 'Third Officer': '3/O', 'Chief Engineer': 'C/E', 'Second Engineer': '2/E', 'Third Engineer': '3/E', Bosun: 'BOSUN', 'Able Seaman': 'AB', 'Ordinary Seaman': 'OS', Oiler: 'OILER', Wiper: 'WIPER', 'Chief Cook': 'CH.COOK', Messman: 'MESSMAN' };
const find = (rows, fam) => rows.find((r) => r.familyName === fam);
const q = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// 최초본: FAL 5 서식 그대로의 CSV
function falCsv(rows, h = HEAD) {
  return [
    'CREW LIST (IMO FAL Form 5),Arrival',
    `1.1 Name of ship,${h.ship}`, `1.2 IMO number,${h.imo}`, `1.3 Call sign,${h.call}`, `1.4 Voyage number,${h.voy}`,
    `2. Port of arrival/departure,${h.port}`, `3. Date of arrival/departure,${h.date}`, `4. Flag State of ship,${h.flag}`, `5. Last port of call,${h.last}`,
    '',
    '6. No.,7. Family name,8. Given names,9. Rank or rating,10. Nationality,11. Date of birth,12. Place of birth,13. Gender,14. Nature of identity document,15. Number of identity document,16. Issuing State of identity document,17. Expiry date of identity document',
    ...rows.map((r, i) => [i + 1, ...COLS.map((c) => q(r[c]))].join(',')),
    '',
    '18. Date and signature by master, authorized agent or officer',
  ].join('\n') + '\n';
}
// 수정본: 선사가 엑셀에서 복사해 붙여 넣은 표(탭 구분, 직급 약어, DD-MMM-YYYY 날짜)
function excelTsv(rows, h = HEAD, { dates = 'dmon' } = {}) {
  const d = (x) => (dates === 'dmon' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? dmon(x) : x);
  return [
    `Vessel:\t${h.ship}`, `Voy No.:\t${h.voy}`, `Port:\t${h.port}`, `ETA:\t${dmon(h.date)}`,
    '',
    ['No.', 'Rank', 'Surname', 'Given names', 'Nationality', 'D.O.B', 'Place of birth', 'Sex', 'Doc type', 'Passport No.', 'Issued by', 'Expiry'].join('\t'),
    ...rows.map((r, i) => [i + 1, r.rankOverride ?? (ABBR[r.rank] || r.rank), r.familyName, r.givenNames, r.nationality, d(r.dob), r.pob, r.gender, r.idType, r.idNumber, r.idIssuer, d(r.idExpiry)].join('\t')),
  ].join('\n') + '\n';
}

function scenario1() {
  const a = base();
  const b = base().map((r) => ({ ...r }));
  // 교대: OS TRAN, OILER GARCIA 하선 → 같은 자리에 신규 2명 승선
  const on1 = { familyName: 'HOANG', givenNames: 'QUANG HUY', rank: 'Ordinary Seaman', nationality: 'VNM', dob: '2001-09-15', pob: 'THANH HOA', gender: 'M', idType: 'Passport', idNumber: 'CV7302158', idIssuer: 'VNM', idExpiry: '2032-04-11' };
  const on2 = { familyName: 'RAMOS', givenNames: 'RODEL', rank: 'Oiler', nationality: 'PHL', dob: '1989-11-27', pob: 'ILOILO', gender: 'M', idType: 'Passport', idNumber: 'PH5520819', idIssuer: 'PHL', idExpiry: '2030-02-19' };
  b.splice(b.indexOf(find(b, 'TRAN')), 1, on1);
  b.splice(b.indexOf(find(b, 'GARCIA')), 1, on2);
  find(b, 'SAPUTRA').rank = 'Oiler'; // 메일: 진급
  find(b, 'REYES').pob = 'LAPU-LAPU'; // 지시 없음 → 확인 필요
  find(b, 'FLORES').givenNames = 'Angelica'; // 대소문자만
  find(b, 'KOVALENKO').familyName = 'Kovalenko';
  // 행 순서: 기관부를 위로 옮겨 붙여 넣음
  const eng = b.filter((r) => /Engineer/.test(r.rank));
  const rest = b.filter((r) => !/Engineer/.test(r.rank));
  const ordered = [rest[0], ...eng, ...rest.slice(1)];
  const mail = [
    'From: Crewing Dept. (demo) <crewing@example.invalid>',
    'Subject: DEMO HANBIT 3 V.2611E Busan crew change',
    '',
    'Dear Agent,',
    '',
    'Please find attached the revised crew list for DEMO HANBIT 3 V.2611E.',
    'OS TRAN MINH TUAN will sign off at BUSAN on 2026-11-04.',
    'OILER GARCIA RONALDO will sign off at BUSAN on 2026-11-04.',
    'OS HOANG QUANG HUY (passport CV7302158) will join the vessel at BUSAN.',
    'OILER RAMOS RODEL (passport PH5520819) will join the vessel at BUSAN.',
    'SAPUTRA AGUS promoted from WIPER to OILER with effect from arrival.',
    'Joining crew will arrive by air on 2026-11-02.',
    '',
    'Best regards,',
    'Crewing Dept. (demo)',
  ].join('\n') + '\n';
  return { id: 1, title: '교대 승선·하선', desc: '2명 하선·2명 승선과 진급 통보. 수정본은 엑셀에서 붙여 넣은 표라 날짜 형식·직급 표기·행 순서가 다릅니다.', a: falCsv(a), b: excelTsv(ordered), mail };
}

function scenario2() {
  const a = base();
  a.find((r) => r.familyName === 'DELA CRUZ').dob = '1992-03-06';
  const b = base().map((r) => ({ ...r }));
  find(b, 'DELA CRUZ').dob = '1992-06-03'; // 메일 정정(일·월 교환 모양이지만 지시 있음)
  find(b, 'CHOI').idNumber = 'MJ9930462'; // 여권 갱신(지시 없음)
  find(b, 'CHOI').idExpiry = '2036-10-01';
  find(b, 'KOVALENKO').idNumber = 'FT295O813'; // 0 → O 오기
  find(b, 'SANTOS').dob = '1994-03-11'; // 일·월 뒤바뀜
  find(b, 'AUNG').nationality = 'MYA'; // ISO 코드 아님
  find(b, 'MENDOZA').idExpiry = '2025-12-05'; // 만료
  const mail = [
    'From: Crewing Dept. (demo) <crewing@example.invalid>',
    'Subject: DEMO HANBIT 3 V.2611E revised crew list',
    '',
    'Dear Agent,',
    '',
    'Please find attached the revised crew list for DEMO HANBIT 3 V.2611E.',
    'Please correct date of birth of DELA CRUZ JUAN to 1992-06-03.',
    'No crew change at this port.',
    '',
    'Best regards,',
    'Crewing Dept. (demo)',
  ].join('\n') + '\n';
  return { id: 2, title: '여권 갱신 + 오기', desc: '기관장 여권 갱신(메일 언급 없음), 생년월일 정정 요청 1건, 그리고 문자 혼동·일월 뒤바뀜·국적 코드·만료 여권이 섞인 수정본.', a: falCsv(a), b: falCsv(b), mail };
}

function scenario3() {
  const a = base();
  a.find((r) => r.familyName === 'NGUYEN').givenNames = 'VAN HUN';
  const b = base().map((r) => ({ ...r }));
  find(b, 'NGUYEN').givenNames = 'VAN HUNG'; // 정정 반영
  find(b, 'TRAN').rank = 'Bosun'; // 지시는 AB, 수정본은 BOSUN
  find(b, 'LEE').pob = 'BUSAN'; // 지시 없음
  find(b, 'SAPUTRA').dob = '???'; // 판독 불가
  const dup = { ...find(b, 'KYAW') };
  b.push(dup); // 중복 행
  const mail = [
    '보낸 사람: 선원관리팀 (데모)',
    '제목: DEMO HANBIT 3 2611E 항차 선원명부 정정 요청',
    '',
    '대리점 담당자님 안녕하세요.',
    'DEMO HANBIT 3 2611E 항차 수정 선원명부 송부드립니다.',
    'NGUYEN VAN HUN 이름 "VAN HUNG"으로 정정 바랍니다.',
    'REYES JOMAR 여권번호 PA3159082로 정정 바랍니다.',
    'AB DELA CRUZ JUAN BUSAN에서 하선 예정입니다.',
    'TRAN MINH TUAN 직급 변경: OS → AB',
    '',
    '감사합니다.',
    '선원관리팀 (데모)',
  ].join('\n') + '\n';
  return { id: 3, title: '정정 요청 미반영', desc: '한국어 메일로 받은 정정·하선·직급 변경 요청 중 일부가 수정본에 반영되지 않았고, 중복 행과 판독 불가 칸이 있습니다.', a: falCsv(a), b: falCsv(b), mail };
}

export const SCENARIOS = [scenario1(), scenario2(), scenario3()];
