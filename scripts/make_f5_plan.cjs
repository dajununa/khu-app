// 5층 피난안내도(plans-source/f5-evac.png) -> public/plans/f5-evac.{webp,json}  (3D 좌표와 정렬하지 않는 '영역 연결' 도면)
// 사용법: npm i --no-save sharp && node scripts/make_f5_plan.cjs [바탕화면 확인 폴더, 기본 ~/Desktop/f5-check]
// 1) 평면도 부분만 잘라(회전/반전/투명 처리 없음) 아이콘(현위치/소화기/비상벨/비상구/화살표/완강기)을 지우고 webp 로 저장
// 2) "513" 라벨이 있는 방을 벽선으로 둘러싸인 흰 영역으로 찾아 다각형/사각형을 JSON 에 저장하고, 확인용 이미지를 만든다
// 3) plans-source/f5-door-candidates.json 이 있으면(scripts/f5_door_candidates.cjs 결과) 연결 후보를 JSON 의 candidates 에 넣는다
const sharp = require('sharp');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { eraseIcons } = require('./lib/erase-icons.cjs');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'plans-source/f5-evac.png');
const CAND = path.join(ROOT, 'plans-source/f5-door-candidates.json');
const OUT_IMG = path.join(ROOT, 'public/plans/f5-evac.webp');
const OUT_JSON = path.join(ROOT, 'public/plans/f5-evac.json');
const CHECK_DIR = process.argv[2] || path.join(os.homedir(), 'Desktop/f5-check');

const CROP = { x: 405, y: 120, w: 800 - 405, h: 1034 - 120 };   // 제목 띠/안내문/범례/하단 배너 제외 (4층 도면과 같은 범위)
const EXTRA_ERASE = [[405, 1013, 411, 1034]];                  // 하단 연락처 배너의 오른쪽 끝(남색)이 크롭 왼쪽 아래에 걸림
const LONG_SIDE_MAX = 2048;
const ROOM = { id: '513', name: '513호', scene: 'classroom513', waypoint: 'classroom513-5F-000', label: '513', seed: [630, 300] }; // seed: 513 방 안쪽의 흰 바닥 한 점 (원본 px)

const isWhite = (d, i) => d[i] >= 240 && d[i + 1] >= 240 && d[i + 2] >= 240;
const isDark = (d, i) => d[i] < 150 && Math.abs(d[i] - d[i + 1]) < 20 && Math.abs(d[i + 1] - d[i + 2]) < 20;

function floodWhite(d, w, h, seed, box) { // 흰 픽셀만 따라 채움 (벽선=어두움, 복도=회색에서 멈춤)
  const m = new Uint8Array(w * h), st = [seed[0], seed[1]];
  while (st.length) {
    const y = st.pop(), x = st.pop(); if (x < box.x || x >= box.x + box.w || y < box.y || y >= box.y + box.h) continue;
    const k = y * w + x; if (m[k] || !isWhite(d, k * 3)) continue; m[k] = 1; st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return m;
}
function fillHoles(m, w, h, bb) { // 글자 획처럼 영역 안에 갇힌 비영역 픽셀 메우기 (bbox 가장자리에서 닿는 곳이 바깥)
  const out = new Uint8Array(m), seen = new Uint8Array(w * h), st = [];
  const push = (x, y) => { if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) return; const k = y * w + x; if (m[k] || seen[k]) return; seen[k] = 1; st.push(x, y); };
  for (let x = bb[0]; x <= bb[2]; x++) { push(x, bb[1]); push(x, bb[3]); } for (let y = bb[1]; y <= bb[3]; y++) { push(bb[0], y); push(bb[2], y); }
  while (st.length) { const y = st.pop(), x = st.pop(); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  for (let y = bb[1]; y <= bb[3]; y++) for (let x = bb[0]; x <= bb[2]; x++) if (!m[y * w + x] && !seen[y * w + x]) out[y * w + x] = 1;
  return out;
}
function simplify(pts, tol) { // Douglas-Peucker (열린 선)
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let mi = 0, md = -1; for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L; if (d > md) { md = d; mi = i; } }
  if (md <= tol) return [a, b];
  return [...simplify(pts.slice(0, mi + 1), tol).slice(0, -1), ...simplify(pts.slice(mi), tol)];
}

(async () => {
  const { data, info } = await sharp(SRC).flatten({ background: '#fff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const N = { w: info.width, h: info.height, d: data };
  const er = eraseIcons(N, CROP, EXTRA_ERASE);
  const d = er.d, W = N.w, H = N.h;

  // ---- 513 영역 (원본 px) ----
  const m0 = floodWhite(d, W, H, ROOM.seed, CROP);
  let x0 = W, y0 = H, x1 = 0, y1 = 0, area0 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m0[y * W + x]) { area0++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const m = fillHoles(m0, W, H, [x0, y0, x1, y1]);
  // 라벨: 영역 안에 갇혀 있던(=메워진) 어두운 픽셀 덩어리들의 경계 상자
  let lx0 = W, ly0 = H, lx1 = 0, ly1 = 0, lpx = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = y * W + x; if (m[k] && !m0[k] && isDark(d, k * 3) && x > x0 + 6 && x < x1 - 6 && y > y0 + 6 && y < y1 - 6) { lpx++; if (x < lx0) lx0 = x; if (x > lx1) lx1 = x; if (y < ly0) ly0 = y; if (y > ly1) ly1 = y; } }
  // 행별 왼/오른쪽 끝 -> 다각형 (벽선 쪽으로 1px 확장)
  const left = [], right = [];
  for (let y = y0; y <= y1; y++) { let a = -1, b = -1; for (let x = x0; x <= x1; x++) if (m[y * W + x]) { if (a < 0) a = x; b = x; } if (a >= 0) { left.push([a - 1, y]); right.push([b + 2, y]); } }
  let poly = [...simplify(left, 1.5), ...simplify(right.reverse(), 1.5)];
  const bbox = [x0 - 1, y0, x1 + 2, y1 + 1];
  const area = (() => { let s = 0; for (let i = 0; i < poly.length; i++) { const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length]; s += ax * by - bx * ay; } return Math.abs(s) / 2; })();
  const label = lpx ? [lx0, ly0, lx1 + 1, ly1 + 1] : null;
  const inPoly = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const labelInside = label ? [[label[0], label[1]], [label[2], label[1]], [label[2], label[3]], [label[0], label[3]]].every(([x, y]) => inPoly(x, y)) : false;
  console.log(`513 영역(원본 px): bbox ${bbox.join(',')} (${bbox[2] - bbox[0]}×${bbox[3] - bbox[1]}), 다각형 ${poly.length}점, 면적 ${area.toFixed(0)}px², 라벨 ${label ? label.join(',') : '없음'} 영역 안: ${labelInside}`);

  // ---- 잘라서 저장 ----
  let img = sharp(d, { raw: { width: W, height: H, channels: 3 } }).extract({ left: CROP.x, top: CROP.y, width: CROP.w, height: CROP.h });
  const r = Math.min(1, LONG_SIDE_MAX / Math.max(CROP.w, CROP.h)), outW = Math.round(CROP.w * r), outH = Math.round(CROP.h * r);
  if (r < 1) img = img.resize(outW, outH);
  const wi = await img.webp({ lossless: true }).toFile(OUT_IMG);
  const toImg = ([x, y]) => [+((x - CROP.x) * r).toFixed(1), +((y - CROP.y) * r).toFixed(1)]; // 원본 px -> 저장 이미지 px
  const imgPoly = poly.map(toImg), imgBbox = [bbox[0], bbox[1], bbox[2], bbox[3]].map((v, i) => +((v - (i % 2 ? CROP.y : CROP.x)) * r).toFixed(1));
  const cand = fs.existsSync(CAND) ? JSON.parse(fs.readFileSync(CAND, 'utf8')) : null;
  const room = {
    id: ROOM.id, name: ROOM.name, polygon: imgPoly, bbox: imgBbox,
    labelBbox: label ? [label[0], label[1], label[2], label[3]].map((v, i) => +((v - (i % 2 ? CROP.y : CROP.x)) * r).toFixed(1)) : null,
    scene: ROOM.scene, waypoint: ROOM.waypoint,                       // 연결할 3D 투어. waypoint 는 여기 한 곳에서 바꾼다
    candidates: cand ? cand.candidates : [],                           // 도면 문에 가까운 이동 지점 후보 (눈으로 확인 후 waypoint 를 정할 때 참고)
    door: cand ? cand.door : undefined,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify({
    id: 'f5', name: '5층', generated: new Date().toISOString(),
    note: '3D 스캔 좌표와 정렬하지 않은 도면. rooms[].polygon 은 이 이미지 px 기준 영역으로, 누르면 scene/waypoint 의 3D 투어로 들어간다.',
    source: { file: 'plans-source/f5-evac.png', size: [W, H], crop: [CROP.x, CROP.y, CROP.w, CROP.h], eraseExtra: EXTRA_ERASE, eraseStats: er.stats },
    image: { file: 'f5-evac.webp', size: [wi.width, wi.height], bytes: wi.size, alpha: false, pxPerSourcePx: r },
    rooms: [room],
    candidatesNote: cand ? cand.note : undefined,
  }, null, 1));
  console.log('저장:', OUT_IMG, `${wi.width}x${wi.height}`, wi.size, 'bytes; 지운 화소', er.stats);

  // ---- 확인용 이미지 (원본 px 로 그린 전체 도면 + 513 영역 + 라벨) ----
  fs.mkdirSync(CHECK_DIR, { recursive: true });
  const pts = poly.map(p => p.join(',')).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Malgun Gothic, Arial, sans-serif">
    <polygon points="${pts}" fill="#2f7cf6" fill-opacity="0.28" stroke="#1a56c4" stroke-width="2"/>
    ${label ? `<rect x="${label[0] - 3}" y="${label[1] - 3}" width="${label[2] - label[0] + 6}" height="${label[3] - label[1] + 6}" fill="none" stroke="${labelInside ? '#0a9a3c' : '#e00'}" stroke-width="2.5"/>` : ''}
    <text x="${bbox[0] + 4}" y="${bbox[1] - 8}" font-size="15" fill="#1a56c4" font-weight="bold">513호 영역 (파랑) · 라벨 '513' ${labelInside ? '영역 안 ✔ (초록 상자)' : '영역 밖 ✘ (빨강 상자)'}</text>
    ${cand && cand.door ? `<circle cx="${cand.door.sourcePx[0]}" cy="${cand.door.sourcePx[1]}" r="6" fill="#e00"/><text x="${cand.door.sourcePx[0] - 70}" y="${cand.door.sourcePx[1] + 22}" font-size="14" fill="#e00" font-weight="bold">도면 문(서쪽 벽 남쪽)</text>` : ''}</svg>`;
  const base = await sharp(d, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  await sharp(base).png().toFile(path.join(CHECK_DIR, 'f5-513-region.png'));
  const zx = Math.max(0, bbox[0] - 40), zy = Math.max(0, bbox[1] - 40), zw = Math.min(W - zx, bbox[2] - bbox[0] + 80), zh = Math.min(H - zy, bbox[3] - bbox[1] + 80);
  await sharp(base).extract({ left: zx, top: zy, width: zw, height: zh }).resize({ width: zw * 3 }).png().toFile(path.join(CHECK_DIR, 'f5-513-region-zoom.png'));
  console.log('확인 이미지:', path.join(CHECK_DIR, 'f5-513-region.png'), ', f5-513-region-zoom.png');
})();
