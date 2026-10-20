import { h, toast, ago, fullTime, shrinkImage } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { STATUSES, CATEGORIES, kindName } from '../data/config.js';
import { goTour, nav } from '../lib/state.js';

const sIdx = s => STATUSES.indexOf(s);
const tagText = r => (r.kind === '분실물' ? `${r.lostFound === '습득' ? '발견' : r.lostFound || '분실물'} · ${r.category || '기타'}${r.pin?.found === 'office' ? ' · 행정실 보관' : r.pin?.found === 'left' ? ' · 그 자리' : ''}` : (r.category || r.kind));
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
const codeTag = r => (r.code ? h('span', { class: 'code' }, r.code) : null);
// 검색: 관리번호는 F-012, f012, f12 어느 쪽으로 써도 찾는다. 그 밖에 항목·세부 내용도 함께 본다.
const norm = t => String(t || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const hit = (r, q) => {
  const m = /^([flr])-?0*(\d+)$/i.exec(q.trim());
  if (m) return !!r.code && r.code[0].toLowerCase() === m[1].toLowerCase() && parseInt(r.code.slice(2), 10) === +m[2];
  const nq = norm(q);
  return !nq || norm(r.code).includes(nq) || norm(r.category).includes(nq) || norm(r.itemDesc).includes(nq) || norm(r.detail).includes(nq);
};
// 분실물은 처리 단계를 둘로만 보여 준다 (저장 값은 그대로: 완료 = 반환완료, 나머지 = 접수완료)
const LOST_STEPS = ['접수완료', '반환완료'];
const isLostRow = r => r.kind === '분실물';
const stepsOf = r => (isLostRow(r) ? LOST_STEPS : STATUSES);
const stIdx = r => (isLostRow(r) ? (r.status === '완료' ? 1 : 0) : sIdx(r.status));
const stName = r => stepsOf(r)[stIdx(r)];
const stSave = (r, name) => (isLostRow(r) ? (name === '반환완료' ? '완료' : '미확인') : name);
const badge = r => h('span', { class: `badge s-${isLostRow(r) ? (stIdx(r) ? 3 : 0) : stIdx(r)}` }, stName(r));

export function board() {
  let rows = [], kind = '전체', status = '전체', cat = '전체', lf = '전체', q = '', timer;
  const root = h('div', {});
  const list = h('div', { class: 'list' });
  const search = h('input', { class: 'search', type: 'search', placeholder: '관리번호(예: F-012) 또는 내용 검색', 'aria-label': '검색', autocomplete: 'off' });
  search.addEventListener('input', () => { q = search.value; draw(); });
  const catNames = () => (kind === '전체' ? [] : CATEGORIES[kind].map(c => c[0]));
  // 처리 상태 필터: 분실물 탭은 접수완료/반환완료, 시설 지원 탭은 4단계, 전체 탭은 처리 중/완료
  const stMatch = r => status === '전체' || (kind === '하자' ? r.status === status : (kind === '분실물' ? status === '반환완료' : status === '완료') ? r.status === '완료' : r.status !== '완료');
  const statusOpts = () => (kind === '분실물' ? LOST_STEPS : kind === '하자' ? STATUSES : ['처리 중', '완료']);
  const match = r => hit(r, q) && (kind === '전체' || r.kind === kind) && stMatch(r) && (cat === '전체' || r.category === cat) && (lf === '전체' || r.lostFound === lf);
  const lfName = v => (v === '습득' ? '발견' : v);

  // 위쪽: 큰 구분 탭(밑줄) + 검색 + 필터 버튼. 세부 조건은 필터 창에서 고르고, 켜 둔 조건은 목록 위에 태그로 보인다.
  const tabs = h('div', { class: 'ktabs', role: 'tablist' });
  const filterBtn = h('button', { class: 'fbtn', type: 'button', 'aria-haspopup': 'dialog', onClick: () => openFilter() });
  const tags = h('div', { class: 'ftags' });
  const reset = () => { cat = '전체'; lf = '전체'; status = '전체'; };
  const activeTags = () => [
    lf !== '전체' && [lfName(lf), () => { lf = '전체'; }],
    cat !== '전체' && [cat, () => { cat = '전체'; }],
    status !== '전체' && [status, () => { status = '전체'; }],
  ].filter(Boolean);
  function drawChips() {
    tabs.replaceChildren(...['전체', '하자', '분실물'].map(k => h('button', { type: 'button', role: 'tab', class: kind === k ? 'on' : '', 'aria-selected': String(kind === k), onClick: () => { kind = k; reset(); draw(); } }, kindName(k))));
    const act = activeTags();
    filterBtn.replaceChildren(...[h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M4 6h16M7 12h10M10 18h4' })), '필터', act.length ? h('b', {}, String(act.length)) : null].filter(Boolean));
    tags.hidden = !act.length;
    tags.replaceChildren(...act.map(([name, clear]) => h('button', { type: 'button', class: 'ftag', 'aria-label': `${name} 조건 지우기`, onClick: () => { clear(); draw(); } }, name, h('span', {}, '×'))));
  }

  // 필터 창 (아래에서 올라오는 시트). 바꾸는 즉시 목록에 반영된다.
  function openFilter() {
    const bg = h('div', { class: 'sheet-bg', onClick: e => e.target === bg && bg.remove() });
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': '필터' });
    const group = (title, items, cur, pick) => h('div', { class: 'fgroup' }, h('span', { class: 'lbl' }, title),
      h('div', { class: 'fopts' }, ...items.map(([v, name]) => h('button', { type: 'button', class: `fopt ${cur === v ? 'on' : ''}`, onClick: () => { pick(cur === v ? '전체' : v); draw(); paint(); } }, name))));
    const paint = () => {
      const n = rows.filter(match).length;
      sheet.replaceChildren(...[h('div', { class: 'grab' }), h('h2', { style: 'font-size:18px;margin:8px 0 14px' }, '필터'),
        kind === '분실물' ? group('분실 / 발견', [['분실', '분실'], ['습득', '발견']], lf, v => { lf = v; }) : null,
        kind !== '전체' ? group(kind === '하자' ? '시설 종류' : '물건 종류', catNames().map(c => [c, c]), cat, v => { cat = v; }) : null,
        group('처리 상태', statusOpts().map(st => [st, st]), status, v => { status = v; }),
        h('div', { class: 'factions' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => { reset(); draw(); paint(); } }, '초기화'), h('button', { class: 'btn', type: 'button', onClick: () => bg.remove() }, `${n}건 보기`))].filter(Boolean));
    };
    paint(); bg.append(sheet); document.getElementById('app').append(bg);
  }
  function draw() {
    drawChips();
    const shown = rows.filter(match);
    list.replaceChildren(...(shown.length ? shown.map(card) : [h('div', { class: 'empty' }, h('b', {}, '접수된 내용이 없어요'), q ? '검색 결과가 없어요. 관리번호를 다시 확인해 보세요.' : '홈에서 층을 골라 첫 신고를 남겨 보세요.')]));
  }
  function card(r) {
    const img = r.photo; // 썸네일은 항상 사용자가 올린 사진 (없으면 '사진 없음')
    const el = h('button', { class: `item ${nav.justAdded === r.id ? 'new' : ''}`, onClick: () => openSheet(r) },
      img ? shotView(r, img, 'th', '') : h('div', { class: 'th none' }, '사진 없음'),
      h('div', { class: 'body' },
        h('div', { class: 'row' }, codeTag(r), h('span', { class: 'kind' }, tagText(r)), badge(r), h('span', { class: 'dt' }, ago(r.createdAt))),
        r.likes ? h('div', { class: 'lk' }, `♥ ${r.likes}`) : null,
        sessionStorage.getItem('khu_pin') ? h('div', { class: 'loc1' }, r.locationLabel || '위치 정보 없음') : null,
        r.itemDesc || r.detail ? h('div', { class: 'tx' }, r.itemDesc || r.detail) : null));
    return el;
  }
  function openSheet(r) {
    const bg = h('div', { class: 'sheet-bg', onClick: e => e.target === bg && bg.remove() });
    const admin = () => sessionStorage.getItem('khu_pin');
    const lost = r.kind === '분실물'; // 분실물은 처리 전 칸에 직접 찍은 사진, 핀한 3D 화면은 아래 칸
    const before = lost ? r.photo : r.shot || r.photo; // 분실물의 '물품 사진'은 직접 올린 사진만 (핀한 화면으로 대신하지 않는다)
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': '신고 상세' });
    // 연락처: 작성자가 공개로 정했으면 누구나, 비공개면 관리자(PIN 입력)만 본다
    let adminPhone;
    const phoneLine = () => {
      const adm = admin() ? adminPhone : null;
      const num = r.phonePublic && r.phone ? r.phone : adm?.phone;
      if (!num) return null;
      const note = r.phonePublic ? '공개' : '비공개 · 관리자만 보여요';
      return h('div', { class: 'phoneline' }, '📞 ', h('a', { href: `tel:${num.replace(/-/g, '')}` }, num), h('small', {}, ` ${note}`));
    };
    const loadAdminPhone = async () => {
      if (!admin() || r.kind !== '분실물' || adminPhone !== undefined) return;
      adminPhone = null;
      try { adminPhone = await api.getPhone(r.id, admin()); paint(); } catch { /* PIN이 틀리면 아래 다른 동작이 알려 준다 */ }
    };
    const paint = () => {
      sheet.replaceChildren(...[
        h('div', { class: 'grab' }),
        h('div', { class: 'row', style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, codeTag(r), h('span', { class: 'kind' }, tagText(r)), badge(r), ),
        h('div', { class: 'meta' }, h('span', {}, `${fullTime(r.createdAt)} 신고`),
          h('button', { class: `like ${liked(r.id) ? 'on' : ''}`, onClick: async () => {
            const on = !liked(r.id), d = on ? 1 : -1;
            setLiked(r.id, on); r.likes = Math.max(0, (r.likes || 0) + d); paint(); draw();
            try { const u = await api.like(r.id, d); r.likes = u.likes; } catch { setLiked(r.id, !on); r.likes = Math.max(0, r.likes - d); toast('공감에 실패했어요.'); }
            paint(); draw(); } }, `${liked(r.id) ? '♥' : '♡'} 공감 ${r.likes || 0}`)),
        admin() ? h('h2', { style: 'font-size:18px;margin-top:8px' }, r.locationLabel || '위치 정보 없음') : null,
        h('div', { class: `steps ${lost ? 'two' : ''}` }, stepsOf(r).map((st, i) => h('div', { class: i <= stIdx(r) ? 'on' : '' }, st))),
        r.itemDesc ? h('p', { style: 'font-weight:700;margin-bottom:4px' }, r.itemDesc) : null,
        r.detail ? h('p', { style: r.itemDesc ? 'font-size:14px;color:var(--muted);margin-top:0' : '' }, r.detail) : null,
        phoneLine(),
        lost && r.lostFound === '습득'
          ? h('div', { class: 'ba' }, // 주운 물건: 물품 사진 + 핀한 위치를 나란히. 없는 쪽은 안내 문구
              h('figure', {}, r.photo ? shotView(r, r.photo, 'bimg', '물품 사진') : h('div', { class: 'ph' }, '사진 없음'), h('figcaption', {}, '물품 사진')),
              h('figure', {}, r.shot ? shotView(r, r.shot, 'bimg', '핀한 위치') : h('div', { class: 'ph' }, '위치 없음', h('br'), '행정실에 문의'), h('figcaption', {}, '핀한 위치')))
        : lost
          ? h('div', { class: 'imgs' }, h('figure', {}, before ? shotView(r, before, 'bimg', '물품 사진') : h('div', { class: 'ph' }, '사진 없음'), h('figcaption', {}, '물품 사진')))
          : h('div', { class: 'ba' },
          h('figure', {}, before ? shotView(r, before, 'bimg', '처리 전') : h('div', { class: 'ph' }, '사진 없음'), h('figcaption', {}, '처리 전')),
          h('figure', {}, r.afterPhoto ? h('img', { src: r.afterPhoto, alt: '처리 후' }) : h('div', { class: 'ph dash' }, r.status === '완료' ? '처리 후 사진 준비 중' : '완료되면 처리 후 사진이 올라와요'), h('figcaption', {}, '처리 후'))),
        admin() && !lost ? h('label', { class: 'btn block ghost', style: 'margin:0 0 12px;text-align:center;display:block;line-height:20px' }, r.afterPhoto ? '처리 후 사진 바꾸기 (관리자)' : '처리 후 사진 올리기 (관리자)',
          h('input', { type: 'file', accept: 'image/*', style: 'display:none', onChange: async e => {
            const f = e.target.files[0]; if (!f) return;
            try { const u = await api.setAfterPhoto(r.id, await shrinkImage(f), admin()); Object.assign(r, u); paint(); draw(); toast('처리 후 사진을 올렸어요.'); }
            catch (err) { toast(err.message); if (/PIN/.test(err.message)) sessionStorage.removeItem('khu_pin'), paint(); } } })) : null,
        lost ? null : h('div', { class: 'imgs' }, r.photo && r.shot ? h('figure', {}, h('img', { src: r.photo, alt: '신고 사진' }), h('figcaption', {}, '현장 사진')) : null, null),
        admin() && r.pin?.waypoint ? h('button', { class: 'btn block ghost', onClick: () => { bg.remove(); goTour({ scene: r.pin.scene, floor: r.pin.floor, waypointId: r.pin.waypoint, yaw: r.pin.yaw, pitch: r.pin.pitch, mode: 'view' }); } }, '📍 3D로 위치 보기') : null,
        admin()
          ? h('div', { class: 'admin' }, h('span', { class: 'lbl' }, '처리 상태 변경 (관리자)'), h('div', { class: `seg ${lost ? 'two' : ''}` }, stepsOf(r).map(s => h('button', { class: s === stName(r) ? 'on' : '', onClick: async () => {
              try { const u = await api.setStatus(r.id, stSave(r, s), admin()); Object.assign(r, u); paint(); draw(); } catch (e) { toast(e.message); if (/PIN/.test(e.message)) sessionStorage.removeItem('khu_pin'), paint(); } } }, s))),
              h('button', { class: 'btn block ghost', style: 'margin-top:12px;color:#c0392b;border-color:#c0392b', onClick: async () => {
                if (!confirm('이 신고를 삭제할까요? 되돌릴 수 없어요.')) return;
                try { await api.remove(r.id, admin()); rows = rows.filter(x => x.id !== r.id); bg.remove(); draw(); toast('삭제했어요.'); }
                catch (e) { toast(e.message); if (/PIN/.test(e.message)) sessionStorage.removeItem('khu_pin'), paint(); } } }, '🗑 이 글 삭제'))
          : h('div', { style: 'display:flex;gap:14px;flex-wrap:wrap' }, h('button', { class: 'linkbtn', onClick: async () => {
              const p = prompt('접수할 때 정한 PIN 4자리를 입력하세요'); if (!p) return;
              try { await api.verifyOwner(r.id, p.trim()); openEdit(r, p.trim(), bg); } catch (e) { toast(e.message); } } }, '✏️ 내 글 수정·삭제'),
            h('button', { class: 'linkbtn', onClick: () => { const p = prompt('관리자 PIN을 입력하세요'); if (p) { sessionStorage.setItem('khu_pin', p); adminPhone = undefined; paint(); draw(); loadAdminPhone(); } } }, '관리자'))].filter(Boolean));
    };
    paint(); loadAdminPhone(); bg.append(sheet); document.getElementById('app').append(bg);
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
      if (category === '기타' && !detail && !r.itemDesc) { toast('기타는 내용을 적어 주세요.'); ta.focus(); return; }
      save.disabled = true;
      try { const u = await api.update(r.id, pin, { category, detail, lostFound: r.kind === '분실물' ? lostFound : null, photo }); Object.assign(r, u); draw(); bg.remove(); toast('수정했어요.'); }
      catch (e) { toast(e.message); save.disabled = false; }
    });
    const del = h('button', { class: 'btn block ghost', type: 'button', style: 'margin-top:10px;color:#c0392b;border-color:#c0392b', onClick: async () => {
      if (!confirm('이 신고를 삭제할까요? 되돌릴 수 없어요.')) return;
      try { await api.remove(r.id, pin, true); rows = rows.filter(x => x.id !== r.id); draw(); bg.remove(); toast('삭제했어요.'); } catch (e) { toast(e.message); } } }, '🗑 이 글 삭제');
    sheet.append(h('div', { class: 'grab' }), h('h2', { style: 'font-size:18px;margin:8px 0 12px' }, '내 글 수정'),
      h('div', { class: 'form' }, h('div', {}, h('span', { class: 'lbl' }, r.kind === '하자' ? '어떤 시설 지원이 필요한가요?' : '어떤 물건인가요?'), cats), h('div', {}, lf),
        h('div', {}, h('span', { class: 'lbl' }, '직접 찍은 사진'), photoBox), h('div', {}, h('span', { class: 'lbl' }, '세부 내용'), ta), save, del));
    drawCats(); renderPhoto(); bg.append(sheet);
  }
  async function refresh() {
    try { rows = await api.list(); draw(); } catch { if (!rows.length) list.replaceChildren(h('div', { class: 'empty' }, h('b', {}, '불러오지 못했어요'), '서버가 켜져 있는지 확인해 주세요.')); }
  }
  root.append(h('div', { class: 'topbar head2' }, h('div', {}, h('h1', {}, '접수현황'), h('p', { class: 'sub' }, '지금까지 접수된 시설 지원·분실물 신고예요. 누구나 볼 수 있어요.'))), tabs, h('div', { class: 'toolrow' }, search, filterBtn), tags, list);
  list.replaceChildren(h('div', { class: 'empty' }, '불러오는 중…'));
  refresh().then(() => { nav.justAdded = null; });
  timer = setInterval(refresh, 15000);
  root._cleanup = () => clearInterval(timer);
  return root;
}
