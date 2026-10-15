import { h } from '../lib/dom.js';
import { SCANNED } from '../data/config.js';
import { elevation } from '../lib/elevation.js';

// 고장 신고 시작 화면: 건물 입면도. 층을 누르면 평면도로 이동.
export function home() {
  const svg = elevation({
    floorClass: f => (SCANNED[f.id] ? 'scanned' : ''),
    label: f => (SCANNED[f.id] ? ['● 3D 스캔', false] : ['준비 중', true]),
    onFloor: f => (location.hash = `#/floor/${f.id}`),
    aria: f => `${f.name} 평면도 보기`,
  });
  return h('div', {},
    h('div', { class: 'topbar' }, h('a', { class: 'iconbtn', href: '#/', 'aria-label': '홈으로' }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' }))), h('h1', {}, '고장 신고')),
    h('p', { class: 'hint', style: 'margin-top:2px' }, '신고할 층을 눌러 주세요. 하자·분실물을 3D 스캔 위에서 바로 가리킬 수 있어요.'),
    svg,
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:#f3e3d4' }), '3D 스캔 있음'), h('span', {}, h('i', { style: 'background:#ece7da' }), '준비 중')),
  );
}
