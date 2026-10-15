// 층 사이 계단 화면: 옆에서 본 단면도. 3D 스캔이 있는 부분(아래 계단·층계참·위 계단)만 눌러서 신고할 수 있다.
import { h, toast } from '../lib/dom.js';
import { STAIR_PAIRS, stairName } from '../data/config.js';
import { getWaypoints, goTour } from '../lib/state.js';

const backBtn = () => h('a', { class: 'iconbtn', href: '#/building', 'aria-label': '뒤로' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' })));
const PARTS = [ // 2층 쪽에서 올라가는 순서 (올라가는 계단 → 층계참 → 내려가는 계단 = 위쪽 계단)
  { key: 'up', name: '올라가는 계단' },
  { key: 'landing', name: '층계참' },
  { key: 'down', name: '내려가는 계단' },
];
// 측면도 좌표 (viewBox 300x215): 아래 계단은 오른쪽 위로, 위 계단은 층계참에서 왼쪽 위로 꺾인다
const STEP_W = 25, STEP_H = 17.5, FLOOR_LO = 190, FLOOR_HI = 50, LAND_Y = 120, LAND_X0 = 130, LAND_X1 = 185;
const flightPath = (x0, dir, y0, yEnd, xEnd) => { // dir: +1 오른쪽 위, -1 왼쪽 위. 계단 윤곽 + 아래로 닫기
  let d = `M${x0} ${y0}`;
  for (let i = 0; i < 4; i++) d += ` V${y0 - STEP_H * (i + 1)} H${x0 + dir * STEP_W * (i + 1)}`;
  return `${d} V${yEnd} H${xEnd} Z`;
};
const SHAPES = {
  up: flightPath(30, 1, FLOOR_LO, FLOOR_LO, 30),
  down: flightPath(LAND_X1, -1, LAND_Y, LAND_Y, LAND_X1),
  landing: `M${LAND_X0} ${LAND_Y} H${LAND_X1} V${LAND_Y + 30} H${LAND_X0} Z`,
};
const LABELS = { up: [95, 180], landing: [157, 140], down: [124, 112] };
const floorLabel = id => (id === 'B1' ? 'B1' : id.replace('F', '')) + '층';

export async function stairs(pairId) {
  const pair = STAIR_PAIRS.find(p => p.join('-') === pairId);
  const root = h('div', {}, h('div', { class: 'topbar' }, backBtn(), h('h1', {}, pair ? stairName(pair) : '계단')));
  if (!pair) return root.append(h('div', { class: 'empty' }, '없는 계단입니다.')), root;

  const all = await getWaypoints();
  const mine = (all.building || []).filter(w => w.stair === pairId);
  const rep = name => { const l = mine.filter(w => w.part === name); return l[Math.floor(l.length / 2)] || null; }; // 구간 한가운데 지점
  const has = key => !!rep(key);
  const go = key => { const wp = rep(key); if (!wp) return toast('이 부분은 3D 스캔이 없어요'); goTour({ scene: wp.scene, floor: wp.floor, waypointId: wp.id, mode: 'pin' }); };

  const groups = PARTS.map(p => {
    const on = has(p.key);
    const [lx, ly] = LABELS[p.key];
    const g = h('g', { class: `part ${on ? 'on' : ''}`, 'data-key': p.key, role: on ? 'button' : null, tabindex: on ? 0 : null, 'aria-label': on ? `${p.name} 3D 보기` : null },
      h('path', { class: 'hit', d: SHAPES[p.key] }), // 넓은 투명 테두리로 눌리는 영역 확보
      h('path', { class: 'bg', d: SHAPES[p.key] }),
      h('text', { x: lx, y: ly }, p.name));
    if (on) {
      g.addEventListener('click', () => go(p.key));
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(p.key); } });
    }
    return g;
  });
  const section = h('svg', { class: 'section', viewBox: '0 0 300 215', role: 'group', 'aria-label': `${stairName(pair)} 측면도` }, ...groups,
    h('rect', { class: 'slab', x: 6, y: FLOOR_LO, width: 24, height: 8, rx: 2 }), h('rect', { class: 'slab', x: 6, y: FLOOR_HI, width: 79, height: 8, rx: 2 }),
    h('text', { class: 'fl', x: 6, y: FLOOR_LO + 22 }, floorLabel(pair[0])), h('text', { class: 'fl', x: 6, y: FLOOR_HI - 8 }, floorLabel(pair[1])));

  root.append(
    h('p', { class: 'hint' }, mine.length ? '신고할 계단 부분을 눌러 주세요.' : '이 계단은 아직 3D 스캔이 없어요.'),
    h('div', { class: 'stairbox' }, section));
  return root;
}
