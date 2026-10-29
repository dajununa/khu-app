import { h, toast, shrinkImage } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { draft, resetDraft, nav, getWaypoints } from '../lib/state.js';
import { CATEGORIES, kindName } from '../data/config.js';

const NEAR_M = 1;
const likedSet = () => { try { return JSON.parse(localStorage.getItem('khu_liked') || '[]'); } catch { return []; } };
const setLiked = (id, on) => { try { localStorage.setItem('khu_liked', JSON.stringify(on ? [...new Set([...likedSet(), id])] : likedSet().filter(x => x !== id))); } catch {} };
// 핀한 지점: 지점(waypoint)에서 시선 방향으로 3m (3D 화면의 핀 표시와 같은 계산)
const pinPoint = (pin, wps) => {
  const w = wps?.[pin?.scene]?.find(x => x.id === pin.waypoint); if (!w) return null;
  const r = Math.PI / 180, y = pin.yaw * r, p = pin.pitch * r;
  return [w.pos[0] - Math.sin(y) * Math.cos(p) * 3, w.pos[1] + Math.cos(y) * Math.cos(p) * 3, w.pos[2] + Math.sin(p) * 3];
};

export function report() {
  if (!draft.pin) { location.hash = '#/'; return h('div'); }
  const root = h('div', {});
  const back = h('button', { class: 'iconbtn', 'aria-label': '뒤로', onClick: () => history.back() }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' })));
  root.append(h('div', { class: 'topbar' }, back, h('h1', {}, draft.kind === '분실물' ? (draft.lostFound === '습득' ? '습득 신고' : '분실 신고') : `${kindName(draft.kind)} 신고`)));

  // 항목(한 단어) 선택. 하자/분실물은 첫 화면에서 이미 골랐다
  const catsEl = h('div', { class: 'cats', role: 'radiogroup', 'aria-label': '항목 선택' });
  const catLbl = h('span', { class: 'lbl' });
  function drawCats() {
    catLbl.textContent = draft.kind === '하자' ? '어떤 안전 문제인가요?' : draft.lostFound === '습득' ? '어떤 물건을 주웠나요?' : '어떤 물건을 잃어버렸나요?';
    catsEl.replaceChildren(...CATEGORIES[draft.kind].map(([name, icon]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(draft.category === name), class: `cat ${draft.category === name ? 'on' : ''}`,
      onClick: () => { draft.category = name; drawCats(); } }, h('span', { class: 'ic' }, icon), name)));
    ta.placeholder = isLost ? '더 알려 주고 싶은 내용이 있다면 적어 주세요' : draft.category === '기타' ? '어떤 내용인지 적어 주세요' : '필요하면 자세한 내용을 적어 주세요 (선택)';
  }
  const ta = h('textarea', { maxlength: 1000, onInput: () => { draft.detail = ta.value; cnt.textContent = `${ta.value.length}/1000`; } });
  ta.value = draft.detail;
  const cnt = h('div', { class: 'counter' }, `${ta.value.length}/1000`);

  // 분실물: 물품 설명(필수) -> 추가 설명(선택) · 전화번호(선택, 공개 여부)
  const isLost = draft.kind === '분실물';
  const itemIn = h('textarea', { class: 'sm', rows: 2, maxlength: 200, placeholder: '예: 검은색 가죽 지갑, 안에 학생증이 있어요', onInput: () => { draft.itemDesc = itemIn.value; } });
  itemIn.value = draft.itemDesc || '';
  const phoneIn = h('input', { class: 'sm', type: 'tel', inputmode: 'numeric', maxlength: 13, autocomplete: 'off', placeholder: '010-xxxx-xxxx', 'aria-label': draft.lostFound === '분실' ? '전화번호 (필수)' : '전화번호 (선택)' });
  phoneIn.value = draft.phone || '';
  // 010- 은 미리 채워 두고, 그 뒤 숫자만 받는다. 3자리 뒤에 대시가 붙고, 4자리째를 치면 4-4 로, 7자리에서 멈추면 3-4 로 정리된다.
  const phoneDigits = v => { let d = v.replace(/\D/g, ''); if (d.startsWith('010')) d = d.slice(3); return d.slice(0, 8); };
  const phoneFormat = (d, typing) => {
    const n = d.length;
    if (n <= 3) return d + (typing && n === 3 ? '-' : '');
    if (n === 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 4)}-${d.slice(4)}`;
  };
  const phoneValue = () => { const d = phoneDigits(phoneIn.value); return d ? `010-${phoneFormat(d, false)}` : ''; };
  phoneIn.addEventListener('focus', () => { if (!phoneIn.value) phoneIn.value = '010-'; });
  phoneIn.addEventListener('blur', () => { if (!phoneDigits(phoneIn.value)) { phoneIn.value = ''; draft.phone = ''; syncPhone(); } });
  const visSeg = h('div', { class: 'seg sm' }, ...[[true, '전체 공개'], [false, '비공개 (관리자만)']].map(([v, t]) => h('button', { type: 'button', class: draft.phonePublic === v ? 'on' : '', 'data-v': String(v),
    onClick: () => { draft.phonePublic = v; [...visSeg.children].forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); } }, t)));
  const visWrap = h('div', { class: 'visrow' }, visSeg, h('small', {}, '전체 공개면 접수현황에서 누구나 볼 수 있어요.'));
  const syncPhone = () => { visWrap.hidden = !phoneDigits(phoneIn.value); };
  phoneIn.addEventListener('input', e => {
    const d = phoneDigits(phoneIn.value), deleting = /^delete/.test(e.inputType || '');
    let f = `010-${phoneFormat(d, !deleting)}`;
    if (deleting && f.endsWith('-') && d.length) f = f.slice(0, -1); // 지울 때는 끝의 대시를 다시 붙이지 않는다
    phoneIn.value = f; draft.phone = phoneValue(); syncPhone();
  });
  syncPhone();

  const pinIn = h('input', { class: 'pin4', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, autocomplete: 'off', placeholder: '숫자 4자리', 'aria-label': '수정·삭제용 PIN 4자리' });
  pinIn.addEventListener('input', () => { pinIn.value = pinIn.value.replace(/\D/g, '').slice(0, 4); });

  const photoBox = h('label', { class: 'photo' });
  const input = h('input', { type: 'file', accept: 'image/*' });
  const renderPhoto = () => { photoBox.replaceChildren(draft.photo ? h('img', { src: draft.photo, alt: '첨부한 사진' }) : h('div', {}, h('div', { style: 'font-size:28px' }, '📷'), h('div', {}, '사진 찍기 / 선택')), input); };
  input.addEventListener('change', async () => { const f = input.files[0]; if (!f) return; try { draft.photo = await shrinkImage(f); renderPhoto(); } catch (e) { toast(e.message); } });
  renderPhoto();

  // 핀 주변 1m 안에 이미 신고된 안전 신고 건이 있으면 사진과 함께 보여 준다
  const nearBox = h('div', { class: 'near', hidden: true });
  if (draft.kind === '하자') {
    Promise.all([api.list(), getWaypoints()]).then(([rows, wps]) => {
      const me = pinPoint(draft.pin, wps); if (!me) return;
      const near = rows.filter(r => r.kind === '하자' && r.status !== '완료' && r.pin?.scene === draft.pin.scene).map(r => ({ r, d: (p => p && Math.hypot(p[0] - me[0], p[1] - me[1], p[2] - me[2]))(pinPoint(r.pin, wps)) }))
        .filter(x => x.d != null && x.d <= NEAR_M).sort((a, b) => a.d - b.d);
      if (!near.length) return;
      nearBox.replaceChildren(h('b', { class: 'nt' }, '근처에 이미 신고된 문제가 있어요'), h('small', {}, '같은 문제라면 새로 신고하지 말고 공감해 주세요.'),
        ...near.map(({ r, d }) => {
          const img = r.photo || r.shot, on = () => likedSet().includes(r.id);
          const like = h('button', { class: 'btn ghost', type: 'button' });
          const paint = () => { like.textContent = on() ? `♥ 공감함 · ${r.likes || 0}` : `같은 문제예요, 공감하기 · ${r.likes || 0}`; };
          like.addEventListener('click', async () => {
            const nowOn = !on(), dl = nowOn ? 1 : -1; setLiked(r.id, nowOn); r.likes = Math.max(0, (r.likes || 0) + dl); paint();
            try { r.likes = (await api.like(r.id, dl)).likes; } catch { setLiked(r.id, !nowOn); r.likes = Math.max(0, r.likes - dl); toast('공감에 실패했어요.'); }
            paint();
          });
          paint();
          return h('div', { class: 'nitem' },
            img ? h('img', { src: img, alt: '이미 신고된 사진', loading: 'lazy' }) : null,
            h('div', {}, `${r.category || '하자'} · ${d.toFixed(1)}m 거리 · ${r.status} · 공감 ${r.likes || 0}`), r.detail ? h('div', { class: 'nd' }, r.detail) : null, like);
        }));
      nearBox.hidden = false;
    }).catch(() => {});
  }

  // 습득: 물건을 그 자리에 두었는지, 행정실에 맡겼는지
  const found = draft.kind === '분실물' && draft.lostFound === '습득';
  const foundSeg = h('div', { class: 'seg' }, ...[['left', '그 자리에 두었어요'], ['office', '행정실에 맡겼어요 (추천)']].map(([v, t]) => h('button', { type: 'button', class: draft.foundAction === v ? 'on' : '',
    onClick: () => { draft.foundAction = v; [...foundSeg.children].forEach((b, i) => b.classList.toggle('on', i === (v === 'left' ? 0 : 1))); } }, t)));

  const submit = h('button', { class: 'btn block', type: 'button' }, '신고 접수');
  submit.addEventListener('click', async () => {
    const detail = ta.value.trim();
    if (found && !draft.foundAction) { toast('물건을 어떻게 했는지 골라 주세요.'); foundSeg.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!draft.category) { toast('항목을 먼저 골라 주세요.'); catsEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const itemDesc = itemIn.value.trim(), phone = phoneValue();
    if (isLost && !itemDesc) { toast('물품 설명을 적어 주세요.'); itemIn.focus(); return; }
    if (isLost && draft.lostFound === '분실' && !phone) { toast('잃어버린 물건은 전화번호를 꼭 적어 주세요.'); phoneIn.focus(); return; }
    if (isLost && phone && !/^010-\d{3,4}-\d{4}$/.test(phone)) { toast('전화번호를 다시 확인해 주세요.'); phoneIn.focus(); return; }
    if (!isLost && draft.category === '기타' && !detail) { toast('기타는 내용을 적어 주세요.'); ta.focus(); return; }
    if (!/^\d{4}$/.test(pinIn.value)) { toast('수정·삭제용 PIN 숫자 4자리를 입력해 주세요.'); pinIn.focus(); return; }
    submit.disabled = true; submit.textContent = '접수 중…';
    try {
      const row = await api.create({ kind: draft.kind, category: draft.category, lostFound: draft.kind === '분실물' ? draft.lostFound : null, detail, locationLabel: draft.label, pin: found ? { ...draft.pin, found: draft.foundAction } : draft.pin, photo: draft.photo, shot: draft.shot, ownerPin: pinIn.value, ...(isLost ? { itemDesc, phone, phonePublic: !!phone && draft.phonePublic } : {}) });
      resetDraft(); nav.tour = null; nav.justAdded = row.id; toast(row.code ? `접수되었어요. 관리번호 ${row.code}` : '접수되었어요. 접수현황에서 확인할 수 있어요.'); location.hash = '#/board';
    } catch (e) { toast(e.message); submit.disabled = false; submit.textContent = '신고 접수'; }
  });

  root.append(h('div', { class: 'form' },
    h('div', { class: 'card' }, h('span', { class: 'lbl' }, draft.pin.scope === 'pin' || !draft.pin.scope ? (found ? '주운 위치' : '핀한 위치') : '잃어버린 위치'),
      h('div', { class: 'loc' }, draft.shot ? h('img', { src: draft.shot, alt: '핀한 3D 화면' }) : null,
        h('div', {}, h('b', {}, draft.label), h('small', {}, draft.pin.scope === 'all' ? '정확한 위치는 모르는 상태로 접수돼요' : draft.pin.scope === 'floor' ? '층만 알고 접수돼요' : '3D 스캔에서 핀한 곳'), h('br'), h('button', { class: 'linkbtn', type: 'button', onClick: () => history.back() }, '위치 다시 정하기')))),
    found ? h('div', { class: 'tip' }, '🙏 주운 물건은 행정실에 맡겨 주세요. 주인이 가장 빨리 찾을 수 있어요.') : null,
    nearBox,
    h('div', {}, catLbl, catsEl),
    found ? h('div', {}, h('span', { class: 'lbl' }, '물건은 어떻게 했나요?'), foundSeg) : null,
    isLost ? h('div', {}, h('span', { class: 'lbl' }, '물품 설명'), itemIn) : null,
    isLost ? h('div', { class: 'smallgrp' },
      h('div', {}, h('span', { class: 'lbl s' }, '추가 설명 (선택)'), ta, cnt),
      h('div', {}, h('span', { class: 'lbl s' }, draft.lostFound === '분실' ? '전화번호 (필수)' : '전화번호 (선택)'), phoneIn, visWrap)) : null,
    h('div', {}, h('span', { class: 'lbl' }, '직접 찍은 사진 (선택)'), photoBox),
    isLost ? null : h('div', {}, h('span', { class: 'lbl' }, '세부 내용 (선택)'), ta, cnt),
    h('div', {}, h('span', { class: 'lbl' }, '수정·삭제용 PIN (필수)'), pinIn, h('p', { class: 'hint', style: 'margin:6px 0 0' }, '나중에 내 글을 고치거나 지울 때 써요. 잊어버리면 찾을 수 없으니 기억해 두세요.')),
    submit,
    h('p', { class: 'hint', style: 'margin:0' }, isLost ? '신고 내용은 접수현황에서 모두에게 공개돼요. 전화번호는 직접 적고 공개를 고른 경우에만 보여요.' : '신고 내용은 접수현황에서 모두에게 공개되며, 작성자 정보는 저장하지 않아요.'),
  ));
  drawCats();
  return root;
}
