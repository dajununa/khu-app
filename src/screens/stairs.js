// 층 사이 계단 화면 (단순한 선 그림). 중앙 계단은 한 줄 계단 + 가운데 층계참, 양쪽 끝에 다른 계단이 있다.
// 3D 스캔이 있는 중앙 계단의 각 부분만 누를 수 있다.
import { h, toast } from '../lib/dom.js';
import { STAIR_PAIRS, stairName } from '../data/config.js';
import { getWaypoints, goTour } from '../lib/state.js';

const backBtn = () => h('a', { class: 'iconbtn', href: '#/', 'aria-label': '뒤로' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' })));
const PARTS = [ // 위에서부터
  { key: 'down', name: '내려가는 계단', icon: '↓', y: 12, h: 76 },
  { key: 'landing', name: '층계참', icon: '▭', y: 88, h: 64 },
  { key: 'up', name: '올라가는 계단', icon: '↑', y: 152, h: 76 },
];

export async function stairs(pairId) {
  const pair = STAIR_PAIRS.find(p => p.join('-') === pairId);
  const root = h('div', {}, h('div', { class: 'topbar' }, backBtn(), h('h1', {}, pair ? stairName(pair) : '계단')));
  if (!pair) return root.append(h('div', { class: 'empty' }, '없는 계단입니다.')), root;

  const all = await getWaypoints();
  const mine = (all.building || []).filter(w => w.stair === pairId);
  const rep = name => { const l = mine.filter(w => w.part === name); return l[Math.floor(l.length / 2)] || null; }; // 구간 한가운데 지점
  const has = key => !!rep(key);
  const go = key => { const wp = rep(key); if (!wp) return toast('이 부분은 3D 스캔이 없어요'); goTour({ scene: wp.scene, floor: wp.floor, waypointId: wp.id, mode: 'pin' }); };

  // 건물을 위에서 본 개략도: 양쪽 끝 계단(스캔 없음)과 중앙 계단
  const glyph = (x, on) => h('g', { class: on ? 'gl on' : 'gl' },
    h('rect', { x: x - 11, y: 14, width: 22, height: 26, rx: 3 }),
    ...[0, 1, 2, 3].map(i => h('line', { x1: x - 8, x2: x + 8, y1: 20 + i * 5, y2: 20 + i * 5 })));
  const map = h('svg', { class: 'bmap', viewBox: '0 0 300 66', role: 'img', 'aria-label': '건물 위에서 본 계단 위치: 양쪽 끝과 중앙' },
    h('rect', { class: 'bar', x: 6, y: 18, width: 288, height: 18, rx: 9 }),
    glyph(30, false), glyph(150, true), glyph(270, false),
    h('text', { x: 30, y: 58 }, '끝 계단'), h('text', { class: 'on', x: 150, y: 58 }, '중앙 계단'), h('text', { x: 270, y: 58 }, '끝 계단'));

  // 중앙 계단 그림 (한 줄)
  const treads = (y0, y1) => { const out = []; for (let y = y0 + 8; y < y1; y += 8) out.push(h('line', { class: 'tr', x1: 30, x2: 110, y1: y, y2: y })); return out; };
  const groups = PARTS.map(p => {
    const on = has(p.key);
    const g = h('g', { class: `part ${on ? 'on' : ''}`, 'data-key': p.key, role: on ? 'button' : null, tabindex: on ? 0 : null, 'aria-label': on ? `${p.name} 3D 보기` : null },
      h('rect', { class: 'bg', x: 30, y: p.y, width: 80, height: p.h }),
      ...(p.key === 'landing' ? [] : treads(p.y, p.y + p.h)));
    if (on) { g.addEventListener('click', () => go(p.key)); g.addEventListener('keydown', e => e.key === 'Enter' && go(p.key)); }
    return g;
  });
  const flight = h('svg', { class: 'flight1', viewBox: '0 0 140 240', role: 'group', 'aria-label': '중앙 계단' }, ...groups,
    h('rect', { class: 'frame', x: 30, y: 12, width: 80, height: 216 }),
    h('line', { class: 'frame', x1: 30, x2: 110, y1: 88, y2: 88 }), h('line', { class: 'frame', x1: 30, x2: 110, y1: 152, y2: 152 }),
    h('path', { class: 'ar', d: 'M70 36 V64 M62 56 L70 64 L78 56' }), h('path', { class: 'ar', d: 'M70 204 V176 M62 184 L70 176 L78 184' }));

  const list = h('div', { class: 'plist' }, ...PARTS.map(p => {
    const on = has(p.key);
    const b = h('button', { type: 'button', class: 'pbtn', disabled: !on, onClick: () => go(p.key) },
      h('span', { class: 'pi' }, p.icon), h('span', { class: 'pn' }, p.name), h('span', { class: 'pgo' }, on ? '3D로 보기 ›' : '스캔 없음'));
    b.addEventListener('pointerenter', () => on && groups.find(g => g.dataset.key === p.key).classList.add('hl'));
    b.addEventListener('pointerleave', () => groups.forEach(g => g.classList.remove('hl')));
    return b;
  }));

  root.append(
    h('p', { class: 'hint' }, mine.length ? '신고할 계단 부분을 눌러 주세요.' : '이 계단은 아직 3D 스캔이 없어요.'),
    h('div', { class: 'stairbox' }, map, h('div', { class: 'srow' }, flight, list)));
  return root;
}
