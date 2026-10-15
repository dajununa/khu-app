import { h, toast } from '../lib/dom.js';
import { FLOORS, SCANNED, ROOMS, POINT_LABELS } from '../data/config.js';
import { getWaypoints, goTour } from '../lib/state.js';
import { attachPanZoom } from '../lib/panzoom.js';

// 층별 피난안내도 평면도. enabled:false 로 바꾸면 그 층은 기존(복도 선) 방식으로 즉시 돌아간다.
// jsons 는 위에서부터 시도하고, 못 불러오면 다음 도면으로, 모두 실패하면 기존(복도 선) 방식으로 넘어간다.
const EVAC_PLANS = {
  '1F': { enabled: true, jsons: ['/plans/f1-evac-portrait.v2.json', '/plans/f1-evac-portrait.json', '/plans/f1-evac.json'] }, // 세로 도면 v2(정렬 재계산) → 옛 세로 도면 → 가로 도면
  '4F': { enabled: true, jsons: ['/plans/f4-evac.json'] },
  '5F': { enabled: true, kind: 'regions', jsons: ['/plans/f5-evac.json'] }, // 3D 좌표와 정렬하지 않은 도면: 호실 영역(rooms[].polygon)을 누르면 그 스캔(scene/waypoint)으로. 실패하면 호실 사각형 화면
};
// 1F/4F 도면 탭: 탭한 위치에서 가장 가까운 이동 지점의 3D 로 이동한다 (같은 거리면 id 가 작은 쪽).
const EVAC_TAP_MAX_M = Infinity; // 가장 가까운 지점이 이 거리(m)보다 멀면 이동하지 않고 '스캔되지 않은 구역' 토스트 (Infinity = 제한 없음)
const EVAC_TAP_NOTICE_M = 3;     // 가장 가까운 지점이 이보다 멀면 이동하면서 '가장 가까운 지점으로 이동' 안내 토스트
const EVAC_TAP_RIPPLE = true;    // 탭한 자리에 0.5초 안에 사라지는 작은 원 표시
const EVAC_RIPPLE_MS = 180;      // 원이 보이도록 이동을 조금 늦춘다 (EVAC_TAP_RIPPLE 이 false 면 바로 이동)

const backBtn = () => h('a', { class: 'iconbtn', href: '#/', 'aria-label': '뒤로' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' })));

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

  const evac = EVAC_PLANS[floorId];
  if (evac?.enabled && evac.kind === 'regions') { // 영역 연결 도면 (정렬 없음). 못 불러오면 아래 호실 사각형 화면으로
    for (const url of evac.jsons) {
      const wrap = await regionPlan(url, go, floor.name).catch(() => null);
      if (wrap) return root.classList.add('plan-full'), root.append(wrap), root;
    }
  }

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
  if (evac?.enabled && evac.kind !== 'regions') {
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
  const world = h('g', {}, img, // 이동 지점 점은 그리지 않는다 (탭하면 가장 가까운 지점으로 이동)
    lab.first ? upright(wps[0], lab.first) : null, lab.last ? upright(wps.at(-1), lab.last) : null);
  const g = h('g', { transform: `rotate(${-deg})` }, world);
  const svg = h('svg', { class: 'plan evac', role: 'group', 'aria-label': `${name} 평면도` }, g);
  const det = m[0] * m[3] - m[1] * m[2], inv = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]; // m 의 역행렬 (월드 → 도면 px)
  const outside = await loadOutside('/plans/' + meta.image.file); // 건물 벽 바깥 흰 여백 마스크 (못 만들면 null: 도면 안은 어디든 이동 허용)
  let busy = false;
  attachPanZoom(svg, full, { onTap: (cx, cy) => {
    if (busy) return;
    const p = new DOMPoint(cx, cy).matrixTransform(g.getScreenCTM().inverse());
    const ix = Math.floor(inv[0] * p.x + inv[2] * p.y + inv[4]), iy = Math.floor(inv[1] * p.x + inv[3] * p.y + inv[5]);
    if (ix < 0 || iy < 0 || ix >= iw || iy >= ih) return; // 도면 이미지 밖
    if (outside && outside.w === iw && outside.h === ih && outside.m[iy * iw + ix]) return; // 건물 벽 바깥 여백
    let best = null, bd = Infinity;
    for (const w of wps) { const [x, y] = P(w), d = Math.hypot(x - p.x, y - p.y); if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && w.id < best.id)) bd = d, best = w; }
    if (!best) return;
    if (bd > EVAC_TAP_MAX_M) return toast('스캔되지 않은 구역입니다');
    if (bd > EVAC_TAP_NOTICE_M) toast('스캔이 없는 구역이라 가장 가까운 지점으로 이동했어요');
    if (EVAC_TAP_RIPPLE) {
      const c = h('circle', { class: 'tap-ripple', cx: p.x, cy: p.y, r: 1.3 }); g.append(c); setTimeout(() => c.remove(), 500);
      busy = true; setTimeout(() => { busy = false; go(best.scene, best); }, EVAC_RIPPLE_MS);
    } else go(best.scene, best);
  } });
  return h('div', { class: 'plan-wrap evac' }, svg, h('div', { class: 'plan-hint' }, '도면을 눌러 3D로 이동 · 두 손가락으로 확대'));
}

// 도면 이미지에서 건물 벽 바깥의 흰 여백을 찾는다: 이미지 가장자리의 흰 픽셀에서 흰 픽셀만 따라 채운다 (벽선=어두운 선은 1px 두껍게 막고, 회색 복도는 흰색이 아니라 입구가 열려 있어도 새지 않는다).
// 반환 { w, h, m(1=바깥) } 또는 실패하면 null (그러면 도면 안은 어디를 눌러도 이동).
async function loadOutside(url) {
  try {
    const img = new Image(); img.src = url; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data, wall = new Uint8Array(w * h), white = new Uint8Array(w * h), m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; if (Math.max(r, g, b) < 150) wall[i] = 1; if (Math.min(r, g, b) >= 236) white[i] = 1; }
    const thick = new Uint8Array(wall);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (wall[i - 1] || wall[i + 1] || wall[i - w] || wall[i + w]) thick[i] = 1; }
    const st = []; const push = i => { if (white[i] && !thick[i] && !m[i]) { m[i] = 1; st.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (st.length) { const i = st.pop(), x = i % w; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < w * (h - 1)) push(i + w); }
    return { w, h, m };
  } catch { return null; }
}

// 도면 이미지 위에 호실 영역을 얹은 평면도 (3D 좌표 정렬 없음). 도면 px 좌표계의 viewBox 를 쓰고, 영역을 누르면 그 호실의 3D 스캔으로 들어간다.
async function regionPlan(metaUrl, go, name) {
  const res = await fetch(metaUrl);
  if (!res.ok) throw new Error(metaUrl);
  const meta = await res.json(), [iw, ih] = meta.image.size, rooms = (meta.rooms || []).filter(r => r.polygon?.length >= 3 && r.scene && r.waypoint);
  if (!rooms.length) throw new Error('rooms');
  const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  img.setAttribute('href', '/plans/' + meta.image.file); img.setAttribute('width', iw); img.setAttribute('height', ih);
  const badge = r => { const [x0, y0, x1, y1] = r.bbox, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - 22; // 라벨(방 번호) 위쪽에 '3D 스캔' 표시
    return h('g', { class: 'region-badge' }, h('rect', { x: cx - 27, y: cy - 9, width: 54, height: 18, rx: 9 }), h('text', { x: cx, y: cy + 4.5 }, '3D 스캔')); };
  const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const svg = h('svg', { class: 'plan evac', viewBox: `0 0 ${iw} ${ih}`, role: 'group', 'aria-label': `${name} 평면도` }, img,
    ...rooms.map(r => h('polygon', { class: 'region', points: r.polygon.map(p => p.join(',')).join(' ') })), ...rooms.map(badge));
  const names = rooms.map(r => r.name).join(', ');
  attachPanZoom(svg, { x: 0, y: 0, w: iw, h: ih }, { onTap: (cx, cy) => {
    const p = new DOMPoint(cx, cy).matrixTransform(svg.getScreenCTM().inverse()), hit = rooms.find(r => inPoly(r.polygon, p.x, p.y));
    if (hit) go(hit.scene, { id: hit.waypoint }); else toast(`스캔이 없는 구역입니다. ${names}만 3D로 볼 수 있어요`);
  } });
  return h('div', { class: 'plan-wrap evac' }, svg, h('div', { class: 'plan-hint' }, `${names}를 누르면 3D 스캔으로 이동 · 두 손가락으로 확대`));
}
