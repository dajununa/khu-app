import { h, toast, shrinkImage } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { draft, resetDraft, nav } from '../lib/state.js';
import { CATEGORIES } from '../data/config.js';

export function report() {
  if (!draft.pin) { location.hash = '#/'; return h('div'); }
  const root = h('div', {});
  const back = h('button', { class: 'iconbtn', 'aria-label': '뒤로', onClick: () => history.back() }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' })));
  root.append(h('div', { class: 'topbar' }, back, h('h1', {}, `${draft.kind} 신고`)));

  // 항목(한 단어) 선택. 하자/분실물은 첫 화면에서 이미 골랐다
  const catsEl = h('div', { class: 'cats', role: 'radiogroup', 'aria-label': '항목 선택' });
  const lfSeg = h('div', { class: 'seg' }, ...['분실', '습득'].map(v => h('button', { type: 'button', class: draft.lostFound === v ? 'on' : '', onClick: () => { draft.lostFound = v; [...lfSeg.children].forEach(b => b.classList.toggle('on', b.dataset.v === v)); } , 'data-v': v }, v === '분실' ? '잃어버렸어요' : '주웠어요')));
  const lfWrap = h('div', {}, h('span', { class: 'lbl' }, '어떤 상황인가요?'), lfSeg);
  const catLbl = h('span', { class: 'lbl' });
  function drawCats() {
    catLbl.textContent = draft.kind === '하자' ? '어떤 하자인가요?' : '어떤 물건인가요?';
    lfWrap.hidden = draft.kind !== '분실물';
    catsEl.replaceChildren(...CATEGORIES[draft.kind].map(([name, icon]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(draft.category === name), class: `cat ${draft.category === name ? 'on' : ''}`,
      onClick: () => { draft.category = name; drawCats(); } }, h('span', { class: 'ic' }, icon), name)));
    ta.placeholder = draft.category === '기타' ? '어떤 내용인지 적어 주세요' : '필요하면 자세한 내용을 적어 주세요 (선택)';
  }
  const ta = h('textarea', { maxlength: 1000, onInput: () => { draft.detail = ta.value; cnt.textContent = `${ta.value.length}/1000`; } });
  ta.value = draft.detail;
  const cnt = h('div', { class: 'counter' }, `${ta.value.length}/1000`);

  const photoBox = h('label', { class: 'photo' });
  const input = h('input', { type: 'file', accept: 'image/*' });
  const renderPhoto = () => { photoBox.replaceChildren(draft.photo ? h('img', { src: draft.photo, alt: '첨부한 사진' }) : h('div', {}, h('div', { style: 'font-size:28px' }, '📷'), h('div', {}, '사진 찍기 / 선택')), input); };
  input.addEventListener('change', async () => { const f = input.files[0]; if (!f) return; try { draft.photo = await shrinkImage(f); renderPhoto(); } catch (e) { toast(e.message); } });
  renderPhoto();

  const submit = h('button', { class: 'btn block', type: 'button' }, '신고 접수');
  submit.addEventListener('click', async () => {
    const detail = ta.value.trim();
    if (!draft.category) { toast('항목을 먼저 골라 주세요.'); catsEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (draft.category === '기타' && !detail) { toast('기타는 내용을 적어 주세요.'); ta.focus(); return; }
    submit.disabled = true; submit.textContent = '접수 중…';
    try {
      const row = await api.create({ kind: draft.kind, category: draft.category, lostFound: draft.kind === '분실물' ? draft.lostFound : null, detail, locationLabel: draft.label, pin: draft.pin, photo: draft.photo, shot: draft.shot });
      resetDraft(); nav.tour = null; nav.justAdded = row.id; toast('접수되었어요. 접수현황에서 확인할 수 있어요.'); location.hash = '#/board';
    } catch (e) { toast(e.message); submit.disabled = false; submit.textContent = '신고 접수'; }
  });

  root.append(h('div', { class: 'form' },
    h('div', { class: 'card' }, h('span', { class: 'lbl' }, '핀한 위치'),
      h('div', { class: 'loc' }, draft.shot ? h('img', { src: draft.shot, alt: '핀한 3D 화면' }) : null,
        h('div', {}, h('b', {}, draft.label), h('small', {}, '3D 스캔에서 핀한 곳'), h('br'), h('button', { class: 'linkbtn', type: 'button', onClick: () => history.back() }, '위치 다시 정하기')))),
    lfWrap,
    h('div', {}, catLbl, catsEl),
    h('div', {}, h('span', { class: 'lbl' }, '직접 찍은 사진 (선택)'), photoBox),
    h('div', {}, h('span', { class: 'lbl' }, '세부 내용 (선택)'), ta, cnt),
    submit,
    h('p', { class: 'hint', style: 'margin:0' }, '신고 내용은 접수현황에서 모두에게 공개되며, 작성자 정보는 저장하지 않아요.'),
  ));
  drawCats();
  return root;
}
