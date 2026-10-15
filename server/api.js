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
const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; } };
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

      if (req.method === 'GET' && !id) return send(res, 200, rows.slice().reverse());
      if (req.method === 'GET' && id) {
        const r = rows.find(x => x.id === id); return r ? send(res, 200, r) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'POST' && !id) {
        if (limited(req.socket.remoteAddress)) return send(res, 429, { error: '잠시 후 다시 시도해 주세요.' });
        const b = await readBody(req);
        const kind = KINDS.includes(b.kind) ? b.kind : null;
        const detail = str(b.detail, 1000).trim();
        if (!kind) return send(res, 400, { error: '유형이 올바르지 않습니다.' });
        if (!detail) return send(res, 400, { error: '세부 내용을 입력해 주세요.' });
        const w = b.pin || {};
        const row = {
          id: crypto.randomBytes(6).toString('hex'),
          kind, detail,
          locationLabel: str(b.locationLabel, 80),
          pin: { scene: str(w.scene, 40), floor: str(w.floor, 8), waypoint: str(w.waypoint, 60), yaw: +w.yaw || 0, pitch: +w.pitch || 0 },
          photo: saveImage(b.photo), shot: saveImage(b.shot),
          status: '미확인', createdAt: new Date().toISOString(),
        };
        rows.push(row); save(rows); return send(res, 201, row);
      }
      if (req.method === 'PATCH' && id) {
        if (req.headers['x-admin-pin'] !== ADMIN_PIN) return send(res, 403, { error: 'PIN이 올바르지 않습니다.' });
        const b = await readBody(req); const r = rows.find(x => x.id === id);
        if (!r) return send(res, 404, { error: 'not found' });
        if (!STATUSES.includes(b.status)) return send(res, 400, { error: '상태가 올바르지 않습니다.' });
        r.status = b.status; save(rows); return send(res, 200, r);
      }
      if (req.method === 'DELETE' && id) {
        if (req.headers['x-admin-pin'] !== ADMIN_PIN) return send(res, 403, { error: 'PIN이 올바르지 않습니다.' });
        const r = rows.find(x => x.id === id);
        if (!r) return send(res, 404, { error: 'not found' });
        for (const u of [r.photo, r.shot]) if (u) fs.rmSync(path.join(UPLOADS, path.basename(u)), { force: true });
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
