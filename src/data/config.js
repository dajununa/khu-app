// 층/스캔 설정. 스캔이 있는 층만 scene 을 지정한다.
export const FLOORS = [
  { id: '5F', name: '5층' },
  { id: '4F', name: '4층' },
  { id: '3F', name: '3층' },
  { id: '2F', name: '2층' },
  { id: '1F', name: '1층' },
  { id: 'B1', name: '지하 1층' },
];
export const SCANNED = { '1F': 'building', '4F': 'building', '5F': 'classroom513' };

// 스캔 파일 (public/scans 아래)
export const SCENES = {
  building: { files: ['/scans/building/l2_a.sog', '/scans/building/l2_b.sog', '/scans/building/l2_c.sog'], label: '생활과학대학' },
  classroom513: { files: ['/scans/classroom/lod0_a.sog', '/scans/classroom/lod0_b.sog'], label: '513호' },
};

// 복도 스캔 없이 호실 스캔만 있는 층의 호실. 평면도에는 호실 사각형만 보여 주고, 누르면 해당 스캔(waypoint)으로 들어간다.
export const ROOMS = {
  '5F': [{ id: '513', name: '513호', scene: 'classroom513', waypoint: 'classroom513-5F-000' }],
};
// 스캔 지점에 붙이는 이름표 (층 안에서 첫/마지막 지점 등)
export const POINT_LABELS = {
  '1F': { first: '현관', last: '계단' },
  '4F': { first: '계단', last: '복도 끝' },
};
// 층별 피난안내도 평면도. enabled:false 로 바꾸면 그 층은 기존(복도 선) 방식으로 즉시 돌아간다.
// jsons 는 위에서부터 시도하고, 못 불러오면 다음 도면으로, 모두 실패하면 기존(복도 선) 방식으로 넘어간다.
export const EVAC_PLANS = {
  '1F': { enabled: true, jsons: ['/plans/f1-evac-portrait.v2.json', '/plans/f1-evac-portrait.json', '/plans/f1-evac.json'] }, // 세로 도면 v2(정렬 재계산) → 옛 세로 도면 → 가로 도면
  '4F': { enabled: true, jsons: ['/plans/f4-evac.json'] },
};
export const STATUSES = ['미확인', '확인', '진행 중', '완료'];

// 행정실 연락처. 비워 두면 강의실 화면에 '행정실 문의' 버튼이 나오지 않는다.
export const OFFICE = { name: '생활과학대학 행정실', phone: '' };
