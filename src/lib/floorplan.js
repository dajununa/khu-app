import { h } from './dom.js';
import { EVAC_PLANS } from '../data/config.js';
import { attachPanZoom } from './panzoom.js';

// 피난안내도 평면도 위에 표시(마커)를 얹어 보여 준다. 강의실·편의시설 화면이 같이 쓴다.
// 좌표는 신고 평면도(plan.js)와 같은 '월드' 좌표(미터, 위쪽이 북쪽)라서 관리자가 찍은 위치가 정확히 같은 자리에 나온다.

const cache = {};
// 그 층의 도면 정보. 도면이 없는 층이면 null
export function loadPlan(floorId) {
  const cfg = EVAC_PLANS[floorId];
  if (!cfg?.enabled) return Promise.resolve(null);
  return (cache[floorId] ||= (async () => {
    for (const url of cfg.jsons) {
      try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    }
    return null;
  })());
}
export const hasPlan = floorId => !!EVAC_PLANS[floorId]?.enabled;

// markers: [{ id, x, y, text, color, ring }]  text 는 아이콘 안 짧은 글자
// onMarker(m): 마커를 눌렀을 때 / onTap(x, y): 빈 곳을 눌렀을 때(관리자 위치 지정)
export function planView(meta, { markers = [], onMarker, onTap, hint = '두 손가락으로 확대 · 표시를 누르면 자세히' } = {}) {
  const [A, B, tx, C, D, ty] = meta.transforms.imagePx_to_world, [iw, ih] = meta.image.size;
  const m = [A, -C, B, -D, tx, -ty]; // SVG matrix: 도면 px → 월드 (x, -y)
  const deg = Math.atan2(m[1], m[0]) * 180 / Math.PI, rad = -deg * Math.PI / 180;
  const rot = ([x, y]) => [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
  const corners = [[0, 0], [iw, 0], [iw, ih], [0, ih]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]).map(rot);
  const pad = 0.6, x0 = Math.min(...corners.map(p => p[0])) - pad, y0 = Math.min(...corners.map(p => p[1])) - pad;
  const full = { x: x0, y: y0, w: Math.max(...corners.map(p => p[0])) + pad - x0, h: Math.max(...corners.map(p => p[1])) + pad - y0 };

  const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  img.setAttribute('href', '/plans/' + meta.image.file); img.setAttribute('width', iw); img.setAttribute('height', ih);
  img.setAttribute('transform', `matrix(${m.join(' ')})`);
  const layer = h('g', {});
  const world = h('g', {}, img, layer);
  const g = h('g', { transform: `rotate(${-deg})` }, world);
  const svg = h('svg', { class: 'plan evac fp', role: 'group', 'aria-label': '평면도' }, g);

  let current = [];
  const R = 1; // 마커 반지름(m)
  function draw(list) {
    current = list.filter(k => k.x != null && k.y != null && Number.isFinite(+k.x) && Number.isFinite(+k.y));
    layer.replaceChildren(...current.map(k => h('g', { transform: `translate(${+k.x} ${+k.y}) rotate(${deg})`, class: `mk ${k.dim ? 'dim' : ''}` },
      k.ring ? h('circle', { r: R + 0.35, fill: 'none', stroke: k.ring, 'stroke-width': 0.22 }) : null,
      h('circle', { r: R, fill: k.color || '#8a1f3d', stroke: '#fff', 'stroke-width': 0.16 }),
      h('text', { class: 'mk-t', y: 0.02, style: `font-size:${(k.text || '').length > 2 ? 0.68 : 0.85}px` }, k.text || ''),
      k.label ? h('text', { class: 'mk-l', y: R + 0.85 }, k.label) : null)));
  }
  draw(markers);

  attachPanZoom(svg, full, { onTap: (cx, cy) => {
    const ctm = world.getScreenCTM();
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    const scale = Math.hypot(ctm.a, ctm.b); // 1m 가 화면에서 몇 px 인지
    let best = null, bd = Infinity;
    for (const k of current) { const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd) bd = d, best = k; }
    if (best && bd * scale <= 24 && onMarker) return onMarker(best); // 손가락 크기(24px) 안이면 그 마커
    onTap?.(+p.x.toFixed(2), +p.y.toFixed(2));
  } });
  const wrap = h('div', { class: 'plan-wrap evac fp-wrap' }, svg, hint ? h('div', { class: 'plan-hint' }, hint) : null);
  wrap.setMarkers = draw;
  return wrap;
}

// 도면이 없는 층에 쓰는 안내 상자
export const noPlan = text => h('div', { class: 'noplan' }, h('b', {}, '이 층은 아직 도면이 없어요'), text);
