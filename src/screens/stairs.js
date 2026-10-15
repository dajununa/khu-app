// 층 사이 계단 화면: 평면도처럼 흰 카드에 진한 선으로 그린 옆모습(단면도). 3D 스캔이 있는 부분을 눌러 신고한다.
import { h, toast } from '../lib/dom.js';
import { STAIR_PAIRS, stairName } from '../data/config.js';
import { getWaypoints, goTour } from '../lib/state.js';

const backBtn = () => h('a', { class: 'iconbtn', href: '#/building', 'aria-label': '뒤로' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' })));
const PARTS = [ // 아래층에서 올라가는 순서: 아래 계단(올라가는 계단) → 층계참 → 위 계단(내려가는 계단)
  { key: 'up', name: '올라가는 계단' },
  { key: 'landing', name: '층계참' },
  { key: 'down', name: '내려가는 계단' },
];

// 단면도 좌표. 아래 계단은 오른쪽 위로 올라 층계참에 닿고, 그 위에서 위 계단이 왼쪽 위로 이어진다.
const RUN = 50, RISE = 56, STEPS = 4, LAND = 84, PAD = 8;
const X0 = 56, XL = X0 + RUN * STEPS, XR = XL + LAND; // 계단 시작 · 층계참 왼쪽 끝 · 층계참 오른쪽 끝
const Y3 = 30, YL = Y3 + RISE * STEPS, Y2 = YL + RISE * STEPS; // 위층 바닥 · 층계참 윗면 · 아래층 바닥
const VIEW = `${-PAD} 0 ${XR + PAD * 2} ${Y2 + PAD}`; // 그림이 좌우 같은 여백으로 가운데에 놓이게
const steps = (x, y, dir) => { // (x, y)에서 dir 방향(+1 오른쪽, -1 왼쪽)으로 올라가는 계단 윤곽
  let d = `M${x} ${y}`;
  for (let i = 1; i <= STEPS; i++) d += `V${y - RISE * i}H${x + dir * RUN * i}`;
  return d;
};
const SHAPES = {
  up: `${steps(X0, Y2, 1)}V${Y2}Z`,
  landing: `M${XL} ${YL}H${XR}V${YL + RISE}H${XL}Z`,
  down: `${steps(XL, YL, -1)}V${YL}Z`,
};
const LABEL = { up: [XL - 67, Y2 - 75], landing: [(XL + XR) / 2, YL + RISE / 2], down: [X0 + 67, YL - 75] }; // 각 부분의 가운데 [x, y]
// 한 덩어리로 보이게: 바깥 윤곽은 굵게, 부분 사이 경계는 가는 선으로 그린다
const OUTLINE = (() => {
  let d = `M${X0} ${Y3}`;
  for (let i = 1; i < STEPS; i++) d += `H${X0 + RUN * i}V${Y3 + RISE * i}`; // 위 계단 윗면
  d += `H${XL}V${YL}H${XR}V${YL + RISE}H${XL}V${Y2}H${X0}`; // 층계참을 돌아 아래층 바닥까지
  for (let i = 1; i < STEPS; i++) d += `V${Y2 - RISE * i}H${X0 + RUN * i}`; // 아래 계단 윗면
  return `${d}V${YL}H${X0}Z`; // 위 계단 밑면
})();
const DIVIDERS = `M${XL} ${YL}V${YL + RISE}M${XL - RUN} ${YL}H${XL}`; // 층계참|아래 계단, 아래 계단|위 계단
const floorLabel = id => (id === 'B1' ? 'B1' : id.replace('F', '')) + '층';

export async function stairs(pairId) {
  const pair = STAIR_PAIRS.find(p => p.join('-') === pairId);
  const root = h('div', { class: 'stairs' }, h('div', { class: 'topbar' }, backBtn(), h('h1', {}, pair ? stairName(pair) : '계단')));
  if (!pair) return root.append(h('div', { class: 'empty' }, '없는 계단입니다.')), root;

  const all = await getWaypoints();
  const mine = (all.building || []).filter(w => w.stair === pairId);
  if (!mine.length) return root.append(h('div', { class: 'empty' }, h('b', {}, '이 계단은 아직 3D 스캔이 없어요'), '스캔이 완료되면 신고 기능이 열립니다.')), root;

  const rep = name => { const l = mine.filter(w => w.part === name); return l[Math.floor(l.length / 2)] || null; }; // 구간 한가운데 지점
  const go = key => { const wp = rep(key); if (!wp) return toast('이 부분은 3D 스캔이 없어요'); goTour({ scene: wp.scene, floor: wp.floor, waypointId: wp.id, mode: 'pin' }); };

  const parts = PARTS.map(p => {
    const on = !!rep(p.key), [cx, cy] = LABEL[p.key];
    const g = h('g', { class: `part ${on ? 'on' : 'off'}`, 'data-key': p.key, role: 'button', 'aria-label': on ? `${p.name} 3D 보기` : `${p.name} (3D 스캔 없음)`, 'aria-disabled': on ? null : 'true', tabindex: on ? 0 : null },
      h('path', { class: 'bg', d: SHAPES[p.key] }),
      h('text', { class: 'nm', x: cx, y: on ? cy + 5.5 : cy - 3 }, p.name),
      on ? null : h('text', { class: 'no', x: cx, y: cy + 15 }, '스캔 없음'));
    g.addEventListener('click', () => go(p.key));
    if (on) g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(p.key); } });
    return g;
  });
  const section = h('svg', { class: 'section', viewBox: VIEW, role: 'group', 'aria-label': `${stairName(pair)} 단면도` },
    h('path', { class: 'floor', d: `M0 ${Y3}H${X0}M0 ${Y2}H${XL}` }), // 위층·아래층 바닥선
    ...parts,
    h('path', { class: 'outline', d: OUTLINE }), h('path', { class: 'divider', d: DIVIDERS }),
    h('text', { class: 'fl', x: 0, y: Y3 - 9 }, floorLabel(pair[1])), h('text', { class: 'fl', x: 0, y: Y2 - 9 }, floorLabel(pair[0])));

  root.append(h('div', { class: 'stairs-body' },
    h('p', { class: 'hint' }, '신고할 계단 부분을 눌러 주세요.'),
    h('div', { class: 'plan-wrap' }, section)));
  return root;
}
