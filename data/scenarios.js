// 데모 시나리오 5개. 모든 인물·선박·번호는 가상(흔한 성·이름 조합, 형식만 흉내 낸 번호, 검증 숫자가 틀린 IMO 번호).
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
  return { id: 1, title: '교대 승선·하선', ctx: { situation: '부산 입항 하루 전, 선사가 교대 승선·하선과 진급을 알리며 엑셀 수정본을 보냄', from: '선사 선원팀', at: '11/02(월) 16:05', v1: '10/30(금) 14:20 최초본', v2: '11/02(월) 16:05 수정본(엑셀 붙여넣기)', eta: '11/03(화) 09:00', due: '11/03(화) 07:00' }, desc: '2명 하선·2명 승선과 진급 통보. 수정본은 엑셀에서 붙여 넣은 표라 날짜 형식·직급 표기·행 순서가 다릅니다.', a: falCsv(a), b: excelTsv(ordered), mail };
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
  return { id: 2, title: '여권 갱신 + 오기', ctx: { situation: '부산 입항 전날 밤, 선사가 생년월일 정정 1건을 요청하며 수정본을 보냄. 그런데 수정본에는 요청하지 않은 변경도 섞여 있음', from: '선사 선원팀', at: '11/02(월) 21:40', v1: '10/30(금) 14:20 최초본', v2: '11/02(월) 21:40 수정본 V2', eta: '11/03(화) 09:00', due: '11/03(화) 07:00' }, desc: '기관장 여권 갱신(메일 언급 없음), 생년월일 정정 요청 1건, 그리고 문자 혼동·일월 뒤바뀜·국적 코드·만료 여권이 섞인 수정본.', a: falCsv(a), b: falCsv(b), mail };
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
  return { id: 3, title: '정정 요청 미반영', ctx: { situation: '선원관리팀이 한국어 메일로 정정·하선·직급 변경을 요청하며 수정본을 보냄. 요청이 수정본에 다 반영됐는지 확인해야 함', from: '선원관리팀', at: '11/02(월) 18:30', v1: '10/30(금) 14:20 최초본', v2: '11/02(월) 18:30 수정본', eta: '11/03(화) 09:00', due: '11/03(화) 07:00' }, desc: '한국어 메일로 받은 정정·하선·직급 변경 요청 중 일부가 수정본에 반영되지 않았고, 중복 행과 판독 불가 칸이 있습니다.', a: falCsv(a), b: falCsv(b), mail };
}

// 처음 보는 서식: 일부 독일어 머리글, 알 수 없는 비고 열, 두 자리 연도 만료일
function scenario4() {
  const a = base();
  const b = base().map((r) => ({ ...r }));
  find(b, 'SANTOS').nationality = 'IDN'; // 지시 없음 → 확인 필요(추정 매핑 열)
  find(b, 'AUNG').idExpiry = '2032-08-31'; // 지시 없음 → 확인 필요
  const yy = (iso) => { const [y, m, d] = iso.split('-'); return `${d} ${MON[+m - 1]} ${y.slice(2)}`; };
  const csv = [
    `Schiffsname: ${HEAD.ship}`, `ETA: ${HEAD.date}`, '',
    'No.,Family name,Given names,Rank,Staatsangehörigkeit,Date of birth,Bemerkung,Gender,Doc type,Passport No.,Issued by,Gültig bis',
    ...b.map((r, i) => [i + 1, q(r.familyName), q(r.givenNames), ABBR[r.rank] || r.rank, r.nationality, r.dob, `ok ${i % 3}`, r.gender, r.idType, r.idNumber, r.idIssuer, yy(r.idExpiry)].join(',')),
  ].join('\n') + '\n';
  const mail = ['Dear Agent,', '', 'Please find attached the revised crew list (new template from owner).', '', 'Best regards,', 'Crewing Dept. (demo)'].join('\n') + '\n';
  return { id: 4, title: '처음 보는 서식', ctx: { situation: '선주가 명부 양식을 바꿔 보냄(독일어 머리글·두 자리 연도). 도구가 처음 보는 서식', from: '선사 선원팀', at: '11/02(월) 17:10', v1: '10/30(금) 14:20 최초본', v2: '11/02(월) 17:10 새 양식 수정본', eta: '11/03(화) 09:00', due: '11/03(화) 07:00' }, desc: '선주가 바꾼 양식: 일부 독일어 머리글, 알 수 없는 비고 열, 두 자리 연도 만료일. 추정 매핑과 열 단위 서식 경보를 보여 줍니다.', a: falCsv(a), b: csv, mail };
}

// 예시 5: 예시 2를 이어서. 담당자가 생년월일 정정만 채택하고 나머지 6건을 '선사 문의'로 둔 뒤,
// 선장 회신과 다시 고친 수정본(V3)을 받아 기준본(확정한 결정만 반영)과 다시 대조한다.
function scenario5() {
  const a = base();
  find(a, 'DELA CRUZ').dob = '1992-06-03'; // 예시 2에서 채택한 정정만 반영한 기준본
  const b = base().map((r) => ({ ...r }));
  find(b, 'DELA CRUZ').dob = '1992-06-03';
  find(b, 'CHOI').idNumber = 'MJ9930462'; // 여권 갱신 — 회신으로 확인
  find(b, 'CHOI').idExpiry = '2036-10-01';
  find(b, 'MENDOZA').idNumber = 'PF7731042'; // 만료 여권 → 새 여권으로 교체
  find(b, 'MENDOZA').idExpiry = '2032-11-20';
  // KOVALENKO·SANTOS·AUNG: V2의 오기를 되돌림(기준본과 같음 → 변경 없음)
  const mail = [
    'From: Master, DEMO HANBIT 3 (demo) <master@example.invalid>',
    'Subject: RE: DEMO HANBIT 3 V.2611E revised crew list',
    '',
    'Dear Agent,',
    '',
    'Thank you for checking. Corrected list (V3) attached. The O/0, date and nationality code errors in V2 were typing mistakes and are reverted.',
    'Chief Engineer CHOI DONGHYUN has a renewed passport.',
    'Please correct passport number of CHOI DONGHYUN to MJ9930462.',
    'Please correct passport expiry date of CHOI DONGHYUN to 2036-10-01.',
    'Chief Cook MENDOZA ARNEL has a new passport (the old one is no longer valid).',
    'Please correct passport number of MENDOZA ARNEL to PF7731042.',
    'Please correct passport expiry date of MENDOZA ARNEL to 2032-11-20.',
    '',
    'Best regards,',
    'Master (demo)',
  ].join('\n') + '\n';
  return { id: 5, title: '선장 회신 후 재대조', ctx: { situation: '선사 문의 6건을 선장에게 물었고, 선장이 회신과 함께 다시 고친 V3를 보냄. 확정한 정정만 반영한 기준본과 V3를 대조', from: '선장(DEMO HANBIT 3)', at: '11/03(화) 01:15', v1: '11/02(월) 22:10 기준본(확정한 결정만 반영)', v2: '11/03(화) 01:15 수정본 V3', eta: '11/03(화) 09:00', due: '11/03(화) 07:00', continues: 2 }, desc: '예시 2를 이어서: 확정한 정정만 반영한 기준본과, 선장 회신·다시 고친 수정본(V3)을 대조해 선사 문의를 모두 풀고 최종 명부를 만듭니다.', a: falCsv(a), b: falCsv(b), mail };
}

// 예시 6: 실무형 메일 — 한국어 이름·목록형 정정, 이전 메일 요청의 취소, 회신 아래 인용된 이전 메일.
// 규칙 방식은 한국어 이름(최동현)을 명부와 잇지 못하고, AI(미리 실행한 결과)는 정정 1건을 찾고 취소된 요청은 반영하지 않는다.
function scenario6() {
  const a = base();
  const b = base().map((r) => ({ ...r }));
  find(b, 'CHOI').idNumber = 'MJ5508291'; // 요청한 정정
  find(b, 'SANTOS').dob = '1994-03-11'; // 이전 메일에서 요청했다가 취소된 값이 그대로 들어옴
  const mail = [
    '보낸 사람: 선원관리팀 (데모)',
    '제목: RE: [DEMO HANBIT 3] 선원명부 정정 요청',
    '',
    '안녕하세요, 대리점 담당자님.',
    '',
    '최동현 기관장 여권번호가 잘못 기재되어 있어 정정 부탁드립니다.',
    '- 현재: MJ5508219',
    '- 정정: MJ5508291',
    '',
    '그리고 지난 메일에서 요청드린 SANTOS 3항사 생년월일 수정은 취소합니다. 원래 명부 값이 맞습니다.',
    '',
    '감사합니다.',
    '선원관리팀 (데모)',
    '',
    '-----Original Message-----',
    'Please correct date of birth of SANTOS MARK to 1994-03-11.',
  ].join('\n') + '\n';
  return { id: 6, title: '실무형 메일(AI 해석)', ctx: { situation: '선원관리팀이 한국어로 목록형 정정을 요청하면서, 지난 메일의 요청 하나를 취소함. 그런데 수정본에는 취소된 값이 들어와 있음', from: '선원관리팀', at: '11/02(월) 19:20', v1: '10/30(금) 14:20 최초본', v2: '11/02(월) 19:20 수정본', eta: '11/03(화) 09:00', due: '11/03(화) 07:00' }, desc: '한국어 이름·목록형 정정과 이전 요청 취소가 섞인 메일. 규칙 방식과 AI(미리 실행한 결과)의 메일 해석 차이를 보여 줍니다.', a: falCsv(a), b: falCsv(b), mail };
}

export const SCENARIOS = [scenario1(), scenario2(), scenario3(), scenario4(), scenario5(), scenario6()];
