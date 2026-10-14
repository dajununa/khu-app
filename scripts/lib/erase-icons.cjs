// 도면의 아이콘(채도가 있는 픽셀)을 지우고 복도 회색/방 흰색으로 메우는 공용 함수. make_portrait_plan.cjs 의 eraseIcons 와 같은 방식 (그 스크립트는 수정하지 않음).
// N = { w, h, d(RGB 바이트) }, box = 지울 범위 { x, y, w, h }, EXTRA_ERASE = 색이 없어 따로 지울 사각형 [[x0,y0,x1,y1], ...]
// 반환: { d(RGB 바이트), stats }
// 아이콘 마스크: 도면은 흑백이라 채도가 있는 픽셀 = 아이콘. 확장 + 구멍 메움, 벽선(어두운 무채색)은 보호. 마스크 안은 가장 가까운 비마스크 픽셀 색으로 채움
function eraseIcons(N, box, EXTRA_ERASE = []) {
  const { w, h, d } = N, M = new Uint8Array(w * h);
  const sat = i => { const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
  const inBox = (x, y) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (sat((y * w + x) * 3) > 0.18) M[y * w + x] = 1;
  const dilate = (src, r) => {
    const out = new Uint8Array(src);
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (src[y * w + x])
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) { const X = x + dx, Y = y + dy; if (inBox(X, Y)) out[Y * w + X] = 1; }
    return out;
  };
  let D = dilate(M, 4);
  for (const [x0, y0, x1, y1] of EXTRA_ERASE) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) D[y * w + x] = 1;
  // 구멍 메움: 도면 영역 가장자리에서 flood fill 해 닿지 않는 비마스크 = 구멍
  const seen = new Uint8Array(w * h), st = [];
  const push = (x, y) => { if (inBox(x, y) && !D[y * w + x] && !seen[y * w + x]) { seen[y * w + x] = 1; st.push(x, y); } };
  for (let x = box.x; x < box.x + box.w; x++) { push(x, box.y); push(x, box.y + box.h - 1); }
  for (let y = box.y; y < box.y + box.h; y++) { push(box.x, y); push(box.x + box.w - 1, y); }
  while (st.length) { const y = st.pop(), x = st.pop(); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  let holes = 0;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (!D[y * w + x] && !seen[y * w + x]) { D[y * w + x] = 1; holes++; }
  // 벽선 보호: 마스크 확장 때문에 덮인 어두운 무채색(원래 채도 낮은 벽) 은 그대로 둔다
  let erased = 0;
  for (let i = 0; i < w * h; i++) if (D[i] && !M[i]) { const p = i * 3; if (d[p] < 110 && sat(p) <= 0.18 && !EXTRA_ERASE.some(([a, b, c, e]) => i % w >= a && i % w <= c && ((i / w) | 0) >= b && ((i / w) | 0) <= e)) D[i] = 0; }
  // 가장 가까운 비마스크 픽셀 색으로 채움 (BFS)
  const out = Buffer.from(d), q = [];
  const isBg = p => (Math.abs(d[p] - 203) <= 6 && Math.abs(d[p] - d[p + 1]) < 5 && Math.abs(d[p] - d[p + 2]) < 5) || (d[p] >= 248 && d[p + 1] >= 248 && d[p + 2] >= 248);
  for (let i = 0; i < w * h; i++) if (D[i]) erased++;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const i = y * w + x; if (D[i] || !isBg(i * 3)) continue; // 채움 색은 복도 회색/방 흰색에서만 가져온다 (벽선·문 호 색이 번지지 않게)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (inBox(X, Y) && D[Y * w + X]) { q.push(i); break; } }
  }
  const owner = new Int32Array(w * h).fill(-1); for (const i of q) owner[i] = i;
  for (let head = 0; head < q.length; head++) {
    const i = q[head], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy, j = Y * w + X; if (!inBox(X, Y) || !D[j] || owner[j] !== -1) continue;
      owner[j] = owner[i]; q.push(j);
    }
  }
  for (let i = 0; i < w * h; i++) if (D[i] && owner[i] >= 0) { const p = owner[i] * 3; out[i * 3] = d[p]; out[i * 3 + 1] = d[p + 1]; out[i * 3 + 2] = d[p + 2]; }
  return { d: out, stats: { maskedPx: erased, holesFilled: holes } };
}

module.exports = { eraseIcons };
