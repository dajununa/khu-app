import { h, toast, ago, fullTime, shrinkImage } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { STATUSES } from '../data/config.js';
import { goTour, nav } from '../lib/state.js';

const sIdx = s => STATUSES.indexOf(s);
const tagText = r => (r.kind === '분실물' ? `${r.lostFound || '분실물'} · ${r.category || '기타'}` : (r.category || r.kind));
const likedSet = () => { try { return JSON.parse(localStorage.getItem('khu_liked') || '[]'); } catch { return []; } };
const liked = id => likedSet().includes(id);
const setLiked = (id, on) => { try { localStorage.setItem('khu_liked', JSON.stringify(on ? [...new Set([...likedSet(), id])] : likedSet().filter(x => x !== id))); } catch {} };
// 십자선이 사진에 구워지기 전(배포 전, 2026-10-15 16:50 KST 이전)에 올라온 3D 화면은 중앙에 십자선을 덧그린다
const needsCross = r => r.shot && new Date(r.createdAt) < new Date('2026-10-15T07:50:00Z');
const crossSvg = () => h('svg', { class: 'xhair', viewBox: '-50 -50 100 100' }, ...[['#fff', 15], ['#e0344f', 8]].map(([c, w]) => h('path', { d: 'M-17 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M-14 0H-8M8 0H14M0-14V-8M0 8V14', fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' })), h('circle', { r: 4, fill: '#e0344f' }));
const shotView = (r, src, cls, alt) => { const im = h('img', { class: cls, src, alt, loading: 'lazy' }); return needsCross(r) && src === r.shot ? h('div', { class: `xwrap ${cls}` }, im, crossSvg()) : im; };
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
    const img = r.shot || r.photo;
    const el = h('button', { class: `item ${nav.justAdded === r.id ? 'new' : ''}`, onClick: () => openSheet(r) },
      img ? shotView(r, img, 'th', '') : h('div', { class: 'th none' }, '사진 없음'),
      h('div', { class: 'body' },
        h('div', { class: 'row' }, h('span', { class: 'kind' }, tagText(r)), badge(r.status), h('span', { class: 'dt' }, ago(r.createdAt))),
        r.likes ? h('div', { class: 'lk' }, `♥ ${r.likes}`) : null,
        h('div', { class: 'loc1' }, r.locationLabel || '위치 정보 없음'),
        r.detail ? h('div', { class: 'tx' }, r.detail) : null));
    return el;
  }
  function openSheet(r) {
    const bg = h('div', { class: 'sheet-bg', onClick: e => e.target === bg && bg.remove() });
    const admin = () => sessionStorage.getItem('khu_pin');
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': '신고 상세' });
    const paint = () => {
      sheet.replaceChildren(...[
        h('div', { class: 'grab' }),
        h('div', { class: 'row', style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, h('span', { class: 'kind' }, tagText(r)), badge(r.status), ),
        h('div', { class: 'meta' }, h('span', {}, `${fullTime(r.createdAt)} 신고`),
          h('button', { class: `like ${liked(r.id) ? 'on' : ''}`, onClick: async () => {
            const on = !liked(r.id), d = on ? 1 : -1;
            setLiked(r.id, on); r.likes = Math.max(0, (r.likes || 0) + d); paint(); draw();
            try { const u = await api.like(r.id, d); r.likes = u.likes; } catch { setLiked(r.id, !on); r.likes = Math.max(0, r.likes - d); toast('공감에 실패했어요.'); }
            paint(); draw(); } }, `${liked(r.id) ? '♥' : '♡'} 공감 ${r.likes || 0}`)),
        h('h2', { style: 'font-size:18px;margin-top:8px' }, r.locationLabel || '위치 정보 없음'),
        h('div', { class: 'steps' }, STATUSES.map((s, i) => h('div', { class: i <= sIdx(r.status) ? 'on' : '' }, s))),
        r.detail ? h('p', {}, r.detail) : null,
        h('div', { class: 'ba' },
          h('figure', {}, r.shot || r.photo ? shotView(r, r.shot || r.photo, 'bimg', '처리 전') : h('div', { class: 'ph' }, '사진 없음'), h('figcaption', {}, '처리 전')),
          h('figure', {}, r.afterPhoto ? h('img', { src: r.afterPhoto, alt: '처리 후' }) : h('div', { class: 'ph dash' }, r.status === '완료' ? '처리 후 사진 준비 중' : '완료되면 처리 후 사진이 올라와요'), h('figcaption', {}, '처리 후'))),
        admin() ? h('label', { class: 'btn block ghost', style: 'margin:0 0 12px;text-align:center;display:block;line-height:20px' }, r.afterPhoto ? '처리 후 사진 바꾸기 (관리자)' : '처리 후 사진 올리기 (관리자)',
          h('input', { type: 'file', accept: 'image/*', style: 'display:none', onChange: async e => {
            const f = e.target.files[0]; if (!f) return;
            try { const u = await api.setAfterPhoto(r.id, await shrinkImage(f), admin()); Object.assign(r, u); paint(); draw(); toast('처리 후 사진을 올렸어요.'); }
            catch (err) { toast(err.message); if (/PIN/.test(err.message)) sessionStorage.removeItem('khu_pin'), paint(); } } })) : null,
        h('div', { class: 'imgs' }, r.photo && r.shot ? h('figure', {}, h('img', { src: r.photo, alt: '신고 사진' }), h('figcaption', {}, '현장 사진')) : null, null),
        r.pin?.waypoint ? h('button', { class: 'btn block ghost', onClick: () => { bg.remove(); goTour({ scene: r.pin.scene, floor: r.pin.floor, waypointId: r.pin.waypoint, yaw: r.pin.yaw, pitch: r.pin.pitch, mode: 'view' }); } }, '📍 3D로 위치 보기') : null,
        admin()
          ? h('div', { class: 'admin' }, h('span', { class: 'lbl' }, '처리 상태 변경 (관리자)'), h('div', { class: 'seg' }, STATUSES.map(s => h('button', { class: s === r.status ? 'on' : '', onClick: async () => {
              try { const u = await api.setStatus(r.id, s, admin()); Object.assign(r, u); paint(); draw(); } catch (e) { toast(e.message); if (/PIN/.test(e.message)) sessionStorage.removeItem('khu_pin'), paint(); } } }, s))),
              h('button', { class: 'btn block ghost', style: 'margin-top:12px;color:#c0392b;border-color:#c0392b', onClick: async () => {
                if (!confirm('이 신고를 삭제할까요? 되돌릴 수 없어요.')) return;
                try { await api.remove(r.id, admin()); rows = rows.filter(x => x.id !== r.id); bg.remove(); draw(); toast('삭제했어요.'); }
                catch (e) { toast(e.message); if (/PIN/.test(e.message)) sessionStorage.removeItem('khu_pin'), paint(); } } }, '🗑 이 글 삭제'))
          : h('button', { class: 'linkbtn', onClick: () => { const p = prompt('관리자 PIN을 입력하세요'); if (p) { sessionStorage.setItem('khu_pin', p); paint(); } } }, '관리자')].filter(Boolean));
    };
    paint(); bg.append(sheet); document.getElementById('app').append(bg);
  }
  async function refresh() {
    try { rows = await api.list(); draw(); } catch { if (!rows.length) list.replaceChildren(h('div', { class: 'empty' }, h('b', {}, '불러오지 못했어요'), '서버가 켜져 있는지 확인해 주세요.')); }
  }
  root.append(h('div', { class: 'topbar head2' }, h('div', {}, h('h1', {}, '접수현황'), h('p', { class: 'sub' }, '지금까지 접수된 하자·분실물 신고예요. 누구나 볼 수 있어요.'))), kindSeg, chips, list);
  list.replaceChildren(h('div', { class: 'empty' }, '불러오는 중…'));
  refresh().then(() => { nav.justAdded = null; });
  timer = setInterval(refresh, 15000);
  root._cleanup = () => clearInterval(timer);
  return root;
}
