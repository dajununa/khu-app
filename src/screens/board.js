import { h, toast, ago, fullTime } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { STATUSES } from '../data/config.js';
import { goTour, nav } from '../lib/state.js';

const sIdx = s => STATUSES.indexOf(s);
const badge = s => h('span', { class: `badge s-${sIdx(s)}` }, s);

export function board() {
  let rows = [], kind = '전체', status = '전체', timer;
  const root = h('div', {});
  const list = h('div', { class: 'list' });
  const chips = h('div', { class: 'chips', role: 'tablist' });
  const kindSeg = h('div', { class: 'chips' });

  function drawChips() {
    kindSeg.replaceChildren(...['전체', '하자', '분실물'].map(k => h('button', { class: `chip ${kind === k ? 'on' : ''}`, onClick: () => { kind = k; draw(); } }, k)));
    chips.replaceChildren(...['전체', ...STATUSES].map(s => {
      const n = rows.filter(r => (kind === '전체' || r.kind === kind) && (s === '전체' || r.status === s)).length;
      return h('button', { class: `chip ${status === s ? 'on' : ''}`, onClick: () => { status = s; draw(); } }, `${s} ${n}`);
    }));
  }
  function draw() {
    drawChips();
    const shown = rows.filter(r => (kind === '전체' || r.kind === kind) && (status === '전체' || r.status === status));
    list.replaceChildren(...(shown.length ? shown.map(card) : [h('div', { class: 'empty' }, h('b', {}, '접수된 내용이 없어요'), '홈에서 층을 골라 첫 신고를 남겨 보세요.')]));
  }
  function card(r) {
    const img = r.photo || r.shot;
    const el = h('button', { class: `item ${nav.justAdded === r.id ? 'new' : ''}`, onClick: () => openSheet(r) },
      img ? h('img', { class: 'th', src: img, alt: '', loading: 'lazy' }) : h('div', { class: 'th none' }, '사진 없음'),
      h('div', { class: 'body' },
        h('div', { class: 'row' }, h('span', { class: 'kind' }, r.kind), badge(r.status), h('span', { class: 'dt' }, ago(r.createdAt))),
        h('div', { class: 'loc1' }, r.locationLabel || '위치 정보 없음'),
        h('div', { class: 'tx' }, r.detail)));
    return el;
  }
  function openSheet(r) {
    const bg = h('div', { class: 'sheet-bg', onClick: e => e.target === bg && bg.remove() });
    const admin = () => sessionStorage.getItem('khu_pin');
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': '신고 상세' });
    const paint = () => {
      sheet.replaceChildren(
        h('div', { class: 'grab' }),
        h('div', { class: 'row', style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, h('span', { class: 'kind' }, r.kind), badge(r.status), h('span', { class: 'dt', style: 'margin-left:auto;color:var(--muted);font-size:12px' }, fullTime(r.createdAt))),
        h('h2', { style: 'font-size:18px;margin-top:8px' }, r.locationLabel || '위치 정보 없음'),
        h('div', { class: 'steps' }, STATUSES.map((s, i) => h('div', { class: i <= sIdx(r.status) ? 'on' : '' }, s))),
        h('p', {}, r.detail),
        h('div', { class: 'imgs' }, r.photo ? h('figure', {}, h('img', { src: r.photo, alt: '신고 사진' }), h('figcaption', {}, '현장 사진')) : null, r.shot ? h('figure', {}, h('img', { src: r.shot, alt: '3D 화면' }), h('figcaption', {}, '핀한 3D 화면')) : null),
        r.pin?.waypoint ? h('button', { class: 'btn block ghost', onClick: () => { bg.remove(); goTour({ scene: r.pin.scene, floor: r.pin.floor, waypointId: r.pin.waypoint, yaw: r.pin.yaw, pitch: r.pin.pitch, mode: 'view' }); } }, '📍 3D로 위치 보기') : null,
        admin()
          ? h('div', { class: 'admin' }, h('span', { class: 'lbl' }, '처리 상태 변경 (관리자)'), h('div', { class: 'seg' }, STATUSES.map(s => h('button', { class: s === r.status ? 'on' : '', onClick: async () => {
              try { const u = await api.setStatus(r.id, s, admin()); Object.assign(r, u); paint(); draw(); } catch (e) { toast(e.message); if (/PIN/.test(e.message)) sessionStorage.removeItem('khu_pin'), paint(); } } }, s))),
              h('button', { class: 'btn block ghost', style: 'margin-top:12px;color:#c0392b;border-color:#c0392b', onClick: async () => {
                if (!confirm('이 신고를 삭제할까요? 되돌릴 수 없어요.')) return;
                try { await api.remove(r.id, admin()); rows = rows.filter(x => x.id !== r.id); bg.remove(); draw(); toast('삭제했어요.'); }
                catch (e) { toast(e.message); if (/PIN/.test(e.message)) sessionStorage.removeItem('khu_pin'), paint(); } } }, '🗑 이 글 삭제'))
          : h('button', { class: 'linkbtn', onClick: () => { const p = prompt('관리자 PIN을 입력하세요'); if (p) { sessionStorage.setItem('khu_pin', p); paint(); } } }, '관리자'));
    };
    paint(); bg.append(sheet); document.getElementById('app').append(bg);
  }
  async function refresh() {
    try { rows = await api.list(); draw(); } catch { if (!rows.length) list.replaceChildren(h('div', { class: 'empty' }, h('b', {}, '불러오지 못했어요'), '서버가 켜져 있는지 확인해 주세요.')); }
  }
  root.append(h('div', { class: 'topbar' }, h('h1', {}, '접수현황')), kindSeg, chips, list);
  list.replaceChildren(h('div', { class: 'empty' }, '불러오는 중…'));
  refresh().then(() => { nav.justAdded = null; });
  timer = setInterval(refresh, 15000);
  root._cleanup = () => clearInterval(timer);
  return root;
}
