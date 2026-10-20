// 테스트용 작은 명부 만들기
export const HEAD = 'Name of ship,DEMO TEST 1\nDate of arrival,2026-11-03\n';
export const COLS = 'No.,Family name,Given names,Rank,Nationality,Date of birth,Place of birth,Gender,Doc type,Passport No.,Issued by,Expiry';
export const P = {
  kim: ['KIM', 'MINJUN', 'Master', 'KOR', '1975-03-12', 'BUSAN', 'M', 'Passport', 'MX1234567', 'KOR', '2030-01-01'],
  cruz: ['DELA CRUZ', 'JUAN', 'AB', 'PHL', '1990-04-05', 'MANILA', 'M', 'Passport', 'PA7654321', 'PHL', '2029-05-05'],
  nguyen: ['NGUYEN', 'VAN AN', 'OS', 'VNM', '1995-07-20', 'HAI PHONG', 'M', 'Passport', 'VN1928374', 'VNM', '2027-02-02'],
  santos: ['SANTOS', 'MARK', 'Cook', 'PHL', '1988-11-30', 'CEBU', 'M', 'Passport', 'PC5550123', 'PHL', '2028-08-08'],
};
export const row = (p, over = {}) => {
  const keys = ['familyName', 'givenNames', 'rank', 'nationality', 'dob', 'pob', 'gender', 'idType', 'idNumber', 'idIssuer', 'idExpiry'];
  return keys.map((k, i) => (k in over ? over[k] : p[i]));
};
export const csv = (rows) => HEAD + COLS + '\n' + rows.map((r, i) => [i + 1, ...r].join(',')).join('\n') + '\n';
export const base = () => [row(P.kim), row(P.cruz), row(P.nguyen), row(P.santos)];
