import { h } from '../lib/dom.js';
import { draft } from '../lib/state.js';
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
// 첫 단계: 하자 / 분실물 중 무엇을 신고할지 고른다
export function choose() {
  const pick = kind => { Object.assign(draft, { kind, category: '', pin: null, shot: null, label: '', foundAction: '', lostFound: '분실' }); location.hash = kind === '분실물' ? '#/lost' : '#/building'; };
  const big = (kind, icon, desc) => h('button', { class: 'bigchoice', type: 'button', onClick: () => pick(kind) },
    h('span', { class: 'ic' }, icon), h('b', {}, `${kind} 신고`), h('small', {}, desc));
  return h('div', { class: 'choose' },
    h('div', { class: 'home-head' },
      h('div', { class: 'kickrow' }, h('div', { class: 'kicker' }, '경희대학교 · 생활과학대학'), h('button', { class: 'helpbtn', type: 'button', 'aria-haspopup': 'dialog', onClick: openHelp }, h('span', { class: 'q' }, '?'), '도움말')),
      h('h1', {}, '무엇을 신고할까요?')),
    h('div', { class: 'choices' }, big('하자', '🛠️', '누수·조명·파손 등 건물 고장'), big('분실물', '🎒', '잃어버렸거나 주운 물건')));
}

const backTop = title => h('div', { class: 'topbar' }, h('button', { class: 'iconbtn', 'aria-label': '뒤로', onClick: () => history.back() }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' }))), h('h1', {}, title));

// 분실물 신고 첫 단계: 잃어버렸어요 / 습득했어요
export function lostChoice() {
  const big = (lf, icon, title, desc) => h('button', { class: 'bigchoice', type: 'button', onClick: () => { draft.lostFound = lf; location.hash = lf === '습득' ? '#/building' : '#/lostwhere'; } },
    h('span', { class: 'ic' }, icon), h('b', {}, title), h('small', {}, desc));
  return h('div', { class: 'choose' }, backTop('분실물 신고'),
    h('p', { class: 'hint' }, '어떤 상황인가요?'),
    h('div', { class: 'choices' }, big('분실', '🔍', '잃어버렸어요', '물건을 잃어버려서 찾고 있어요'), big('습득', '🤲', '습득했어요', '주인을 찾는 물건을 주웠어요')));
}

// 잃어버린 위치: 모름(건물 전체) / 층만 / 정확한 위치(3D 핀)
export function lostWhere() {
  const done = (pin, label) => { Object.assign(draft, { pin, label, shot: null }); location.hash = '#/report'; };
  const floorsEl = h('div', { class: 'cats floors', hidden: true }, ...FLOORS.slice().reverse().map(f => h('button', { type: 'button', class: 'cat', onClick: () => done({ scope: 'floor', floor: f.id }, f.name) }, f.name)));
  const opt = (title, desc, fn) => h('button', { class: 'opt', type: 'button', onClick: fn }, h('b', {}, title), h('small', {}, desc));
  return h('div', { class: 'choose' }, backTop('잃어버린 위치'),
    h('p', { class: 'hint' }, '어디서 잃어버렸나요? 아는 만큼만 골라 주세요.'),
    h('div', { class: 'opts' },
      opt('잘 모르겠어요', '생활과학대학 건물 전체로 접수돼요', () => done({ scope: 'all' }, '생활과학대학 전체')),
      opt('층은 알아요', '지하 1층 ~ 5층 중에서 골라요', () => { floorsEl.hidden = !floorsEl.hidden; }),
      floorsEl,
      opt('정확한 위치를 알아요', '3D 스캔에서 핀을 찍어요', () => { location.hash = '#/building'; })));
}

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
  // 층 사이 계단: 한 층 높이를 꽉 채워 바닥에서 바닥까지 이어지는 하나의 계단(지그재그). 건물 오른쪽 벽에 붙이고, 테두리 없이 색만. 계단 모양만 눌린다.
  const sw = 36, sx = X + W - sw - 2, n = 6, outlines = [];
  const stairs = STAIR_PAIRS.map(([lo, hi], j) => {
    const yt = TOP + FH * (j + 1), yb = yt + FH, id = `${lo}-${hi}`, on = STAIR_SCANNED.includes(id);
    const right = (STAIR_PAIRS.length - 1 - j) % 2 === 0;           // 아래 층부터 오른쪽 위 → 왼쪽 위 → … 번갈아 이어진다
    let d = `M ${right ? sx : sx + sw} ${yb}`;
    for (let k = 0; k < n; k++) d += ` v ${-FH / n} h ${(right ? 1 : -1) * sw / n}`;
    d += ` V ${yb} Z`;
    outlines.push(h('path', { class: 'steps-ol', d }));
    return h('g', { class: `stair ${on ? 'scanned' : ''}`, role: 'button', tabindex: 0, 'aria-label': `${stairName([lo, hi])} 보기`,
      onClick: () => (location.hash = `#/stairs/${id}`), onKeydown: e => e.key === 'Enter' && (location.hash = `#/stairs/${id}`) },
      h('path', { class: 'steps', d }),
      h('text', { class: `stl ${on ? '' : 'off'}`, x: X + W + 7, y: yt + FH / 2 - 1 }, stairName([lo, hi]).replace(' 계단', '')),
      h('text', { class: `stl s ${on ? '' : 'off'}`, x: X + W + 7, y: yt + FH / 2 + 10 }, '계단'));
  });
  const svg = h('svg', { class: 'elev', viewBox: `0 0 360 ${GROUND + FH + 12}`, role: 'group', 'aria-label': '생활과학대학 입면도' },
    h('rect', { x: 0, y: GROUND, width: 360, height: FH + 12, fill: '#d9d1bd' }),         // 땅속
    h('rect', { x: 0, y: GROUND - 6, width: 360, height: 6, fill: '#8fb08a' }),          // 지면
    h('rect', { x: X - 8, y: TOP - 14, width: W + 16, height: 14, fill: '#2b2f3a', rx: 3 }), // 옥상 난간
    ...floors,
    h('line', { x1: 0, x2: 360, y1: GROUND, y2: GROUND, stroke: '#2b2f3a', 'stroke-width': 2.5 }),
    h('g', { class: 'steps-outline' }, ...outlines),
    ...stairs,
  );
  return h('div', { class: 'home' },
    h('div', { class: 'home-head' },
      h('div', { class: 'kickrow' }, h('div', { class: 'kicker' }, '경희대학교 · 생활과학대학'), h('button', { class: 'helpbtn', type: 'button', 'aria-haspopup': 'dialog', onClick: openHelp }, h('span', { class: 'q' }, '?'), '도움말')),
      h('h1', {}, draft.kind === '분실물' ? (draft.lostFound === '습득' ? '습득 신고' : '분실 신고') : `${draft.kind} 신고`),
      h('p', { class: 'lead' }, draft.kind === '분실물' ? (draft.lostFound === '습득' ? '습득 신고 · 주운 곳을 3D 스캔에서 찍어 주세요. ' : '분실 신고 · 잃어버린 곳을 3D 스캔에서 찍어 주세요. ') : `${draft.kind} 신고 · 3D 스캔에서 위치를 찍어 신고해요. `, h('b', {}, '아래에서 층을 눌러 주세요.'))),
    svg,
    h('div', { class: 'legend' }, h('span', {}, '● 표시가 있는 층은 3D 스캔으로 신고할 수 있어요')),
  );
}
