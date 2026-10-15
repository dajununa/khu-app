// 층 사이 계단 평면도: 올라가는 계단 / 층계참 / 내려가는 계단을 눌러 3D 스캔으로 이동.
import { h, toast } from '../lib/dom.js';
import { FLOORS, STAIR_PAIRS, stairName } from '../data/config.js';
import { getWaypoints, goTour } from '../lib/state.js';

const backBtn = () => h('a', { class: 'iconbtn', href: '#/', 'aria-label': '뒤로' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' })));
const floorName = id => FLOORS.find(f => f.id === id)?.name || id;

export async function stairs(pairId) {
  const pair = STAIR_PAIRS.find(p => p.join('-') === pairId);
  const root = h('div', {}, h('div', { class: 'topbar' }, backBtn(), h('h1', {}, pair ? stairName(pair) : '계단')));
  if (!pair) return root.append(h('div', { class: 'empty' }, '없는 계단입니다.')), root;
  const [lo, hi] = pair;

  const all = await getWaypoints();
  const mine = (all.building || []).filter(w => w.stair === pairId);
  const part = name => { const l = mine.filter(w => w.part === name); return l[Math.floor(l.length / 2)] || null; }; // 구간 한가운데 지점
  const targets = { up: part('up'), landing: part('landing'), down: part('down') };
  const scanned = mine.length > 0;
  const go = key => { const wp = targets[key]; if (!wp) return toast('이 구간은 3D 스캔이 없어요'); goTour({ scene: wp.scene, floor: wp.floor, waypointId: wp.id, mode: 'pin' }); };

  // U자형 계단을 위에서 본 그림. 왼쪽 = 올라가는 계단, 오른쪽 = 내려가는 계단, 위쪽 = 층계참
  const treads = (x, y0, y1) => Array.from({ length: Math.round((y1 - y0) / 11) - 1 }, (_, i) => h('line', { class: 'tread', x1: x + 3, x2: x + 85, y1: y0 + 11 * (i + 1), y2: y0 + 11 * (i + 1) }));
  const zone = (key, el) => { const on = !!targets[key]; el.setAttribute('class', `zone ${on ? '' : 'off'}`); el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
    el.addEventListener('click', () => go(key)); el.addEventListener('keydown', e => e.key === 'Enter' && go(key)); return el; };
  const svg = h('svg', { class: 'stairplan', viewBox: '0 0 240 320', role: 'group', 'aria-label': `${stairName(pair)} 평면도` },
    h('rect', { class: 'shaft', x: 14, y: 14, width: 212, height: 292, rx: 4 }),
    h('rect', { class: 'landing', x: 20, y: 20, width: 200, height: 62 }),
    h('rect', { class: 'flight', x: 26, y: 82, width: 88, height: 218 }), ...treads(26, 82, 300),
    h('rect', { class: 'flight', x: 126, y: 82, width: 88, height: 218 }), ...treads(126, 82, 300),
    h('rect', { class: 'well', x: 114, y: 82, width: 12, height: 218 }),
    // 눌러지는 구역 (스캔이 있으면 연한 색)
    zone('landing', h('rect', { x: 20, y: 20, width: 200, height: 62 })),
    zone('up', h('rect', { x: 26, y: 82, width: 88, height: 218 })),
    zone('down', h('rect', { x: 126, y: 82, width: 88, height: 218 })),
    // 방향 화살표
    h('path', { class: 'arr', d: 'M70 266 V130 M52 148 L70 130 L88 148' }),            // 올라가는 ↑
    h('path', { class: 'arr', d: 'M170 130 V266 M152 248 L170 266 L188 248' }),         // 내려가는 ↓
    h('text', { x: 120, y: 48 }, '층계참'), 
    h('text', { x: 70, y: 196 }, '올라가는 계단'), h('text', { class: 's', x: 70, y: 214 }, `${floorName(lo)}에서 시작`),
    h('text', { x: 170, y: 196 }, '내려가는 계단'), h('text', { class: 's', x: 170, y: 214 }, `${floorName(hi)}에서 시작`),
  );

  root.append(h('p', { class: 'hint' }, scanned ? '신고할 계단 부분을 누르면 3D 스캔으로 이동해요.' : '이 계단은 아직 3D 스캔이 없어요.'),
    h('div', { class: 'plan-wrap', style: 'position:relative' }, svg,
      scanned ? h('div', { class: 'plan-legend', style: 'position:static;margin:6px auto 2px;width:max-content' }, h('i'), '색칠된 곳은 3D 스캔 구역') : null));
  return root;
}
