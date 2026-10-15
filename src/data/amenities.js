// 편의시설 종류. short 는 입면도·평면도 아이콘에 들어가는 짧은 글자, details 는 관리자가 입력할 때 미리 채워 주는 항목.
// 순서대로 화면에 나온다. 새 종류가 필요하면 여기에 줄을 추가하면 된다.
export const AMENITY_TYPES = [
  { id: '화장실', short: 'WC', color: '#2b2f3a', details: ['성별', '칸 수', '비데', '파우더룸', '장애인용', '생리대 자판기'] },
  { id: '정수기', short: '물', color: '#1f5fa8', details: ['냉수/온수', '컵 비치'] },
  { id: '쓰레기통', short: '휴지', color: '#4b6b2f', details: ['분리수거', '음식물'] },
  { id: '취식 공간', short: '식', color: '#b45309', details: ['좌석', '테이블', '전자레인지', '붐비는 시간', '콘센트'] },
  { id: '전자레인지', short: '전', color: '#9a3412', details: ['대수'] },
  { id: '프린터·복사기', short: '프', color: '#6b3fa0', details: ['결제 방법', '스캔'] },
  { id: '자판기', short: '자', color: '#0f766e', details: ['종류', '결제 방법'] },
  { id: '휴게 공간', short: '휴', color: '#8a1f3d', details: ['좌석', '콘센트', '이용 시간'] },
  { id: '엘리베이터', short: 'EV', color: '#475569', details: [] },
  { id: '제세동기(AED)', short: '+', color: '#be123c', details: [] },
  { id: '기타', short: '·', color: '#6b6f7b', details: [] },
];
export const amenityType = id => AMENITY_TYPES.find(t => t.id === id) || AMENITY_TYPES.at(-1);
