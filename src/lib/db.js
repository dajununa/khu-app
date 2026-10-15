import { SAMPLE } from '../data/sample.js';
// 강의실·시간표·편의시설·대여 데이터와 관리자 로그인.
// VITE_SUPABASE_URL 이 있으면 Supabase, 없으면 로컬 개발 서버(server/db.js)를 쓴다. (신고는 api.js 가 따로 담당)
const SB = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const REMOTE = !!(SB && KEY);
const SKEY = 'khu_admin';
const sampled = new Set(); // 예시 데이터로 대신 보여 준 테이블
export const isSample = () => sampled.size > 0;

async function j(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_description || data.msg || data.error || data.message || '';
    if (res.status === 401 || res.status === 403 || /JWT|permission|row-level/i.test(msg)) throw new Error('권한이 없어요. 다시 로그인해 주세요.');
    throw new Error(msg || '요청에 실패했습니다.');
  }
  return data;
}

// ── 관리자 세션 ─────────────────────────────────────────
export const session = {
  get() { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch { return null; } },
  set(v) { try { v ? sessionStorage.setItem(SKEY, JSON.stringify(v)) : sessionStorage.removeItem(SKEY); } catch {} },
};

async function token() {
  const s = session.get();
  if (!s) return null;
  if (!REMOTE || !s.refresh_token || Date.now() < s.expires_at - 60_000) return s.access_token;
  // 만료가 가까우면 갱신
  try {
    const r = await fetch(`${SB}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) }).then(j);
    session.set({ ...s, access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + r.expires_in * 1000 });
    return r.access_token;
  } catch { session.set(null); return null; }
}

export async function login(email, password) {
  if (!REMOTE) {
    const r = await fetch('/api/db/_login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(j);
    session.set({ access_token: r.access_token, email: r.email, expires_at: Date.now() + r.expires_in * 1000 });
    return;
  }
  const res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
  session.set({ access_token: r.access_token, refresh_token: r.refresh_token, email: r.user?.email || email, expires_at: Date.now() + r.expires_in * 1000 });
  // 로그인은 됐어도 관리자 목록(admins)에 없으면 들어갈 수 없다
  const ok = await fetch(`${SB}/rest/v1/rpc/is_admin`, { method: 'POST', headers: await headers(true, { 'Content-Type': 'application/json' }), body: '{}' }).then(j).catch(() => false);
  if (ok !== true) { session.set(null); throw new Error('관리자로 등록되지 않은 계정이에요.'); }
}
export function logout() { session.set(null); }

async function headers(auth, extra = {}) {
  const t = auth ? await token() : null;
  if (!REMOTE) return { ...(t ? { Authorization: 'Bearer ' + t } : {}), ...extra };
  const anon = KEY.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + KEY }; // 새 publishable 키(sb_...)는 JWT가 아니다
  return { apikey: KEY, ...anon, ...(t ? { Authorization: 'Bearer ' + t } : {}), ...extra };
}

// ── 테이블 읽기/쓰기 ────────────────────────────────────
// 데이터가 많지 않아서(건물 한 동) 테이블을 통째로 읽고 화면에서 거른다.
const base = t => (REMOTE ? `${SB}/rest/v1/${t}` : `/api/db/${t}`);
const ORDER = { rooms: 'floor,code', schedules: 'weekday,start_time', schedule_exceptions: 'date,start_time', amenities: 'floor,category', rentals: 'created_at.desc', rental_slots: 'date' };

export const db = {
  async list(t, { auth = false } = {}) {
    const q = REMOTE ? `?select=*${ORDER[t] ? '&order=' + ORDER[t] : ''}&limit=5000` : '';
    try {
      const rows = await fetch(base(t) + q, { headers: await headers(auth) }).then(j);
      if (SAMPLE[t]) sampled.delete(t);
      return rows;
    } catch (e) {
      // 테이블이 아직 없으면(features.sql 실행 전) 학생 화면은 예시 데이터로 보여 준다. 관리자 화면(auth)은 그대로 오류.
      if (!auth && SAMPLE[t]) { sampled.add(t); return SAMPLE[t]; }
      throw e;
    }
  },
  async insert(t, rows, { auth = true } = {}) {
    // 학생 대여 신청은 결과를 읽을 권한이 없으므로 return=minimal
    const prefer = auth ? 'return=representation' : 'return=minimal';
    const res = await fetch(base(t), { method: 'POST', headers: await headers(auth, { 'Content-Type': 'application/json', Prefer: prefer }), body: JSON.stringify(rows) });
    if (REMOTE && !auth) { if (!res.ok) await j(res); return []; }
    return j(res);
  },
  async update(t, id, patch) {
    const url = REMOTE ? `${base(t)}?id=eq.${encodeURIComponent(id)}` : `${base(t)}/${encodeURIComponent(id)}`;
    const rows = await fetch(url, { method: 'PATCH', headers: await headers(true, { 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(patch) }).then(j);
    if (REMOTE && !rows.length) throw new Error('권한이 없어요. 다시 로그인해 주세요.');
    return rows[0];
  },
  async remove(t, id) {
    const url = REMOTE ? `${base(t)}?id=eq.${encodeURIComponent(id)}` : `${base(t)}/${encodeURIComponent(id)}`;
    await fetch(url, { method: 'DELETE', headers: await headers(true, { Prefer: 'return=minimal' }) }).then(async r => { if (!r.ok) await j(r); });
  },
  // 여러 강의실의 행을 한 번에 지우기 (시간표 CSV 로 바꿀 때)
  async removeByRooms(t, roomIds) {
    if (!roomIds.length) return;
    if (REMOTE) {
      for (let i = 0; i < roomIds.length; i += 50) {
        const ids = roomIds.slice(i, i + 50).join(',');
        await fetch(`${base(t)}?room_id=in.(${ids})`, { method: 'DELETE', headers: await headers(true, { Prefer: 'return=minimal' }) }).then(async r => { if (!r.ok) await j(r); });
      }
      return;
    }
    const rows = (await db.list(t, { auth: true })).filter(r => roomIds.includes(r.room_id));
    for (const r of rows) await db.remove(t, r.id);
  },
};

// 신고 처리 상태 변경 (관리자 로그인 사용). 로컬 서버는 PIN 헤더 방식이라 토큰에서 PIN 을 꺼낸다.
export async function setReportStatus(id, status) {
  if (REMOTE) return db.update('reports', id, { status });
  const t = await token();
  const r = await fetch('/api/reports/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-admin-pin': (t || '').replace(/^local-/, '') }, body: JSON.stringify({ status }) }).then(j);
  return r;
}
