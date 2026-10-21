// 업무 화면 표시용 데이터(가상). 판정에는 쓰지 않는다.
// 사례 명부는 모두 같은 배(DEMO HANBIT 3)로 만들어져 있어, 목록에서 서로 다른 배로 보이도록 화면용 이름만 따로 붙인다.
// 건수·분류는 화면에서 각 사례를 엔진으로 실제로 돌린 값을 쓴다.
export const SYSTEM = {
  name: 'CrewDiff',
  sub: '선원명부 변경대조',
  user: '데모 담당자',
  org: '○○해운대리점 부산지점',
};

// stage: new(받음) · v2(대조 필요) · asked(선사 문의 중) · reply(회신 도착, 다시 대조) · final(확정)
export const SHIPS = [
  { key: 'hanbit', hero: true, scenario: 2, reply: 5, name: 'DEMO HANBIT 3', voy: '2611E', port: '부산 신항', eta: '11/03(화) 09:00', due: '11/03(화) 07:00', operator: '가상 선사 A', flag: 'PAN', stage: 'new' },
  { key: 'sora', scenario: 1, name: 'DEMO SORA', voy: '0418W', port: '부산 북항', eta: '11/03(화) 15:00', due: '11/03(화) 13:00', operator: '가상 선사 B', flag: 'LBR', stage: 'new' },
  { key: 'gaon', scenario: 3, name: 'DEMO GAON 7', voy: '2603N', port: '울산', eta: '11/04(수) 06:00', due: '11/04(수) 04:00', operator: '가상 선사 C', flag: 'KOR', stage: 'v2' },
  { key: 'nuri', scenario: 4, name: 'DEMO NURI', voy: '1125S', port: '부산 신항', eta: '11/04(수) 13:00', due: '11/04(수) 11:00', operator: '가상 선사 D', flag: 'MHL', stage: 'v2' },
  { key: 'haeun', scenario: 6, name: 'DEMO HAEUN 2', voy: '0907E', port: '광양', eta: '11/05(목) 08:00', due: '11/05(목) 06:00', operator: '가상 선사 E', flag: 'PAN', stage: 'new' },
];

export const STAGE = {
  new: { label: '받음', tone: 'new', sub: '새 수정본 도착' },
  v2: { label: '대조 필요', tone: 'todo', sub: '수정본 대조 전' },
  asked: { label: '선사 문의 중', tone: 'wait', sub: '회신 대기' },
  reply: { label: '대조 필요', tone: 'todo', sub: '회신 도착 · 다시 대조' },
  final: { label: '확정', tone: 'ok', sub: '신고 자료 준비 가능' },
};

// 대표 흐름(사례 2 → 5)의 단계별 시스템 시각(가상). 시연이 아닐 때 상단 시계에 쓴다.
export const HERO_CLOCK = { new: [11, 2, 21, 41], v2: [11, 2, 21, 42], asked: [11, 2, 22, 10], reply: [11, 3, 1, 15], final: [11, 3, 1, 17] };
