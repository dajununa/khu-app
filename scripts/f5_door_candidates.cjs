// 5층 도면의 513호 문과 513호 스캔의 이동 지점 사이 거리를 방 모서리 대응으로 추정한다 (3D 정렬이 아닌 '직사각형 방 대응' 추정).
// 사용법: node scripts/f5_door_candidates.cjs   (public/plans/f5-evac.webp 와 plans-source/f5-evac.png, kh_class 의 f5-mesh.webp/f5-splat.webp/f5.json 이 필요)
//   환경변수 KH_PLANS 로 kh_class/viewer/plans 위치를 바꿀 수 있다.  결과: plans-source/f5-door-candidates.json (make_f5_plan.cjs 가 candidates 로 읽음) + 확인용 이미지
// 가정: 513호는 직사각형이고, 도면의 방 모서리 4개가 스캔 방(메쉬 단면의 최소 면적 직사각형) 모서리 4개에 회전(거울 반전 없음)으로 대응한다.
//   긴 변끼리 대응하면 가능한 방향은 2가지: 방향 2(바깥 창쪽 벽 대응 증거가 있는 쪽)를 기본으로, 방향 1은 비교용.
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KH = process.env.KH_PLANS || path.join(os.homedir(), 'Desktop/kh_class/viewer/plans');
const CHECK_DIR = path.join(os.homedir(), 'Desktop/f5-check');
const SRC = path.join(ROOT, 'plans-source/f5-evac.png');
const WP = require(path.join(ROOT, 'public/data/waypoints.json')).classroom513;
const J5 = JSON.parse(fs.readFileSync(path.join(KH, 'f5.json'), 'utf8'));
const OUT = path.join(ROOT, 'plans-source/f5-door-candidates.json');

const ROOM_PLAN = { x0: 568, y0: 246, x1: 684, y1: 440 }; // 513호 (원본 px, make_f5_plan.cjs 가 찾은 영역의 벽 안쪽)

async function raw(p, bg) { const { data, info } = await sharp(p).flatten({ background: bg || '#fff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, w: info.width, h: info.height }; }

function convexHull(P) {
  P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
function minAreaRect(hull) { // 회전 캘리퍼스(단순 전수): 변마다 정렬해 최소 면적 사각형
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, vx = -uy, vy = ux;
    let mu = 1e18, Mu = -1e18, mv = 1e18, Mv = -1e18;
    for (const p of hull) { const u = p[0] * ux + p[1] * uy, v = p[0] * vx + p[1] * vy; mu = Math.min(mu, u); Mu = Math.max(Mu, u); mv = Math.min(mv, v); Mv = Math.max(Mv, v); }
    const area = (Mu - mu) * (Mv - mv); if (!best || area < best.area) best = { area, ux, uy, vx, vy, mu, Mu, mv, Mv };
  }
  return best;
}

(async () => {
  // ---- 1) 도면 513호 서쪽 벽의 문 틈 (벽선이 끊긴 구간) ----
  const P = await raw(SRC);
  const dark = (x, y) => { const i = (y * P.w + x) * 3; return P.d[i] < 150; };
  const wallCol = [565, 566, 567];                                   // 서쪽 벽선(x≈564~568) 위에서 어두운 픽셀이 없는 y 구간 = 문 틈 (북쪽 문, 남쪽 문)
  const isWall = y => wallCol.some(x => dark(x, y));
  const gaps = []; let gs = -1;
  for (let y = ROOM_PLAN.y0 + 2; y <= ROOM_PLAN.y1 - 2; y++) { if (!isWall(y)) { if (gs < 0) gs = y; } else if (gs >= 0) { if (y - gs >= 6) gaps.push([gs, y - 1]); gs = -1; } }
  if (gs >= 0 && ROOM_PLAN.y1 - 2 - gs >= 6) gaps.push([gs, ROOM_PLAN.y1 - 2]);
  console.log('513호 서쪽 벽 문 틈(y 구간, 원본 px):', JSON.stringify(gaps));
  if (!gaps.length) throw new Error('문 틈을 찾지 못했습니다');
  const doors = gaps.map(g => ({ y: (g[0] + g[1]) / 2, gap: g }));
  const south = doors.reduce((a, b) => (b.y > a.y ? b : a));

  // ---- 2) 스캔 방 직사각형 (메쉬 단면선의 최소 면적 사각형) ----
  const M = await raw(path.join(KH, 'f5-mesh.webp'), '#f4f4f2'), S = await raw(path.join(KH, 'f5-splat.webp'), '#f4f4f2');
  const lum = (im, i) => 0.299 * im.d[i * 3] + 0.587 * im.d[i * 3 + 1] + 0.114 * im.d[i * 3 + 2];
  // 선 픽셀 -> 연결 덩어리(작은 잡음 제거)
  const mask = new Uint8Array(M.w * M.h); for (let i = 0; i < M.w * M.h; i++) mask[i] = lum(M, i) < 150 ? 1 : 0;
  const lab = new Int32Array(M.w * M.h), sizes = [0]; let nl = 0;
  for (let i = 0; i < M.w * M.h; i++) if (mask[i] && !lab[i]) { nl++; let n = 0; const st = [i]; lab[i] = nl; while (st.length) { const k = st.pop(); n++; const x = k % M.w, y = (k / M.w) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= M.w || Y >= M.h) continue; const j = Y * M.w + X; if (mask[j] && !lab[j]) { lab[j] = nl; st.push(j); } } } sizes.push(n); }
  const big = sizes.indexOf(Math.max(...sizes));
  const wallPts = []; for (let i = 0; i < M.w * M.h; i += 1) if (lab[i] === big) wallPts.push([i % M.w, (i / M.w) | 0]);
  // 바깥 돌출(문틀, 잡음)에 둔감하게: 방향별 투영의 2~98 백분위로 모서리를 잡는다 (최소 면적 방향은 볼록 껍질로 구함)
  const hull = convexHull(wallPts), mr = minAreaRect(hull);
  const proj = (p, ax, ay) => p[0] * ax + p[1] * ay;
  const pct = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
  const us = wallPts.map(p => proj(p, mr.ux, mr.uy)), vs = wallPts.map(p => proj(p, mr.vx, mr.vy));
  const U0 = pct(us, 0.015), U1 = pct(us, 0.985), V0 = pct(vs, 0.015), V1 = pct(vs, 0.985);
  const at = (u, v) => [u * mr.ux + v * mr.vx, u * mr.uy + v * mr.vy];
  // 긴 변이 u 방향이 되도록 (u = 길이 방향). 이미지에서 왼쪽->오른쪽이 되게 부호 정리
  let lu = U1 - U0, lv = V1 - V0, A = [mr.ux, mr.uy], Bv = [mr.vx, mr.vy], u0 = U0, u1 = U1, v0 = V0, v1 = V1;
  if (lv > lu) { [A, Bv] = [Bv, [-A[0], -A[1]]]; const nu0 = V0, nu1 = V1, nv0 = -U1, nv1 = -U0; u0 = nu0; u1 = nu1; v0 = nv0; v1 = nv1; [lu, lv] = [lv, lu]; }
  if (A[0] < 0) { A = [-A[0], -A[1]]; [u0, u1] = [-u1, -u0]; }                // 길이 축이 +x 쪽을 향하게
  // v 축은 길이 축을 시계 방향(이미지에서 아래쪽)으로 90° 돌린 방향
  Bv = [-A[1], A[0]]; // (x,y)->(-y,x) : 이미지 좌표(y 아래)에서 시계 방향 회전
  // 위에서 v 범위를 새 Bv 기준으로 다시 계산
  const us2 = wallPts.map(p => p[0] * A[0] + p[1] * A[1]), vs2 = wallPts.map(p => p[0] * Bv[0] + p[1] * Bv[1]);
  u0 = pct(us2, 0.015); u1 = pct(us2, 0.985); v0 = pct(vs2, 0.015); v1 = pct(vs2, 0.985); lu = u1 - u0; lv = v1 - v0;
  const P2 = (u, v) => [u * A[0] + v * Bv[0], u * A[1] + v * Bv[1]];
  const TL = P2(u0, v0), TR = P2(u1, v0), BR = P2(u1, v1), BL = P2(u0, v1);   // (u 작은 쪽 = 왼쪽 끝, v 작은 쪽 = 위쪽 벽)
  const mpp = J5.mPerPx;
  console.log(`스캔 방: 긴 변 ${(lu * mpp).toFixed(2)} m × 짧은 변 ${(lv * mpp).toFixed(2)} m, 긴 축 각도 ${(Math.atan2(A[1], A[0]) * 180 / Math.PI).toFixed(1)}° (이미지 기준), 모서리 TL ${TL.map(Math.round)} TR ${TR.map(Math.round)} BR ${BR.map(Math.round)} BL ${BL.map(Math.round)}`);
  console.log(`도면 513호: ${(ROOM_PLAN.x1 - ROOM_PLAN.x0)}×${(ROOM_PLAN.y1 - ROOM_PLAN.y0)}px (긴 변 ${ROOM_PLAN.y1 - ROOM_PLAN.y0}px) -> 스캔 긴 변/짧은 변 비 ${(lu / lv).toFixed(2)} vs 도면 ${((ROOM_PLAN.y1 - ROOM_PLAN.y0) / (ROOM_PLAN.x1 - ROOM_PLAN.x0)).toFixed(2)}`);

  // ---- 3) 바깥(창쪽) 벽 판별: 각 벽 바로 바깥쪽 스플랫 밝기 ----
  const band = (uA, uB, vA, vB) => { let s = 0, n = 0; for (let k = 0; k < 4000; k++) { const u = uA + Math.random() * (uB - uA), v = vA + Math.random() * (vB - vA), p = P2(u, v), x = Math.round(p[0]), y = Math.round(p[1]); if (x < 0 || y < 0 || x >= S.w || y >= S.h) continue; s += lum(S, y * S.w + x); n++; } return n ? s / n : NaN; };
  const m0 = 8, m1 = 40;                                              // 벽 바깥 8~40px 띠 (밝은 창 빛/과노출 판단)
  const wallBright = { top: band(u0 + lu * 0.1, u1 - lu * 0.1, v0 - m1, v0 - m0), bottom: band(u0 + lu * 0.1, u1 - lu * 0.1, v1 + m0, v1 + m1), left: band(u0 - m1, u0 - m0, v0 + lv * 0.1, v1 - lv * 0.1), right: band(u1 + m0, u1 + m1, v0 + lv * 0.1, v1 - lv * 0.1) };
  const inner = { top: band(u0 + lu * 0.1, u1 - lu * 0.1, v0 + 4, v0 + 34), bottom: band(u0 + lu * 0.1, u1 - lu * 0.1, v1 - 34, v1 - 4) };
  console.log('벽 바깥 띠 평균 밝기(0~255): 위', wallBright.top.toFixed(0), '아래', wallBright.bottom.toFixed(0), '왼', wallBright.left.toFixed(0), '오', wallBright.right.toFixed(0), '| 벽 안쪽 띠 위', inner.top.toFixed(0), '아래', inner.bottom.toFixed(0));

  // ---- 4) 대응 (직사각형 대응, 2가지 방향) ----
  // 도면(원본 px): 북서 NW(x0,y0), 북동 NE(x1,y0), 남동 SE(x1,y1), 남서 SW(x0,y1) 은 시계 방향. 스캔: TL, TR, BR, BL 도 시계 방향.
  // 방향 2: 도면 위(북) = 스캔 왼쪽 끝, 도면 오른쪽(동, 바깥 창쪽) = 스캔 위쪽 벽. NW->BL, NE->TL, SE->TR, SW->BR
  // 방향 1: 도면 위(북) = 스캔 오른쪽 끝, 도면 오른쪽(동) = 스캔 아래쪽 벽. NW->TR, NE->BR, SE->BL, SW->TL
  const OPT = {
    2: { NW: BL, NE: TL, SE: TR, SW: BR, text: '도면 북=스캔 왼쪽 끝, 도면 동(창쪽 외벽)=스캔 위쪽 벽' },
    1: { NW: TR, NE: BR, SE: BL, SW: TL, text: '도면 북=스캔 오른쪽 끝, 도면 동=스캔 아래쪽 벽' },
  };
  const bil = (o, fu, fv) => { // 도면 방 안의 비율 (fu: 서->동 0..1, fv: 북->남 0..1) -> 스캔 px (쌍선형)
    const top = [o.NW[0] + (o.NE[0] - o.NW[0]) * fu, o.NW[1] + (o.NE[1] - o.NW[1]) * fu], bot = [o.SW[0] + (o.SE[0] - o.SW[0]) * fu, o.SW[1] + (o.SE[1] - o.SW[1]) * fu];
    return [top[0] + (bot[0] - top[0]) * fv, top[1] + (bot[1] - top[1]) * fv];
  };
  const toPx = w => [(w.pos[0] - J5.bounds.minX) / mpp, (J5.bounds.maxY - w.pos[1]) / mpp];
  const wps = WP.map(w => ({ id: w.id, px: toPx(w), xy: w.pos.slice(0, 2) }));
  const doorFv = d => (d.y - ROOM_PLAN.y0) / (ROOM_PLAN.y1 - ROOM_PLAN.y0);
  const result = {};
  for (const k of [2, 1]) {
    const o = OPT[k], out = [];
    for (const [label, d] of [['south', south], ['north', doors.reduce((a, b) => (b.y < a.y ? b : a))]]) {
      const dp = bil(o, 0, doorFv(d)), list = wps.map(w => ({ id: w.id, distM: +(Math.hypot(w.px[0] - dp[0], w.px[1] - dp[1]) * mpp).toFixed(2) })).sort((a, b) => a.distM - b.distM);
      out.push({ door: label, planY: d.y, scanPx: dp.map(v => +v.toFixed(0)), startDistM: list.find(x => x.id.endsWith('-000')).distM, nearest: list.slice(0, 3) });
    }
    result[k] = { text: o.text, doors: out };
    for (const r of out) console.log(`방향 ${k} [${o.text}] ${r.door} 문(도면 y=${r.planY}): 스캔 px ${r.scanPx}, 000 까지 ${r.startDistM} m, 가까운 지점 ${r.nearest.map(n => n.id.slice(-3) + ' ' + n.distM + 'm').join(', ')}`);
  }
  const primary = result[2].doors.find(d => d.door === 'south');
  const out = {
    note: `추정: 513호를 직사각형으로 보고 도면 방 모서리 4개를 스캔 방(메쉬 단면 최소 면적 사각형) 모서리 4개에 대응시켰다. 긴 변끼리 대응하는 방향은 2가지이며, 방향 2를 기본으로 골랐지만 근거는 약하다: 벽 바깥 띠 밝기 차이가 작고(위 ${wallBright.top.toFixed(0)} / 아래 ${wallBright.bottom.toFixed(0)}), 책상이 없는 앞쪽 빈 바닥과 시작점(000)이 아래 오른쪽 모서리 근처에 있는 점이 방향 2(문이 그 모서리 쪽)와 맞는다. 방향 1이면 남쪽 문은 반대편 모서리(약 12.6 m)가 된다. 오차 수 m 가능. 눈으로 확인 후 rooms[0].waypoint 를 정할 것.`,
    door: { which: '서쪽 벽 남쪽 문', sourcePx: [566, south.y], gapY: south.gap },
    assumedOrientation: 2,
    candidates: primary.nearest.map(n => ({ waypoint: n.id, distM: n.distM, estimated: true })),
    startWaypointDistM: primary.startDistM, alternative: { orientation: 1, south: result[1].doors.find(d => d.door === 'south') },
    scanRoom: { longM: +(lu * mpp).toFixed(2), shortM: +(lv * mpp).toFixed(2), corners: { TL, TR, BR, BL }, wallBrightness: wallBright },
    all: result,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('저장:', OUT);

  // ---- 5) 확인 이미지: 스캔 메쉬 + 방 사각형 + 문 위치(방향 2) + 이동 지점 ----
  fs.mkdirSync(CHECK_DIR, { recursive: true });
  const dotsSvg = (k, color) => { const o = OPT[k]; const dp = bil(o, 0, doorFv(south)); return `<circle cx="${dp[0]}" cy="${dp[1]}" r="9" fill="${color}"/><text x="${dp[0] + 12}" y="${dp[1] + 5}" font-size="22" fill="${color}" font-weight="bold">문(방향${k})</text>`; };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${M.w}" height="${M.h}" font-family="Malgun Gothic, Arial, sans-serif">`;
  svg += `<polygon points="${[TL, TR, BR, BL].map(p => p.join(',')).join(' ')}" fill="none" stroke="#2a6" stroke-width="3" stroke-dasharray="14 8"/>`;
  svg += ['TL', 'TR', 'BR', 'BL'].map((n, i) => { const p = [TL, TR, BR, BL][i]; return `<text x="${p[0] + 6}" y="${p[1] - 6}" font-size="20" fill="#2a6">${n}</text>`; }).join('');
  for (const w of wps) { const near = result[2].doors[0].nearest.some(n => n.id === w.id); svg += `<circle cx="${w.px[0]}" cy="${w.px[1]}" r="${near ? 9 : 5}" fill="${near ? '#e60' : '#06c'}"/><text x="${w.px[0] + 8}" y="${w.px[1] - 6}" font-size="18" fill="${near ? '#e60' : '#06c'}">${w.id.slice(-3)}</text>`; }
  svg += dotsSvg(2, '#d0008f') + dotsSvg(1, '#888');
  svg += `<text x="20" y="34" font-size="24" fill="#111" font-weight="bold">513호 스캔 (위에서 본 메쉬 단면) · 도면 문 위치 추정 (보라=방향2 기본, 회색=방향1) · 주황=문에 가장 가까운 3개 이동 지점</text></svg>`;
  await sharp(path.join(KH, 'f5-splat.webp')).composite([{ input: Buffer.from(svg) }]).png().toFile(path.join(CHECK_DIR, 'f5-door-candidates.png'));
  console.log('확인 이미지:', path.join(CHECK_DIR, 'f5-door-candidates.png'));
})();
