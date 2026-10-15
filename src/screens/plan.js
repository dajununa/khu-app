import { h, toast } from '../lib/dom.js';
import { FLOORS, SCANNED, ROOMS, POINT_LABELS, EVAC_PLANS } from '../data/config.js';
import { getWaypoints, goTour } from '../lib/state.js';
import { attachPanZoom } from '../lib/panzoom.js';

const EVAC_TAP_MAX_M = 3; // 탭 위치에서 이 거리(m) 안에 이동 지점이 없으면 '스캔되지 않은 구역'

const backBtn = () => h('a', { class: 'iconbtn', href: '#/fix', 'aria-label': '뒤로' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' })));

export async function plan(floorId) {
  const floor = FLOORS.find(f => f.id === floorId);
  const root = h('div', {}, h('div', { class: 'topbar' }, backBtn(), h('h1', {}, floor ? `${floor.name} 평면도` : '평면도')));
  if (!floor) return root.append(h('div', { class: 'empty' }, '없는 층입니다.')), root;
  if (!SCANNED[floorId]) {
    root.append(h('div', { class: 'empty' }, h('b', {}, '이 층은 아직 3D 스캔이 없어요'), '스캔이 완료되면 평면도와 신고 기능이 열립니다.'));
    return root;
  }
  const all = await getWaypoints();
  const wps = (all[SCANNED[floorId]] || []).filter(w => w.floor === floorId);
  const go = (scene, wp) => goTour({ scene, floor: floorId, waypointId: wp.id, mode: 'pin' });

  // 복도 스캔 없이 호실 스캔만 있는 층(예: 5층 513호): 호실 사각형만 보여 준다
  const rooms = ROOMS[floorId] || [];
  if (rooms.length) {
    const open = r => go(r.scene, { id: r.waypoint });
    const svg = h('svg', { class: 'plan', viewBox: `0 0 40 ${4 + 22 * rooms.length}`, role: 'group', 'aria-label': `${floor.name} 평면도` },
      ...rooms.map((r, i) => { const y = 4 + 22 * i; return h('g', { role: 'button', tabindex: 0, 'aria-label': `${r.name} 3D 보기`, onClick: () => open(r), onKeydown: e => e.key === 'Enter' && open(r) },
        h('rect', { class: 'room', x: 6, y, width: 28, height: 18, rx: 1 }),
        h('text', { class: 'tx', x: 20, y: y + 9 }, r.name), h('text', { class: 'tx s', x: 20, y: y + 11.6 }, '강의실')); }));
    root.append(h('p', { class: 'hint' }, '강의실을 누르면 3D 스캔으로 이동해요.'), h('div', { class: 'plan-wrap' }, svg));
    return root;
  }
  if (!wps.length) return root.append(h('div', { class: 'empty' }, h('b', {}, '이 층의 이동 지점이 없어요'))), root;

  const byId = Object.fromEntries(wps.map(w => [w.id, w]));
  const P = w => [w.pos[0], -w.pos[1]]; // y 반전 (위쪽이 북쪽)
  const xs = wps.map(w => P(w)[0]), ys = wps.map(w => P(w)[1]);
  const pad = 5, minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad, W = Math.max(...xs) + pad - minX, H = Math.max(...ys) + pad - minY;

  const segs = []; const seen = new Set();
  for (const w of wps) for (const l of w.links) { const k = [w.id, l].sort().join('|'); if (!seen.has(k) && byId[l]) { seen.add(k); segs.push([P(w), P(byId[l])]); } }
  const lines = (cls, sw) => h('g', { class: cls, 'stroke-width': sw }, segs.map(([a, b]) => h('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] })));

  const lab = POINT_LABELS[floorId] || {};
  const evac = EVAC_PLANS[floorId];
  if (evac?.enabled) {
    for (const url of evac.jsons) {
      const wrap = await evacPlan(url, wps, P, go, lab, floor.name).catch(() => null);
      if (wrap) return root.classList.add('plan-full'), root.append(wrap), root; // 상단 바를 뺀 화면 전체를 도면이 쓴다
    }
  }
  const svg = h('svg', { class: 'plan', viewBox: `${minX} ${minY} ${W} ${H}`, role: 'group', 'aria-label': `${floor.name} 평면도` },
    lines('wall', 3.3), lines('floorfill', 2.7),
    ...wps.map(w => { const [x, y] = P(w); return h('g', { role: 'button', 'aria-label': '이 위치 3D로 보기', onClick: () => go(w.scene, w) },
      h('circle', { class: 'hit', cx: x, cy: y, r: 1.7 }), h('circle', { class: 'pt', cx: x, cy: y, r: .6 })); }),
    wps.length && lab.first ? h('text', { class: 'tx s', x: P(wps[0])[0], y: P(wps[0])[1] - 1.3 }, lab.first) : null,
    wps.length && lab.last ? h('text', { class: 'tx s', x: P(wps.at(-1))[0], y: P(wps.at(-1))[1] - 1.3 }, lab.last) : null,
  );
  root.append(h('p', { class: 'hint' }, '신고할 위치의 점을 누르면 3D 스캔으로 이동해요.'), h('div', { class: 'plan-wrap' }, svg));
  return root;
}

// 피난안내도 이미지 위에 이동 지점을 얹은 평면도. 도면 px → (X,-Y) 미터 좌표는 JSON 의 imagePx_to_world 사용.
async function evacPlan(metaUrl, wps, P, go, lab, name) {
  const res = await fetch(metaUrl);
  if (!res.ok) throw new Error(metaUrl);
  const meta = await res.json();
  const [A, B, tx, C, D, ty] = meta.transforms.imagePx_to_world, [iw, ih] = meta.image.size;
  const m = [A, -C, B, -D, tx, -ty]; // SVG matrix(a b c d e f): x' = A x + B y + tx, y' = -(C x + D y + ty)
  const deg = Math.atan2(m[1], m[0]) * 180 / Math.PI, rad = -deg * Math.PI / 180; // 도면을 원래 방향(복도 가로)으로 되돌리는 회전
  const rot = ([x, y]) => [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
  const corners = [[0, 0], [iw, 0], [iw, ih], [0, ih]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const pts = [...corners, ...wps.map(P)].map(rot), pad = 0.6; // 여백은 점이 잘리지 않을 정도만
  const x0 = Math.min(...pts.map(p => p[0])) - pad, y0 = Math.min(...pts.map(p => p[1])) - pad;
  const full = { x: x0, y: y0, w: Math.max(...pts.map(p => p[0])) + pad - x0, h: Math.max(...pts.map(p => p[1])) + pad - y0 };

  const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  img.setAttribute('href', '/plans/' + meta.image.file); img.setAttribute('width', iw); img.setAttribute('height', ih);
  img.setAttribute('transform', `matrix(${m.join(' ')})`);
  const upright = (w, text) => { const [x, y] = P(w); return h('text', { class: 'tx s', transform: `translate(${x} ${y}) rotate(${deg}) translate(0 -1.6)` }, text); }; // 회전 보정: 글자는 똑바로
  const world = h('g', {}, img, ...wps.map(w => h('circle', { class: 'pt', cx: P(w)[0], cy: P(w)[1], r: .3 })),
    lab.first ? upright(wps[0], lab.first) : null, lab.last ? upright(wps.at(-1), lab.last) : null);
  const g = h('g', { transform: `rotate(${-deg})` }, world);
  const svg = h('svg', { class: 'plan evac', role: 'group', 'aria-label': `${name} 평면도` }, g);
  attachPanZoom(svg, full, { onTap: (cx, cy) => {
    const p = new DOMPoint(cx, cy).matrixTransform(g.getScreenCTM().inverse());
    let best = null, bd = Infinity;
    for (const w of wps) { const [x, y] = P(w), d = Math.hypot(x - p.x, y - p.y); if (d < bd) bd = d, best = w; }
    if (best && bd <= EVAC_TAP_MAX_M) go(best.scene, best); else toast('스캔되지 않은 구역입니다');
  } });
  return h('div', { class: 'plan-wrap evac' }, svg, h('div', { class: 'plan-hint' }, '도면을 눌러 3D로 이동 · 두 손가락으로 확대'));
}
