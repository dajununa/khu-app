import { h, toast, ago, fullTime, shrinkImage } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { STATUSES, CATEGORIES } from '../data/config.js';
import { goTour, nav } from '../lib/state.js';

const sIdx = s => STATUSES.indexOf(s);
const tagText = r => (r.kind === '분실물' ? `${r.lostFound || '분실물'} · ${r.category || '기타'}${r.pin?.found === 'office' ? ' · 행정실 보관' : r.pin?.found === 'left' ? ' · 그 자리' : ''}` : (r.category || r.kind));
const likedSet = () => { try { return JSON.parse(localStorage.getItem('khu_liked') || '[]'); } catch { return []; } };
const liked = id => likedSet().includes(id);
const setLiked = (id, on) => { try { localStorage.setItem('khu_liked', JSON.stringify(on ? [...new Set([...likedSet(), id])] : likedSet().filter(x => x !== id))); } catch {} };
// 십자선이 사진에 구워지기 전(배포 전, 2026-10-15 16:50 KST 이전)에 올라온 3D 화면은 중앙에 십자선을 덧그린다
const needsCross = r => r.shot && new Date(r.createdAt) < new Date('2026-10-15T07:50:00Z');
const crossSvg = () => h('svg', { class: 'xhair', viewBox: '-50 -50 100 100' }, ...[['#fff', 15], ['#e0344f', 8]].map(([c, w]) => h('path', { d: 'M-17 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M-14 0H-8M8 0H14M0-14V-8M0 8V14', fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' })), h('circle', { r: 4, fill: '#e0344f' }));
// 사진 가운데에 빨간 십자선이 이미 구워져 있는지 픽셀로 확인 (확인 못 하면 업로드 시각으로 추정)
const hasBaked = im => { try {
  const w = im.naturalWidth, hh = im.naturalHeight, c = document.createElement('canvas'), n = 40;
  c.width = c.height = n; const g = c.getContext('2d');
  g.drawImage(im, w / 2 - w * 0.07, hh / 2 - w * 0.07, w * 0.14, w * 0.14, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n).data; let k = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] < 90 && d[i + 2] < 120) k++;
  return k > 12;
} catch { return null; } };
const shotView = (r, src, cls, alt) => {
  const im = h('img', { class: cls, src, alt, loading: 'lazy', crossorigin: 'anonymous' });
  if (src !== r.shot) return im;
  const wrap = h('div', { class: `xwrap ${cls}` }, im);
  im.addEventListener('load', () => { const b = hasBaked(im); if (b === false || (b === null && needsCross(r))) wrap.append(crossSvg()); });
  return wrap;
};
const badge = s => h('span', { class: `badge s-${sIdx(s)}` }, s);

export function board() {
  let rows = [], kind = '전체', status = '전체', cat = '전체', timer;
  const root = h('div', {});
  const list = h('div', { class: 'list' });
  const chips = h('div', { class: 'chips', role: 'tablist' });
  const kindSeg = h('div', { class: 'chips' });
  const catChips = h('div', { class: 'chips', 'aria-label': '항목' });
  const catNames = () => [...new Set((kind === '전체' ? Object.values(CATEGORIES).flat() : CATEGORIES[kind]).map(c => c[0]))];
  const match = r => (kind === '전체' || r.kind === kind) && (status === '전체' || r.status === status) && (cat === '전체' || r.category === cat);

  function drawChips() {
    kindSeg.replaceChildren(...['전체', '하자', '분실물'].map(k => h('button', { class: `chip ${kind === k ? 'on' : ''}`, onClick: () => { kind = k; cat = '전체'; draw(); } }, k)));
    catChips.replaceChildren(...['전체', ...catNames()].map(c => {
      const n = rows.filter(r => (kind === '전체' || r.kind === kind) && (status === '전체' || r.status === status) && (c === '전체' || r.category === c)).length;
      return h('button', { class: `chip ${cat === c ? 'on' : ''}`, onClick: () => { cat = c; draw(); } }, `${c} ${n}`);
    }));
    chips.replaceChildren(...['전체', ...STATUSES].map(s => {
      const n = rows.filter(r => (kind === '전체' || r.kind === kind) && (cat === '전체' || r.category === cat) && (s === '전체' || r.status === s)).length;
      return h('button', { class: `chip ${status === s ? 'on' : ''}`, onClick: () => { status = s; draw(); } }, `${s} ${n}`);
    }));
  }
  function draw() {
    drawChips();
    const shown = rows.filter(match);
    list.replaceChildren(...(shown.length ? shown.map(card) : [h('div', { class: 'empty' }, h('b', {}, '접수된 내용이 없어요'), '홈에서 층을 골라 첫 신고를 남겨 보세요.')]));
  }
  function card(r) {
    const img = r.photo || r.shot; // 직접 올린 사진이 있으면 그것을 먼저
    const el = h('button', { class: `item ${nav.justAdded === r.id ? 'new' : ''}`, onClick: () => openSheet(r) },
      img ? shotView(r, img, 'th', '') : h('div', { class: 'th none' }, '사진 없음'),
      h('div', { class: 'body' },
        h('div', { class: 'row' }, h('span', { class: 'kind' }, tagText(r)), badge(r.status), h('span', { class: 'dt' }, ago(r.createdAt))),
        r.likes ? h('div', { class: 'lk' }, `♥ ${r.likes}`) : null,
        sessionStorage.getItem('khu_pin') ? h('div', { class: 'loc1' }, r.locationLabel || '위치 정보 없음') : null,
        r.detail ? h('div', { class: 'tx' }, r.detail) : null));
    return el;
  }
  function openSheet(r) {
    const bg = h('div', { class: 'sheet-bg', onClick: e => e.target === bg && bg.remove() });
    const admin = () => sessionStorage.getItem('khu_pin');
    const lost = r.kind === '분실물'; // 분실물은 처리 전 칸에 직접 찍은 사진, 핀한 3D 화면은 아래 칸
    const before = lost ? r.photo || r.shot : r.shot || r.photo;
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
        admin() ? h('h2', { style: 'font-size:18px;margin-top:8px' }, r.locationLabel || '위치 정보 없음') : null,
        h('div', { class: 'steps' }, STATUSES.map((s, i) => h('div', { class: i <= sIdx(r.status) ? 'on' : '' }, s))),
        r.detail ? h('p', {}, r.detail) : null,
        h('div', { class: 'ba' },
          h('figure', {}, before ? shotView(r, before, 'bimg', '처리 전') : h('div', { class: 'ph' }, '사진 없음'), h('figcaption', {}, '처리 전')),
          h('figure', {}, r.afterPhoto ? h('img', { src: r.afterPhoto, alt: '처리 후' }) : h('div', { class: 'ph dash' }, r.status === '완료' ? '처리 후 사진 준비 중' : '완료되면 처리 후 사진이 올라와요'), h('figcaption', {}, '처리 후'))),
        admin() ? h('label', { class: 'btn block ghost', style: 'margin:0 0 12px;text-align:center;display:block;line-height:20px' }, r.afterPhoto ? '처리 후 사진 바꾸기 (관리자)' : '처리 후 사진 올리기 (관리자)',
          h('input', { type: 'file', accept: 'image/*', style: 'display:none', onChange: async e => {
            const f = e.target.files[0]; if (!f) return;
            try { const u = await api.setAfterPhoto(r.id, await shrinkImage(f), admin()); Object.assign(r, u); paint(); draw(); toast('처리 후 사진을 올렸어요.'); }
            catch (err) { toast(err.message); if (/PIN/.test(err.message)) sessionStorage.removeItem('khu_pin'), paint(); } } })) : null,
        h('div', { class: 'imgs' }, r.photo && r.shot ? (lost ? h('figure', {}, shotView(r, r.shot, 'bimg', '핀한 3D 화면'), h('figcaption', {}, '핀한 위치')) : h('figure', {}, h('img', { src: r.photo, alt: '신고 사진' }), h('figcaption', {}, '현장 사진'))) : null, null),
        admin() && r.pin?.waypoint ? h('button', { class: 'btn block ghost', onClick: () => { bg.remove(); goTour({ scene: r.pin.scene, floor: r.pin.floor, waypointId: r.pin.waypoint, yaw: r.pin.yaw, pitch: r.pin.pitch, mode: 'view' }); } }, '📍 3D로 위치 보기') : null,
        admin()
          ? h('div', { class: 'admin' }, h('span', { class: 'lbl' }, '처리 상태 변경 (관리자)'), h('div', { class: 'seg' }, STATUSES.map(s => h('button', { class: s === r.status ? 'on' : '', onClick: async () => {
              try { const u = await api.setStatus(r.id, s, admin()); Object.assign(r, u); paint(); draw(); } catch (e) { toast(e.message); if (/PIN/.test(e.message)) sessionStorage.removeItem('khu_pin'), paint(); } } }, s))),
              h('button', { class: 'btn block ghost', style: 'margin-top:12px;color:#c0392b;border-color:#c0392b', onClick: async () => {
                if (!confirm('이 신고를 삭제할까요? 되돌릴 수 없어요.')) return;
                try { await api.remove(r.id, admin()); rows = rows.filter(x => x.id !== r.id); bg.remove(); draw(); toast('삭제했어요.'); }
                catch (e) { toast(e.message); if (/PIN/.test(e.message)) sessionStorage.removeItem('khu_pin'), paint(); } } }, '🗑 이 글 삭제'))
          : h('div', { style: 'display:flex;gap:14px;flex-wrap:wrap' }, h('button', { class: 'linkbtn', onClick: async () => {
              const p = prompt('접수할 때 정한 PIN 4자리를 입력하세요'); if (!p) return;
              try { await api.verifyOwner(r.id, p.trim()); openEdit(r, p.trim(), bg); } catch (e) { toast(e.message); } } }, '✏️ 내 글 수정·삭제'),
            h('button', { class: 'linkbtn', onClick: () => { const p = prompt('관리자 PIN을 입력하세요'); if (p) { sessionStorage.setItem('khu_pin', p); paint(); draw(); } } }, '관리자'))].filter(Boolean));
    };
    paint(); bg.append(sheet); document.getElementById('app').append(bg);
  }
  // 작성자 수정 화면 (접수할 때 정한 PIN 으로 확인된 뒤에만 열린다)
  function openEdit(r, pin, bg) {
    bg.replaceChildren();
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': '내 글 수정' });
    let category = r.category, lostFound = r.lostFound || '분실', photo = null;
    const ta = h('textarea', { maxlength: 1000 }); ta.value = r.detail || '';
    const cats = h('div', { class: 'cats', role: 'radiogroup' });
    const lf = h('div', { class: 'seg' });
    const drawCats = () => {
      cats.replaceChildren(...CATEGORIES[r.kind].map(([name, icon]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(category === name), class: `cat ${category === name ? 'on' : ''}`, onClick: () => { category = name; drawCats(); } }, h('span', { class: 'ic' }, icon), name)));
      lf.hidden = r.kind !== '분실물';
      lf.replaceChildren(...['분실', '습득'].map(v => h('button', { type: 'button', class: lostFound === v ? 'on' : '', onClick: () => { lostFound = v; drawCats(); } }, v === '분실' ? '잃어버렸어요' : '주웠어요')));
    };
    const photoBox = h('label', { class: 'photo' });
    const input = h('input', { type: 'file', accept: 'image/*' });
    const renderPhoto = () => { const src = photo || r.photo; photoBox.replaceChildren(src ? h('img', { src, alt: '사진' }) : h('div', {}, h('div', { style: 'font-size:28px' }, '📷'), h('div', {}, '사진 찍기 / 선택')), input); };
    input.addEventListener('change', async () => { const f = input.files[0]; if (!f) return; try { photo = await shrinkImage(f); renderPhoto(); } catch (e) { toast(e.message); } });
    const save = h('button', { class: 'btn block', type: 'button' }, '저장');
    save.addEventListener('click', async () => {
      const detail = ta.value.trim();
      if (!category) { toast('항목을 골라 주세요.'); return; }
      if (category === '기타' && !detail) { toast('기타는 내용을 적어 주세요.'); ta.focus(); return; }
      save.disabled = true;
      try { const u = await api.update(r.id, pin, { category, detail, lostFound: r.kind === '분실물' ? lostFound : null, photo }); Object.assign(r, u); draw(); bg.remove(); toast('수정했어요.'); }
      catch (e) { toast(e.message); save.disabled = false; }
    });
    const del = h('button', { class: 'btn block ghost', type: 'button', style: 'margin-top:10px;color:#c0392b;border-color:#c0392b', onClick: async () => {
      if (!confirm('이 신고를 삭제할까요? 되돌릴 수 없어요.')) return;
      try { await api.remove(r.id, pin, true); rows = rows.filter(x => x.id !== r.id); draw(); bg.remove(); toast('삭제했어요.'); } catch (e) { toast(e.message); } } }, '🗑 이 글 삭제');
    sheet.append(h('div', { class: 'grab' }), h('h2', { style: 'font-size:18px;margin:8px 0 12px' }, '내 글 수정'),
      h('div', { class: 'form' }, h('div', {}, h('span', { class: 'lbl' }, r.kind === '하자' ? '어떤 하자인가요?' : '어떤 물건인가요?'), cats), h('div', {}, lf),
        h('div', {}, h('span', { class: 'lbl' }, '직접 찍은 사진'), photoBox), h('div', {}, h('span', { class: 'lbl' }, '세부 내용'), ta), save, del));
    drawCats(); renderPhoto(); bg.append(sheet);
  }
  async function refresh() {
    try { rows = await api.list(); draw(); } catch { if (!rows.length) list.replaceChildren(h('div', { class: 'empty' }, h('b', {}, '불러오지 못했어요'), '서버가 켜져 있는지 확인해 주세요.')); }
  }
  root.append(h('div', { class: 'topbar head2' }, h('div', {}, h('h1', {}, '접수현황'), h('p', { class: 'sub' }, '지금까지 접수된 하자·분실물 신고예요. 누구나 볼 수 있어요.'))), kindSeg, catChips, chips, list);
  list.replaceChildren(h('div', { class: 'empty' }, '불러오는 중…'));
  refresh().then(() => { nav.justAdded = null; });
  timer = setInterval(refresh, 15000);
  root._cleanup = () => clearInterval(timer);
  return root;
}
