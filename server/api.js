// 익명 신고 게시판 API (Vite 개발 서버에 붙는 미들웨어). 데이터는 data/ 폴더에 파일로 저장.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = path.resolve('data');
const UPLOADS = path.join(DATA, 'uploads');
const DB = path.join(DATA, 'reports.json');
const ADMIN_PIN = process.env.ADMIN_PIN || '0000'; // 관리자 PIN (환경변수 ADMIN_PIN 으로 변경)
const STATUSES = ['미확인', '확인', '진행 중', '완료'];
const KINDS = ['하자', '분실물'];

fs.mkdirSync(UPLOADS, { recursive: true });
const COUNTERS = path.join(DATA, 'counters.json'); // 관리번호 접두사별 마지막 번호 (글을 지워도 번호를 다시 쓰지 않는다)
const prefixOf = r => (r.kind === '하자' ? 'R' : r.lostFound === '습득' ? 'F' : 'L'); // R 하자보수 / F 찾았어요(습득) / L 잃어버렸어요(분실)
const nextCode = (rows, r) => {
  let c = {}; try { c = JSON.parse(fs.readFileSync(COUNTERS, 'utf8')); } catch {}
  const p = prefixOf(r), floor = Math.max(0, ...rows.map(x => (x.code?.[0] === p ? parseInt(x.code.slice(2), 10) || 0 : 0)));
  const n = Math.max(c[p] || 0, floor) + 1; c[p] = n; fs.writeFileSync(COUNTERS, JSON.stringify(c));
  return `${p}-${String(n).padStart(3, '0')}`;
};
const KEEP_DAYS = 30; // 접수 후 30일이 지난 글은 사진과 함께 자동 삭제
const load = () => {
  let rows; try { rows = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; }
  const cutoff = Date.now() - KEEP_DAYS * 86400000, old = rows.filter(r => new Date(r.createdAt).getTime() < cutoff);
  if (old.length) {
    for (const r of old) for (const u of [r.photo, r.shot, r.afterPhoto]) if (u) fs.rmSync(path.join(UPLOADS, path.basename(u)), { force: true });
    rows = rows.filter(r => !old.includes(r)); fs.writeFileSync(DB, JSON.stringify(rows, null, 1));
  }
  const missing = rows.filter(r => !r.code); // 번호가 생기기 전에 접수된 글은 접수 순서대로 번호를 붙인다
  if (missing.length) { missing.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(r => { r.code = nextCode(rows, r); }); fs.writeFileSync(DB, JSON.stringify(rows, null, 1)); }
  return rows;
};
const save = (rows) => fs.writeFileSync(DB, JSON.stringify(rows, null, 1));

const hits = new Map(); // 아주 단순한 도배 방지: IP당 1분에 10건
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr); return arr.length > 10;
}

function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) return null;
  const name = crypto.randomBytes(8).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  return '/uploads/' + name;
}

const readBody = (req) => new Promise((res, rej) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > 12 * 1024 * 1024) { rej(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { res(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { rej(e); } });
});
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
const str = (v, max) => String(v ?? '').slice(0, max);
const cleanPhone = v => { const t = String(v ?? '').replace(/[\s]/g, ''); return /^010-\d{3,4}-\d{4}$/.test(t) ? t : ''; };
const isFound = r => r.kind === '분실물' && r.lostFound === '습득';
const pub = ({ ownerPin, phone, ...r }) => { // 작성자 PIN, 비공개 전화번호, 주운 물건의 사진·위치는 응답에 싣지 않는다 (관리자만)
  const o = r.phonePublic && phone ? { ...r, phone } : r;
  return isFound(o) ? { ...o, photo: null, shot: null, detail: '', locationLabel: '', pin: { found: o.pin?.found || '' } } : o;
};
const okAdmin = req => req.headers['x-admin-pin'] === ADMIN_PIN;
const okOwner = (req, r) => !!r.ownerPin && req.headers['x-owner-pin'] === r.ownerPin;
const fails = new Map(); // PIN 무작위 대입 방지: IP당 10분에 20번
function tooManyFails(ip, hit) {
  const now = Date.now(), arr = (fails.get(ip) || []).filter(t => now - t < 600000);
  if (hit) arr.push(now); fails.set(ip, arr); return arr.length >= 20;
}

export function reportsApi() {
  const handler = async (req, res, next) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/uploads/')) {
        const f = path.join(UPLOADS, path.basename(url.pathname));
        if (!fs.existsSync(f)) return send(res, 404, { error: 'not found' });
        res.setHeader('Content-Type', f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return fs.createReadStream(f).pipe(res);
      }
      if (!url.pathname.startsWith('/api/reports')) return next();
      const rows = load();
      const id = url.pathname.split('/')[3];

      if (req.method === 'GET' && !id) return send(res, 200, rows.slice().reverse().map(pub));
      if (req.method === 'GET' && id && !url.pathname.endsWith('/phone') && !url.pathname.endsWith('/found')) {
        const r = rows.find(x => x.id === id); return r ? send(res, 200, pub(r)) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'POST' && !id) {
        if (limited(req.socket.remoteAddress)) return send(res, 429, { error: '잠시 후 다시 시도해 주세요.' });
        const b = await readBody(req);
        const kind = KINDS.includes(b.kind) ? b.kind : null;
        const detail = str(b.detail, 1000).trim();
        const lostFound = ['분실', '습득'].includes(b.lostFound) ? b.lostFound : null;
        if (!kind) return send(res, 400, { error: '유형이 올바르지 않습니다.' });
        const category = str(b.category, 20).trim() || '기타';
        const itemDesc = kind === '분실물' ? str(b.itemDesc, 200).trim() : '';
        if (kind === '분실물' && !itemDesc) return send(res, 400, { error: '물품 설명을 적어 주세요.' });
        if (category === '기타' && !detail && !itemDesc) return send(res, 400, { error: '기타는 내용을 적어 주세요.' });
        const phone = kind === '분실물' ? cleanPhone(b.phone) : '';
        if (kind === '분실물' && b.phone && !phone) return send(res, 400, { error: '전화번호 형식이 올바르지 않습니다.' });
        if (kind === '분실물' && lostFound === '분실' && !phone) return send(res, 400, { error: '잃어버린 물건은 전화번호를 꼭 적어 주세요.' });
        if (!/^\d{4}$/.test(String(b.ownerPin ?? ''))) return send(res, 400, { error: '수정·삭제용 PIN 4자리를 입력해 주세요.' });
        const w = b.pin || {};
        const row = {
          ownerPin: String(b.ownerPin),
          code: nextCode(rows, { kind, lostFound }),
          id: crypto.randomBytes(6).toString('hex'),
          kind, category, lostFound, detail, itemDesc, phone, phonePublic: !!phone && b.phonePublic === true,
          locationLabel: str(b.locationLabel, 80),
          pin: { scene: str(w.scene, 40), floor: str(w.floor, 8), waypoint: str(w.waypoint, 60), yaw: +w.yaw || 0, pitch: +w.pitch || 0, ...(['all', 'floor'].includes(w.scope) ? { scope: w.scope } : {}), ...(['left', 'office'].includes(w.found) ? { found: w.found } : {}) }, // 위치 범위(scope): 없으면 3D 핀. found: 습득 물건 처리
          photo: saveImage(b.photo), shot: saveImage(b.shot), afterPhoto: null, likes: 0,
          status: '미확인', createdAt: new Date().toISOString(),
        };
        rows.push(row); save(rows); return send(res, 201, pub(row));
      }
      if (req.method === 'GET' && id && url.pathname.endsWith('/phone')) { // 관리자만: 공개·비공개 상관없이 전화번호 확인
        if (!okAdmin(req)) return send(res, 403, { error: 'PIN이 올바르지 않습니다.' });
        const r = rows.find(x => x.id === id);
        return r ? send(res, 200, { phone: r.phone || '', phonePublic: !!r.phonePublic }) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'GET' && id && url.pathname.endsWith('/found')) { // 관리자(또는 작성자 본인)만: 주운 물건의 사진·위치·세부 내용
        const r = rows.find(x => x.id === id);
        if (!r) return send(res, 404, { error: 'not found' });
        if (!okAdmin(req) && !okOwner(req, r)) return send(res, 403, { error: 'PIN이 올바르지 않습니다.' });
        return send(res, 200, { photo: r.photo, shot: r.shot, label: r.locationLabel, pin: r.pin, detail: r.detail || '' });
      }
      if (req.method === 'POST' && id && url.pathname.endsWith('/verify')) {
        const r = rows.find(x => x.id === id);
        if (!r) return send(res, 404, { error: 'not found' });
        if (tooManyFails(req.socket.remoteAddress)) return send(res, 429, { error: 'PIN을 너무 많이 틀렸어요. 잠시 후 다시 시도해 주세요.' });
        if (!okOwner(req, r)) { tooManyFails(req.socket.remoteAddress, true); return send(res, 403, { error: 'PIN이 올바르지 않습니다.' }); }
        return send(res, 200, {});
      }
      if (req.method === 'POST' && id && url.pathname.endsWith('/like')) {
        const b = await readBody(req); const r = rows.find(x => x.id === id);
        if (!r) return send(res, 404, { error: 'not found' });
        r.likes = Math.max(0, (r.likes || 0) + (b.delta === -1 ? -1 : 1)); save(rows); return send(res, 200, { likes: r.likes });
      }
      if (req.method === 'PATCH' && id) {
        const b = await readBody(req); const r = rows.find(x => x.id === id);
        if (!r) return send(res, 404, { error: 'not found' });
        const admin = okAdmin(req), owner = !admin && okOwner(req, r);
        if (!admin && !owner) { tooManyFails(req.socket.remoteAddress, true); return send(res, 403, { error: 'PIN이 올바르지 않습니다.' }); }
        if (owner) { // 작성자는 항목·세부 내용·사진만 고칠 수 있다 (처리 상태·처리 후 사진은 관리자만)
          const category = str(b.category, 20).trim() || '기타', detail = str(b.detail, 1000).trim();
          if (category === '기타' && !detail && !r.itemDesc) return send(res, 400, { error: '기타는 내용을 적어 주세요.' });
          r.category = category; r.detail = detail;
          if (r.kind === '분실물') r.lostFound = ['분실', '습득'].includes(b.lostFound) ? b.lostFound : r.lostFound;
          if (b.photo) {
            const u = saveImage(b.photo);
            if (!u) return send(res, 400, { error: '사진을 저장할 수 없습니다.' });
            if (r.photo) fs.rmSync(path.join(UPLOADS, path.basename(r.photo)), { force: true });
            r.photo = u;
          }
          save(rows); return send(res, 200, pub(r));
        }
        if (b.afterPhoto) {
          const u = saveImage(b.afterPhoto);
          if (!u) return send(res, 400, { error: '사진을 저장할 수 없습니다.' });
          if (r.afterPhoto) fs.rmSync(path.join(UPLOADS, path.basename(r.afterPhoto)), { force: true });
          r.afterPhoto = u;
        }
        if (b.status !== undefined) {
          if (!STATUSES.includes(b.status)) return send(res, 400, { error: '상태가 올바르지 않습니다.' });
          r.status = b.status;
        }
        save(rows); return send(res, 200, pub(r));
      }
      if (req.method === 'DELETE' && id) {
        const r = rows.find(x => x.id === id);
        if (!r) return send(res, 404, { error: 'not found' });
        if (!okAdmin(req) && !okOwner(req, r)) { tooManyFails(req.socket.remoteAddress, true); return send(res, 403, { error: 'PIN이 올바르지 않습니다.' }); }
        for (const u of [r.photo, r.shot, r.afterPhoto]) if (u) fs.rmSync(path.join(UPLOADS, path.basename(u)), { force: true });
        save(rows.filter(x => x.id !== id)); return send(res, 200, {});
      }
      return send(res, 405, { error: 'method not allowed' });
    } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
  };
  return {
    name: 'reports-api',
    configureServer(s) { s.middlewares.use(handler); },
    configurePreviewServer(s) { s.middlewares.use(handler); },
  };
}
