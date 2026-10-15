import { h } from '../lib/dom.js';
import { db } from '../lib/db.js';
import { FLOORS, SCANNED } from '../data/config.js';
import { AMENITY_TYPES, amenityType } from '../data/amenities.js';
import { elevation } from '../lib/elevation.js';
import { loadPlan, planView, noPlan } from '../lib/floorplan.js';
import { fill, sampleNote, topbar, floorChips, openSheet, empty, loading } from '../lib/ui.js';

const view = { mode: 'floor', cat: null, floorCat: null }; // 화면을 오가도 고른 탭·항목 기억
const floorName = id => FLOORS.find(f => f.id === id)?.name || id;
const title = a => a.label || a.category;
const sortItems = list => list.slice().sort((a, b) => AMENITY_TYPES.indexOf(amenityType(a.category)) - AMENITY_TYPES.indexOf(amenityType(b.category)) || title(a).localeCompare(title(b)));

// 동그란 아이콘 (SVG 입면도용)
function svgIcon(cx, cy, t, r = 10) {
  return h('g', {}, h('circle', { cx, cy, r, fill: t.color, stroke: '#fff', 'stroke-width': 1.5 }),
    h('text', { x: cx, y: cy + 0.5, class: 'elev-ic', style: `font-size:${t.short.length > 1 ? 8 : 10}px` }, t.short));
}
const dot = t => h('i', { class: 'ic', style: `background:${t.color}` }, t.short);

// 편의시설 상세 시트
export function amenitySheet(a) {
  const t = amenityType(a.category);
  const rows = (Array.isArray(a.details) ? a.details : []).filter(([k, v]) => k && String(v ?? '').trim());
  openSheet(close => [
    h('div', { class: 'am-head' }, dot(t), h('div', {}, h('small', {}, `${floorName(a.floor)} · ${a.category}`), h('h2', {}, title(a)))),
    a.location ? h('p', { class: 'am-loc' }, a.location) : null,
    rows.length ? h('div', { class: 'card kv' }, rows.map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, String(v))))) : h('p', { class: 'hint', style: 'margin:8px 0' }, '등록된 세부정보가 없어요.'),
    h('a', { class: 'btn block', style: 'margin-top:14px;display:block;text-align:center;text-decoration:none', href: SCANNED[a.floor] ? `#/floor/${a.floor}` : '#/fix', onClick: close }, '이 시설 고장 신고하기'),
  ], { label: title(a) });
}

async function loadAmenities() { return db.list('amenities'); }

// ── 한눈에 보기 (입면도) ──────────────────────────────
export function amenities() {
  const root = h('div', {}, topbar('편의시설', '#/'));
  const body = h('div', {}, loading());
  root.append(body);
  loadAmenities().then(items => {
    const paint = () => {
      const tabs = h('div', { class: 'seg tabs' }, ...[['floor', '층별로 보기'], ['cat', '항목별로 보기']].map(([m, t]) => h('button', { class: view.mode === m ? 'on' : '', onClick: () => { view.mode = m; paint(); } }, t)));
      if (!items.length) return fill(body, tabs, empty('아직 등록된 편의시설이 없어요', '행정실에서 위치를 등록하면 여기에 보여요.'));
      view.mode === 'floor' ? byFloor(tabs) : byCat(tabs);
    };
    const byFloor = tabs => {
      const svg = elevation({
        floorClass: f => (items.some(a => a.floor === f.id) ? 'has' : 'none'),
        windows: f => !items.some(a => a.floor === f.id),
        extra: (f, b) => {
          const types = AMENITY_TYPES.filter(t => items.some(a => a.floor === f.id && amenityType(a.category) === t));
          const max = 7, shown = types.slice(0, types.length > max ? max - 1 : max);
          const nodes = shown.map((t, i) => svgIcon(b.x + 86 + i * 24, b.y + b.h / 2, t));
          if (types.length > shown.length) nodes.push(h('text', { x: b.x + 86 + shown.length * 24, y: b.y + b.h / 2 + 4, class: 'elev-more' }, `+${types.length - shown.length}`));
          return nodes;
        },
        label: f => { const n = items.filter(a => a.floor === f.id).length; return n ? [`${n}곳`, false] : ['없음', true]; },
        onFloor: f => { view.floorCat = null; location.hash = `#/amen-floor/${f.id}`; },
        aria: f => `${f.name} 편의시설 보기`,
      });
      const used = AMENITY_TYPES.filter(t => items.some(a => amenityType(a.category) === t));
      fill(body, sampleNote(), tabs, h('p', { class: 'hint' }, '층을 누르면 평면도에서 정확한 위치를 볼 수 있어요.'), svg,
        h('div', { class: 'legend wrap' }, used.map(t => h('span', {}, dot(t), t.id))));
    };
    const byCat = tabs => {
      const used = AMENITY_TYPES.filter(t => items.some(a => amenityType(a.category) === t));
      if (!used.some(t => t.id === view.cat)) view.cat = used[0].id;
      const t = amenityType(view.cat), sel = items.filter(a => amenityType(a.category) === t);
      const svg = elevation({
        floorClass: f => (sel.some(a => a.floor === f.id) ? 'hit' : 'none'),
        windows: f => !sel.some(a => a.floor === f.id),
        extra: (f, b) => { const n = sel.filter(a => a.floor === f.id).length; return n ? [svgIcon(b.x + 96, b.y + b.h / 2, t, 12), h('text', { x: b.x + 116, y: b.y + b.h / 2 + 5, class: 'elev-cnt' }, `${t.id} ${n}곳`)] : []; },
        label: () => null,
        onFloor: f => { view.floorCat = t.id; location.hash = `#/amen-floor/${f.id}`; },
        aria: f => `${f.name} ${t.id} 위치 보기`,
      });
      fill(body, sampleNote(), tabs,
        h('div', { class: 'cat-grid' }, used.map(c => h('button', { class: `cat ${c.id === t.id ? 'on' : ''}`, style: c.id === t.id ? `background:${c.color};border-color:${c.color}` : '', onClick: () => { view.cat = c.id; paint(); } }, dot(c), h('span', {}, c.id)))),
        svg,
        h('div', { class: 'am-list' }, h('span', { class: 'lbl' }, `${t.id} · 건물 전체 ${sel.length}곳`),
          FLOORS.flatMap(f => sel.filter(a => a.floor === f.id)).map(a => h('button', { class: 'am-item', onClick: () => amenitySheet(a) },
            h('span', { class: 'fl' }, a.floor), h('div', {}, h('b', {}, title(a)), h('small', {}, a.location || ' ')), h('svg', { class: 'hub-go', viewBox: '0 0 24 24' }, h('path', { d: 'M9 6l6 6-6 6' }))))),
      );
    };
    paint();
  }).catch(e => fill(body, empty('불러오지 못했어요', e.message)));
  return root;
}

// ── 한 층의 평면도 ───────────────────────────────────
export function amenityFloor(floorId) {
  if (!FLOORS.some(f => f.id === floorId)) { location.hash = '#/amen'; return h('div'); }
  const root = h('div', {}, topbar(`${floorName(floorId)} 편의시설`, '#/amen'));
  const body = h('div', { class: 'am-floor' }, loading());
  root.append(body);
  Promise.all([loadAmenities(), loadPlan(floorId)]).then(([all, plan]) => {
    const items = sortItems(all.filter(a => a.floor === floorId));
    const paint = () => {
      const types = AMENITY_TYPES.filter(t => items.some(a => amenityType(a.category) === t));
      if (view.floorCat && !types.some(t => t.id === view.floorCat)) view.floorCat = null;
      const shown = items.filter(a => !view.floorCat || amenityType(a.category).id === view.floorCat);
      const cats = h('div', { class: 'chips' },
        h('button', { class: `chip ${!view.floorCat ? 'on' : ''}`, onClick: () => { view.floorCat = null; paint(); } }, `전체 ${items.length}`),
        types.map(t => h('button', { class: `chip ${view.floorCat === t.id ? 'on' : ''}`, onClick: () => { view.floorCat = t.id; paint(); } }, `${t.id} ${items.filter(a => amenityType(a.category) === t).length}`)));
      const placed = shown.filter(a => a.x != null && a.y != null);
      const map = plan
        ? planView(plan, { markers: placed.map(a => { const t = amenityType(a.category); return { id: a.id, x: a.x, y: a.y, text: t.short, color: t.color }; }), onMarker: m => amenitySheet(items.find(a => a.id === m.id)) })
        : noPlan('평면도가 준비되면 위치가 표시돼요. 지금은 아래 목록으로 확인해 주세요.');
      const list = h('div', { class: 'am-list' },
        shown.length ? shown.map(a => { const t = amenityType(a.category); return h('button', { class: 'am-item', onClick: () => amenitySheet(a) },
          dot(t), h('div', {}, h('b', {}, title(a)), h('small', {}, a.location || (a.x != null ? '평면도에 표시됨' : ' '))), h('svg', { class: 'hub-go', viewBox: '0 0 24 24' }, h('path', { d: 'M9 6l6 6-6 6' }))); })
          : h('div', { class: 'empty', style: 'padding:24px' }, '이 층에 등록된 편의시설이 없어요.'));
      fill(body, sampleNote(), floorChips(floorId, f => (location.hash = `#/amen-floor/${f}`)), cats, map, list);
    };
    paint();
  }).catch(e => fill(body, empty('불러오지 못했어요', e.message)));
  return root;
}

