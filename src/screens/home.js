import { h } from '../lib/dom.js';
import { FLOORS, SCANNED, STAIR_PAIRS, STAIR_SCANNED, stairName } from '../data/config.js';

// 도움말: 새 화면이 아니라 홈 위에 작은 창으로 뜬다
function openHelp() {
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => e.key === 'Escape' && close();
  const closeBtn = h('button', { class: 'btn block', type: 'button', onClick: close }, '닫기');
  const bg = h('div', { class: 'modal-bg', onClick: e => e.target === bg && close() },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'help-ttl' },
      h('h2', { id: 'help-ttl' }, '이용 방법'),
      h('ol', {},
        h('li', {}, h('b', {}, '층 선택'), h('span', {}, '건물 그림에서 신고할 층을 눌러요.')),
        h('li', {}, h('b', {}, '위치 찾기'), h('span', {}, '평면도에서 가까운 곳을 누르면 3D 스캔으로 이동해요. 화면을 드래그해 둘러보고, 화살표로 이동해요.')),
        h('li', {}, h('b', {}, '핀하기'), h('span', {}, '문제가 있는 곳을 십자선에 맞추고 핀하기를 눌러요.')),
        h('li', {}, h('b', {}, '신고 접수'), h('span', {}, '항목(누수, 조명, 지갑 등)을 고르면 끝! 사진과 설명은 필요할 때만 적어요.'))),
      h('p', { class: 'note' }, '신고는 익명이고, 접수현황 탭에서 처리 상태(미확인 → 확인 → 진행 중 → 완료)를 볼 수 있어요.'),
      closeBtn));
  document.addEventListener('keydown', onKey);
  document.getElementById('app').append(bg);
  closeBtn.focus();
}

// 건물 입면(단면) 일러스트. 층을 누르면 평면도로 이동.
export function home() {
  const X = 22, W = 264, FH = 62, TOP = 62, GROUND = TOP + FH * 5;
  const floors = FLOORS.map((f, i) => {
    const y = TOP + FH * i, b1 = f.id === 'B1', scanned = !!SCANNED[f.id];
    const isMain = f.id === '1F'; // 1층은 가운데(오른쪽에서 세 번째) 창을 빼고 그 자리에 출입문을 둔다
    const wins = [0, 1, 2, 3].filter(k => !(isMain && k === 2)).map(k => h('rect', { class: 'win', x: X + 74 + k * 36, y: y + 16, width: 24, height: 22, rx: 2 }));
    const dx = X + 144, dw = 28, dy = y + 20;
    const door = isMain ? h('g', {},
      h('rect', { x: dx - 6, y: y + 12, width: dw + 12, height: 6, rx: 2, fill: '#2b2f3a' }),            // 문 위 차양
      h('rect', { x: dx, y: dy, width: dw, height: FH - 20, fill: '#8a1f3d', stroke: '#2b2f3a', 'stroke-width': 2 }),
      h('rect', { class: 'win', x: dx + 4, y: dy + 5, width: dw - 8, height: 22, rx: 2 }),               // 문 유리
      h('line', { x1: dx + dw / 2, x2: dx + dw / 2, y1: dy, y2: y + FH, stroke: '#2b2f3a', 'stroke-width': 1.5 }), // 양쪽 문 경계
      h('circle', { cx: dx + dw / 2 - 3, cy: dy + 34, r: 1.4, fill: '#f3e3d4' }), h('circle', { cx: dx + dw / 2 + 3, cy: dy + 34, r: 1.4, fill: '#f3e3d4' }),
    ) : null;
    return h('g', { class: `floor ${scanned ? 'scanned' : ''} ${b1 ? 'b1' : ''}`, role: 'button', tabindex: 0, 'aria-label': `${f.name} 평면도 보기`,
      onClick: () => (location.hash = `#/floor/${f.id}`), onKeydown: e => e.key === 'Enter' && (location.hash = `#/floor/${f.id}`) },
      h('rect', { class: 'slab', x: X, y, width: W, height: FH }),
      ...wins, door,
      h('text', { class: 'lbl', x: X + 14, y: y + 26 }, f.id === 'B1' ? 'B1' : f.id),
      h('text', { class: `tag ${scanned ? '' : 'off'}`, x: X + 14, y: y + 44 }, scanned ? '● 3D 스캔' : '준비 중'),
    );
  });
  // 층 사이 계단: 건물 오른쪽에 창문과 같은 모양의 '계단창'을 층 경계에 세로로 걸쳐 놓고, 안에 계단 선을 그린다
  const sx = X + W - 46, sw = 26, sh = 58;
  const stairs = STAIR_PAIRS.map(([lo, hi], i) => {
    const yb = TOP + FH * (i + 1), y0 = yb - sh / 2, id = `${lo}-${hi}`, on = STAIR_SCANNED.includes(id), n = 4, ly = yb === GROUND ? yb + 14 : yb + 3;
    let d = `M ${sx + 4} ${y0 + sh - 6}`;                                        // 아래 왼쪽에서 위 오른쪽으로 오르는 계단 선
    for (let k = 0; k < n; k++) d += ` h ${(sw - 8) / n} v ${-(sh - 12) / n}`;
    return h('g', { class: `stair ${on ? 'scanned' : ''}`, role: 'button', tabindex: 0, 'aria-label': `${stairName([lo, hi])} 보기`,
      onClick: () => (location.hash = `#/stairs/${id}`), onKeydown: e => e.key === 'Enter' && (location.hash = `#/stairs/${id}`) },
      h('rect', { class: 'hit', x: sx - 4, y: y0 - 2, width: sw + 80, height: sh + 4 }),
      h('rect', { class: 'swin', x: sx, y: y0, width: sw, height: sh, rx: 2 }),
      h('path', { class: 'ico', d }),
      h('text', { class: `stl ${on ? '' : 'off'}`, x: X + W + 7, y: ly }, stairName([lo, hi])));
  });
  const svg = h('svg', { class: 'elev', viewBox: `0 0 360 ${GROUND + FH + 12}`, role: 'group', 'aria-label': '생활과학대학 입면도' },
    h('rect', { x: 0, y: GROUND, width: 360, height: FH + 12, fill: '#d9d1bd' }),         // 땅속
    h('rect', { x: 0, y: GROUND - 6, width: 360, height: 6, fill: '#8fb08a' }),          // 지면
    h('rect', { x: X - 8, y: TOP - 14, width: W + 16, height: 14, fill: '#2b2f3a', rx: 3 }), // 옥상 난간
    ...floors,
    ...stairs,
    h('line', { x1: 0, x2: 360, y1: GROUND, y2: GROUND, stroke: '#2b2f3a', 'stroke-width': 2.5 }),
  );
  return h('div', { class: 'home' },
    h('div', { class: 'home-head' },
      h('div', { class: 'kickrow' }, h('div', { class: 'kicker' }, '경희대학교 · 생활과학대학'), h('button', { class: 'helpbtn', type: 'button', 'aria-haspopup': 'dialog', onClick: openHelp }, h('span', { class: 'q' }, '?'), '도움말')),
      h('h1', {}, '건물 하자·분실물 신고'),
      h('p', { class: 'lead' }, '건물 안 고장·분실물을 3D 스캔에서 위치를 찍어 신고해요. ', h('b', {}, '아래에서 층을 눌러 주세요.'))),
    svg,
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:#f3e3d4' }), '3D 스캔 있음'), h('span', {}, h('i', { style: 'background:#ece7da' }), '준비 중')),
  );
}
