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
export const STATUSES = ['미확인', '확인', '진행 중', '완료'];

// 신고 항목 (한 단어로 고르게 한다). [이름, 아이콘]
// 저장 값은 '하자' 그대로 두고 화면에 보이는 이름만 바꾼다 (덜 부정적인 표현)
export const kindName = k => (k === '하자' ? '안전' : k);
export const CATEGORIES = {
  '하자': [['누수', '💧'], ['조명', '💡'], ['파손', '🔨'], ['균열', '🧱'], ['곰팡이', '🦠'], ['냉난방', '🌡️'], ['문·창문', '🚪'], ['콘센트', '🔌'], ['악취', '👃'], ['소음', '🔊'], ['청결', '🧹'], ['기타', '➕']],
  '분실물': [['지갑', '👛'], ['휴대폰', '📱'], ['전자기기', '💻'], ['학생증·카드', '💳'], ['가방', '🎒'], ['의류', '🧥'], ['우산', '☂️'], ['책/필기도구', '📓'], ['기타', '➕']],
};

// 층 사이 계단 [아랫층, 윗층]. 위에서부터. 3D 스캔이 있는 계단은 STAIR_SCANNED (waypoints 의 stair 값과 같은 문자열).
export const STAIR_PAIRS = [['4F', '5F'], ['3F', '4F'], ['2F', '3F'], ['1F', '2F'], ['B1', '1F']];
export const STAIR_SCANNED = ['1F-2F', '2F-3F', '3F-4F'];
const num = id => (id === 'B1' ? 'B1' : id.replace('F', ''));
export const stairName = ([lo, hi]) => `${num(lo)}–${num(hi)}층 계단`;
