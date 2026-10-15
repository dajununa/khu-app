// 로컬 개발용 간단 DB (Supabase 없이 npm run dev 할 때). data/<테이블>.json 에 저장.
// 배포에서는 Supabase(supabase/features.sql)를 쓰고 이 파일은 쓰이지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = path.resolve('data');
const ADMIN_PIN = process.env.ADMIN_PIN || '0000'; // 로컬 관리자 비밀번호 (이메일은 아무거나)
const TABLES = ['rooms', 'schedules', 'schedule_exceptions', 'rentals', 'amenities'];
const PUBLIC_WRITE = { rentals: r => ({ ...r, status: '대기', admin_note: '' }) }; // 학생도 쓸 수 있는 테이블(신청만)
const ADMIN_READ_ONLY = ['rentals']; // 이름·연락처가 있어서 관리자만 읽기

fs.mkdirSync(DATA, { recursive: true });
const file = t => path.join(DATA, t + '.json');
const load = t => { try { return JSON.parse(fs.readFileSync(file(t), 'utf8')); } catch { return []; } };
const save = (t, rows) => fs.writeFileSync(file(t), JSON.stringify(rows, null, 1));
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, bad) => {
  const chunks = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > 2 * 1024 * 1024) { bad(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { bad(e); } });
});
const isAdmin = req => req.headers.authorization === 'Bearer local-' + ADMIN_PIN;

// 저장 전에 필드 정리: id, created_at 은 서버가 정한다
function clean(t, r) {
  const out = { ...r };
  delete out.id; delete out.created_at;
  return out;
}

export async function dbHandler(req, res, next) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/db/')) return next();
  try {
    const [, , , table, id] = url.pathname.split('/');
    if (table === '_login' && req.method === 'POST') {
      const b = await readBody(req);
      if (b.password !== ADMIN_PIN) return send(res, 401, { error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
      return send(res, 200, { access_token: 'local-' + ADMIN_PIN, email: b.email || 'admin@local', expires_in: 86400 });
    }
    if (table === 'rental_slots' && req.method === 'GET') {
      return send(res, 200, load('rentals').filter(r => r.status === '승인').map(({ room_id, date, start_time, end_time }) => ({ room_id, date, start_time, end_time })));
    }
    if (!TABLES.includes(table)) return send(res, 404, { error: 'not found' });
    const admin = isAdmin(req);
    const rows = load(table);

    if (req.method === 'GET') {
      if (ADMIN_READ_ONLY.includes(table) && !admin) return send(res, 403, { error: '권한이 없습니다.' });
      return send(res, 200, rows);
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      const list = Array.isArray(b) ? b : [b];
      if (!admin && !PUBLIC_WRITE[table]) return send(res, 403, { error: '관리자 로그인이 필요합니다.' });
      if (!admin && list.length > 1) return send(res, 400, { error: '한 번에 하나씩 신청해 주세요.' });
      const made = list.map(r => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...(admin ? clean(table, r) : PUBLIC_WRITE[table](clean(table, r))) }));
      rows.push(...made); save(table, rows);
      return send(res, 201, made);
    }
    if (!admin) return send(res, 403, { error: '관리자 로그인이 필요합니다.' });
    const i = rows.findIndex(r => r.id === id);
    if (i < 0) return send(res, 404, { error: 'not found' });
    if (req.method === 'PATCH') {
      rows[i] = { ...rows[i], ...clean(table, await readBody(req)) }; save(table, rows);
      return send(res, 200, [rows[i]]);
    }
    if (req.method === 'DELETE') {
      const [gone] = rows.splice(i, 1);
      // 강의실을 지우면 그 강의실의 시간표·예외·대여도 같이 지운다 (Supabase 의 on delete cascade 와 같게)
      if (table === 'rooms') for (const t of ['schedules', 'schedule_exceptions', 'rentals']) save(t, load(t).filter(r => r.room_id !== gone.id));
      save(table, rows);
      return send(res, 200, [gone]);
    }
    return send(res, 405, { error: 'method not allowed' });
  } catch (e) { return send(res, 400, { error: String(e.message || e) }); }
}
