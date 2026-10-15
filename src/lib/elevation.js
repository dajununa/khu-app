import { h } from './dom.js';
import { FLOORS } from '../data/config.js';

// 건물 입면(단면) 일러스트. 신고 홈과 편의시설 한눈에 보기가 같이 쓴다.
//   floorClass(f)        층 <g> 에 붙일 추가 class
//   label(f)             [글자, 꺼짐 여부] — 층 이름 아래 작은 글씨 (없으면 null)
//   windows(f)           false 를 돌려주면 그 층은 창문을 그리지 않는다 (아이콘 자리)
//   extra(f, box)        층 위에 더 그릴 SVG 노드들. box = { x, y, w, h }
//   onFloor(f), aria(f)  누를 때 / 스크린리더 이름
export const ELEV = { X: 48, W: 264, FH: 62, TOP: 62 };

export function elevation({ floorClass = () => '', label = () => null, windows = () => true, extra = () => [], onFloor, aria = f => f.name }) {
  const { X, W, FH, TOP } = ELEV, GROUND = TOP + FH * 5;
  const floors = FLOORS.map((f, i) => {
    const y = TOP + FH * i;
    const isMain = f.id === '1F'; // 1층은 가운데(오른쪽에서 세 번째) 창을 빼고 그 자리에 출입문을 둔다
    const showWin = windows(f) !== false;
    const wins = showWin ? [0, 1, 2, 3, 4].filter(k => !(isMain && k === 2)).map(k => h('rect', { class: 'win', x: X + 74 + k * 36, y: y + 16, width: 24, height: 22, rx: 2 })) : [];
    const dx = X + 144, dw = 28, dy = y + 20;
    const door = isMain && showWin ? h('g', {},
      h('rect', { x: dx - 6, y: y + 12, width: dw + 12, height: 6, rx: 2, fill: '#2b2f3a' }),            // 문 위 차양
      h('rect', { x: dx, y: dy, width: dw, height: FH - 20, fill: '#8a1f3d', stroke: '#2b2f3a', 'stroke-width': 2 }),
      h('rect', { class: 'win', x: dx + 4, y: dy + 5, width: dw - 8, height: 22, rx: 2 }),               // 문 유리
      h('line', { x1: dx + dw / 2, x2: dx + dw / 2, y1: dy, y2: y + FH, stroke: '#2b2f3a', 'stroke-width': 1.5 }), // 양쪽 문 경계
      h('circle', { cx: dx + dw / 2 - 3, cy: dy + 34, r: 1.4, fill: '#f3e3d4' }), h('circle', { cx: dx + dw / 2 + 3, cy: dy + 34, r: 1.4, fill: '#f3e3d4' }),
    ) : null;
    const lab = label(f);
    const go = () => onFloor?.(f);
    return h('g', { class: `floor ${f.id === 'B1' ? 'b1' : ''} ${floorClass(f) || ''}`, role: 'button', tabindex: 0, 'aria-label': aria(f),
      onClick: go, onKeydown: e => e.key === 'Enter' && go() },
      h('rect', { class: 'slab', x: X, y, width: W, height: FH }),
      ...wins, door,
      h('text', { class: 'lbl', x: X + 14, y: y + 26 }, f.id),
      lab ? h('text', { class: `tag ${lab[1] ? 'off' : ''}`, x: X + 14, y: y + 44 }, lab[0]) : null,
      ...[].concat(extra(f, { x: X, y, w: W, h: FH }) || []),
    );
  });
  return h('svg', { class: 'elev', viewBox: `0 0 360 ${GROUND + FH + 40}`, role: 'group', 'aria-label': '생활과학대학 입면도' },
    h('rect', { x: 0, y: GROUND, width: 360, height: FH + 40, fill: '#d9d1bd' }),         // 땅속
    h('rect', { x: 0, y: GROUND - 6, width: 360, height: 6, fill: '#8fb08a' }),          // 지면
    h('rect', { x: X - 8, y: TOP - 14, width: W + 16, height: 14, fill: '#2b2f3a', rx: 3 }), // 옥상 난간
    ...floors,
    h('line', { x1: 0, x2: 360, y1: GROUND, y2: GROUND, stroke: '#2b2f3a', 'stroke-width': 2.5 }),
    h('text', { x: 180, y: GROUND + FH + 30, 'text-anchor': 'middle', fill: '#8a8d97', 'font-size': 11 }, '단면 일러스트'),
  );
}
