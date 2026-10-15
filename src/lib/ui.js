import { h } from './dom.js';
import { FLOORS } from '../data/config.js';
import { isSample } from './db.js';

const chevron = d => h('svg', { viewBox: '0 0 24 24' }, h('path', { d }));
export const backLink = (href, label = '뒤로') => h('a', { class: 'iconbtn', href, 'aria-label': label }, chevron('M15 5l-7 7 7 7'));
export const topbar = (title, back, ...right) => h('div', { class: 'topbar' }, back ? backLink(back) : null, h('h1', {}, title), ...right);

// 층 고르기 칩 (아래층이 왼쪽)
export function floorChips(current, onPick, { only } = {}) {
  const list = FLOORS.slice().reverse().filter(f => !only || only.includes(f.id));
  return h('div', { class: 'chips floors' }, list.map(f => h('button', { class: `chip ${f.id === current ? 'on' : ''}`, onClick: () => onPick(f.id), 'aria-pressed': f.id === current ? 'true' : 'false' }, f.id)));
}

// 아래에서 올라오는 시트. content 는 (close) => 노드
export function openSheet(content, { label = '자세히' } = {}) {
  const bg = h('div', { class: 'sheet-bg', onClick: e => e.target === bg && close() });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': label });
  const close = () => bg.remove();
  const paint = () => sheet.replaceChildren(h('div', { class: 'grab' }), ...[].concat(content(close, paint)));
  paint(); bg.append(sheet); document.getElementById('app').append(bg);
  return { close, paint };
}

// 라벨 붙은 입력칸
export function field(label, input, note) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, note ? h('small', { class: 'note' }, note) : null);
}
export const input = (props = {}) => h('input', { class: 'in', ...props });
export function select(options, value, props = {}) {
  return h('select', { class: 'in', ...props }, options.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) }, t); }));
}
export const empty = (title, text) => h('div', { class: 'empty' }, h('b', {}, title), text || '');
export const loading = () => h('div', { class: 'empty' }, '불러오는 중…');
// replaceChildren 대신: null/false 는 빼고 배열은 펼친다 (replaceChildren 은 null 을 "null" 글자로 넣어 버린다)
export function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(3).filter(k => k != null && k !== false));
  return el;
}
// 예시 데이터로 보여 줄 때 맨 위에 붙는 안내
export const sampleNote = (text = '예시 데이터로 보여 주는 화면이에요. 실제 정보는 행정실에서 등록하면 바뀌어요.') => (isSample() ? h('div', { class: 'sample-note' }, text) : null);
