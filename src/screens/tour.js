// 3D 스캔 로드뷰: 지점에 서서 드래그로 둘러보고, 화살표로 다음 지점으로 이동. (자유 이동 없음)
import * as pc from 'playcanvas';
import { h, toast } from '../lib/dom.js';
import { FLOORS, SCENES } from '../data/config.js';
import { getWaypoints, nav } from '../lib/state.js';
import { levelFrom, toLevel, toScan, viewQuat } from '../lib/tilt.js';

// 스캔 바닥이 수평에서 기운 것을 렌더링에서만 보정한다 (false 면 보정 없이 예전과 똑같이 동작).
// 카메라 방향만 바꾼다: yaw/pitch 를 보정된 수평(바닥 법선이 위) 기준으로 재고, 카메라 위치(이동 지점 좌표)와 스플랫은 그대로 둔다.
// 이동 지점 좌표, 신고 핀 저장 값(yaw/pitch 는 스캔 기준), 평면도 좌표 변환은 바뀌지 않는다. 층별 값은 바닥 평면 피팅 결과.
const USE_TILT_FIX = true;
const TILT_FIX = { // 층 -> { scene: 이 스캔에서만 적용, q: 보정 회전 [x,y,z,w] (스캔 좌표에서 바닥 법선을 +z 로), pivot: 측정에 쓴 바닥 중심 (참고용: 카메라만 보정해서 계산에는 쓰이지 않음) }
  '1F': { scene: 'building', q: [-0.011042953, 0.001259767, 0, 0.999938231], pivot: [11.8, 2.7, -0.94] },   // 기울기 1.274°, 법선 (-0.00252, -0.02208, 0.99975)
  '4F': { scene: 'building', q: [-0.007503845, -0.006803953, 0, 0.999948698], pivot: [14.6, -0.4, 11.42] }, // 평면 피팅 1.161°, 법선 (0.01361, -0.01501, 0.99979)
  // 4F 대안(복도 구간 분해 1.372°): q: [-0.008178481, -0.008744639, 0, 0.999928319]
  '5F': { scene: 'classroom513', q: [0.036475595, 0.005089618, 0, 0.999321583], pivot: [-5.3, 1.4, -1.568] }, // 513호(별도 교실 스캔): 기울기 4.221°, 법선 (-0.01017, 0.07290, 0.99729)
};

let eng; // 앱은 한 번만 만들어 재사용 (스캔 다시 불러오지 않도록)
const loaded = {}; // scene -> Promise<Entity[]>

function ensureEngine(host) {
  if (eng) return eng;
  const canvas = h('canvas', { 'aria-label': '3D 스캔 화면' });
  host.prepend(canvas);
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { antialias: false, alpha: false } });
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const world = new pc.Entity('world'); world.setEulerAngles(-90, 0, 0); app.root.addChild(world); // 스캔 좌표는 Z가 위
  const cam = new pc.Entity('cam');
  cam.addComponent('camera', { clearColor: new pc.Color(0.07, 0.07, 0.08), fov: 72, nearClip: 0.05, farClip: 300 });
  world.addChild(cam);
  const resize = () => {
    const w = host.clientWidth, hh = host.clientHeight; if (!w || !hh) return;
    app.resizeCanvas(w, hh);
    cam.camera.horizontalFov = w < hh;               // 세로 화면이면 가로 시야각 기준
    cam.camera.fov = w < hh ? 82 : 72;
  };
  new ResizeObserver(resize).observe(host);
  app.start(); app.autoRender = false;
  return (eng = { app, world, cam, canvas, resize });
}

function loadScene(name) {
  if (loaded[name]) return loaded[name];
  const { app, world } = eng;
  return (loaded[name] = Promise.all(SCENES[name].files.map(url => new Promise((res, rej) => {
    const a = new pc.Asset(url, 'gsplat', { url });
    a.once('error', rej);
    a.ready(() => { const e = new pc.Entity(url); e.addComponent('gsplat', { asset: a }); e.enabled = false; world.addChild(e); res(e); });
    app.assets.add(a); app.assets.load(a);
  }))));
}

const vfov = () => { // 세로 시야각(도)
  const { cam, canvas } = eng, f = cam.camera.fov * Math.PI / 180;
  return (cam.camera.horizontalFov ? 2 * Math.atan(Math.tan(f / 2) * canvas.clientHeight / canvas.clientWidth) : f) * 180 / Math.PI;
};

const chevron = () => h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M6 15l6-6 6 6' }));
const pinIcon = () => h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z', fill: '#e0344f', stroke: '#fff', 'stroke-width': 1.6 }), h('circle', { cx: 12, cy: 9, r: 2.6, fill: '#fff' }));

/**
 * opts: { scene, floor, waypointId, mode: 'pin'|'view', yaw?, pitch? }
 * cb:   { onPin(pin), onClose() }
 * 반환: 정리 함수
 */
export async function openTour(host, opts, cb) {
  host.hidden = false;
  const E = ensureEngine(host), { app, world, cam, canvas } = E;
  E.resize();
  const all = await getWaypoints();
  const wps = all[opts.scene], byId = Object.fromEntries(wps.map(w => [w.id, w]));
  const byLegacy = Object.fromEntries(wps.filter(w => w.legacyId).map(w => [w.legacyId, w])); // 층 라벨을 바로잡기 전 id 로 저장된 신고
  let cur = opts.waypointId ? byId[opts.waypointId] || byLegacy[opts.waypointId] : wps[0];
  if (!cur) { // 없는 지점이면 엉뚱한 곳(첫 지점)으로 보내지 않고 알린 뒤 닫는다
    console.warn('[tour] 이동 지점을 찾을 수 없습니다:', opts.scene, opts.waypointId);
    toast('위치를 찾을 수 없어요'); host.hidden = true; nav.tour = null; cb.onClose(); return () => {};
  }
  const floorNameOf = w => FLOORS.find(f => f.id === w.floor)?.name || '';
  const labelFor = w => w.label ? w.label : opts.scene === 'classroom513' ? `${floorNameOf(w)} · 513호` : `${floorNameOf(w)} · 지점 ${wps.filter(x => x.floor === w.floor).indexOf(w) + 1}`;

  // --- UI ---
  const loader = h('div', { id: 'loader' }, h('div', {}, h('div', { class: 'spin' }), h('div', {}, '3D 스캔 불러오는 중…'), h('small', { style: 'opacity:.7' }, '처음에는 몇 초 걸려요')));
  const title = h('div', { class: 'ttl' }, SCENES[opts.scene].label);
  const sub = h('div', { class: 'sub' });
  const arrowsEl = h('div', { id: 'arrows' });
  const pinBtn = h('button', { class: 'btn' }, '📍 핀하기');
  const top = h('div', { class: 't-top' }, h('button', { class: 'iconbtn', 'aria-label': '닫기', onClick: () => cb.onClose() }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' }))), h('div', {}, title, sub));
  const bottom = h('div', { class: 't-bottom' },
    opts.mode === 'pin' ? [h('small', {}, '화면을 드래그해 하자 위치를 찾고, 십자선에 맞춰 핀하세요'), pinBtn] : [h('small', {}, '빨간 핀이 신고된 위치예요')]);
  const pinMark = opts.mode === 'view' ? h('div', { class: 'pinmark' }, pinIcon()) : null;
  const ui = [loader, top, arrowsEl, opts.mode === 'pin' ? h('div', { class: 'cross' }, h('i')) : null, pinMark, bottom].filter(Boolean);
  ui.forEach(n => host.append(n));

  // --- 시점 상태 ---
  const fx = TILT_FIX[cur.floor];
  const L = USE_TILT_FIX && fx && fx.scene === opts.scene ? levelFrom(fx) : null; // 이 층·이 스캔의 보정 (없으면 null). 층 이름이 같아도 다른 스캔의 값은 쓰지 않는다
  const nUp = L ? L.n : [0, 0, 1];                                 // 스캔 기준에서 본 위쪽
  let yaw, pitch; // 보정 기준 값. 저장·외부 값(opts, 핀)은 스캔 기준이라 바꿔서 쓴다
  if (opts.yaw != null) ({ yaw, pitch } = toLevel(L, opts.yaw, opts.pitch ?? 0));
  else { ({ yaw } = toLevel(L, cur.heading, 0)); pitch = L ? 0 : opts.pitch ?? 0; } // 보정 중이면 기본 시선은 수평
  let pinWorld = null; // 신고 때 핀한 자리: 처음 지점에서 핀 방향으로 3m 떨어진 한 점에 고정 (이동해도 따라오지 않는다)
  if (opts.mode === 'view' && opts.yaw != null) {
    const r = Math.PI / 180, d = [-Math.sin(opts.yaw * r) * Math.cos((opts.pitch ?? 0) * r), Math.cos(opts.yaw * r) * Math.cos((opts.pitch ?? 0) * r), Math.sin((opts.pitch ?? 0) * r)];
    pinWorld = cur.pos.map((v, i) => v + d[i] * 3);
  }
  let moving = null, arrows = [];
  const tmp = new pc.Vec3(), tmp2 = new pc.Vec3();
  const setPos = p => cam.setLocalPosition(p[0], p[1], p[2]);
  setPos(cur.pos);

  function buildArrows() {
    arrowsEl.replaceChildren(); arrows = [];
    const a = cur.pos, cand = cur.links.map(id => byId[id]).filter(Boolean)
      .map(w => ({ w, d: Math.hypot(w.pos[0] - a[0], w.pos[1] - a[1]), b: Math.atan2(-(w.pos[0] - a[0]), w.pos[1] - a[1]) * 180 / Math.PI }))
      .sort((p, q) => p.d - q.d);
    const keep = []; // 비슷한 방향은 가까운 쪽만
    for (const c of cand) if (keep.every(k => Math.abs(((c.b - k.b + 540) % 360) - 180) > 28)) keep.push(c);
    for (const c of keep) {
      const btn = h('button', { class: 'arrow', 'aria-label': '이동', onClick: () => goTo(c.w) }, chevron());
      arrowsEl.append(btn); arrows.push({ btn, w: c.w });
    }
  }
  function goTo(w) {
    if (moving) return;
    moving = { from: cur.pos.slice(), to: w.pos, t: 0, next: w };
    arrowsEl.style.opacity = 0;
  }
  function refreshLabel() { sub.textContent = `${labelFor(cur)}`; }

  // --- 입력 (드래그로 둘러보기) ---
  let drag = null;
  const down = e => { if (e.target.closest('button')) return; drag = { x: e.clientX, y: e.clientY }; host.setPointerCapture?.(e.pointerId); };
  const move = e => {
    if (!drag) return;
    const k = vfov() / host.clientHeight * 1.15;
    yaw += (e.clientX - drag.x) * k; pitch = Math.max(-80, Math.min(80, pitch + (e.clientY - drag.y) * k));
    drag.x = e.clientX; drag.y = e.clientY;
  };
  const up = () => { drag = null; };
  host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);

  // --- 매 프레임 ---
  const toScreen = (p, out) => { // 스캔 좌표 -> 화면 좌표(+깊이)
    tmp.set(p[0], p[1], p[2]); world.getWorldTransform().transformPoint(tmp, tmp2);
    return cam.camera.worldToScreen(tmp2, out);
  };
  const s = new pc.Vec3(), camRot = new pc.Quat();
  const onUpdate = dt => {
    if (moving) {
      moving.t = Math.min(1, moving.t + dt / 0.55); const k = moving.t * moving.t * (3 - 2 * moving.t);
      setPos(moving.from.map((v, i) => v + (moving.to[i] - v) * k));
      if (moving.t >= 1) { cur = moving.next; moving = null; buildArrows(); refreshLabel(); arrowsEl.style.opacity = 1; }
    }
    if (L) { const q = viewQuat(L, yaw, pitch); camRot.set(q[0], q[1], q[2], q[3]); cam.setLocalRotation(camRot); }
    else cam.setLocalEulerAngles(90 + pitch, 0, yaw);
    // 이동 화살표: 다음 지점 바닥 위치에 표시
    for (const a of arrows) {
      toScreen([a.w.pos[0] - 1.35 * nUp[0], a.w.pos[1] - 1.35 * nUp[1], a.w.pos[2] - 1.35 * nUp[2]], s);
      const ok = s.z > 0.3;
      a.btn.style.display = ok ? '' : 'none';
      if (ok) a.btn.style.transform = `translate(${s.x}px, ${s.y}px)`;
      if (ok) { a.btn.style.left = 0; a.btn.style.top = 0; }
    }
    if (pinMark && pinWorld) {
      toScreen(pinWorld, s);
      pinMark.style.display = s.z > 0.3 ? '' : 'none'; pinMark.style.left = s.x + 'px'; pinMark.style.top = s.y + 'px';
    }
  };
  app.on('update', onUpdate);

  // --- 핀하기: 현재 화면을 캡처하고 위치 저장 ---
  pinBtn.addEventListener('click', async () => {
    if (moving) return;
    pinBtn.disabled = true;
    const shot = await new Promise(res => {
      app.once('frameend', () => {
        const r = Math.min(1, 720 / canvas.width), c = document.createElement('canvas');
        c.width = Math.round(canvas.width * r); c.height = Math.round(canvas.height * r);
        const g = c.getContext('2d'); g.drawImage(canvas, 0, 0, c.width, c.height);
        const cx = c.width / 2, cy = c.height / 2, pr = Math.max(6, c.width * 0.02); // 핀한 위치(화면 중앙)에 십자선 표시
        for (const [col, lw] of [['#ffffff', Math.max(5, c.width * 0.014)], ['#e0344f', Math.max(2.5, c.width * 0.007)]]) {
          g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
          g.beginPath(); g.arc(cx, cy, pr, 0, Math.PI * 2); g.moveTo(cx - pr * 1.7, cy); g.lineTo(cx - pr * 0.45, cy); g.moveTo(cx + pr * 0.45, cy); g.lineTo(cx + pr * 1.7, cy);
          g.moveTo(cx, cy - pr * 1.7); g.lineTo(cx, cy - pr * 0.45); g.moveTo(cx, cy + pr * 0.45); g.lineTo(cx, cy + pr * 1.7); g.stroke();
        }
        g.fillStyle = '#e0344f'; g.beginPath(); g.arc(cx, cy, Math.max(2.5, pr * 0.3), 0, Math.PI * 2); g.fill(); res(c.toDataURL('image/jpeg', 0.75));
      });
      app.renderNextFrame = true;
    });
    const sv = toScan(L, yaw, pitch); // 저장은 스캔 기준 (보정을 끄고 열어도 같은 시선)
    cb.onPin({ pin: { scene: opts.scene, floor: cur.floor, waypoint: cur.id, yaw: sv.yaw, pitch: sv.pitch }, shot, label: labelFor(cur) });
  });

  // --- 시작 ---
  buildArrows(); refreshLabel();
  app.autoRender = true;
  const ents = await loadScene(opts.scene);
  for (const [n, list] of Object.entries(loaded)) if (n !== opts.scene) (await list).forEach(e => e.enabled = false);
  ents.forEach(e => e.enabled = true);
  setTimeout(() => loader.classList.add('done'), 1600); // 스플랫 정렬이 끝날 시간을 조금 줌

  return function close() {
    app.off('update', onUpdate); app.autoRender = false;
    host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up);
    ui.forEach(n => n.remove()); host.hidden = true;
  };
}
