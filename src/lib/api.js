// VITE_SUPABASE_URL 이 있으면 Supabase(배포용), 없으면 로컬 서버(server/api.js)를 쓴다.
const SB = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function j(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || '요청에 실패했습니다.');
  return data;
}

// ---- 로컬 서버 ----
const local = {
  list: () => fetch('/api/reports').then(j),
  create: (body) => fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),
  setStatus: (id, status, pin) => fetch('/api/reports/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin }, body: JSON.stringify({ status }) }).then(j),
  remove: (id, pin, owner) => fetch('/api/reports/' + id, { method: 'DELETE', headers: { [owner ? 'x-owner-pin' : 'x-admin-pin']: pin } }).then(j),
  getPhone: (id, pin) => fetch(`/api/reports/${id}/phone`, { headers: { 'x-admin-pin': pin } }).then(j),
  getFound: (id, pin, owner) => fetch(`/api/reports/${id}/found`, { headers: { [owner ? 'x-owner-pin' : 'x-admin-pin']: pin } }).then(j),
  verifyOwner: (id, pin) => fetch(`/api/reports/${id}/verify`, { method: 'POST', headers: { 'x-owner-pin': pin } }).then(j),
  update: (id, pin, fields) => fetch('/api/reports/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-owner-pin': pin }, body: JSON.stringify(fields) }).then(j),
  setAfterPhoto: (id, afterPhoto, pin) => fetch('/api/reports/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin }, body: JSON.stringify({ afterPhoto }) }).then(j),
  like: (id, delta) => fetch(`/api/reports/${id}/like`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta }) }).then(j),
};

// ---- Supabase ----
// 새 publishable 키(sb_...)는 JWT가 아니므로 apikey 헤더만 보낸다
const H = (extra = {}) => ({ apikey: KEY, ...(KEY.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + KEY }), ...extra });
const fromRow = r => ({ id: r.id, code: r.code, kind: r.kind, category: r.category, lostFound: r.lost_found, detail: r.detail, itemDesc: r.item_desc || '', phone: r.phone_public || '', phonePublic: !!r.phone_public, locationLabel: r.location_label, pin: r.pin, photo: r.photo, shot: r.shot, afterPhoto: r.after_photo, likes: r.likes || 0, status: r.status, createdAt: r.created_at });
async function upload(dataUrl) {
  if (!dataUrl) return null;
  const blob = await (await fetch(dataUrl)).blob();
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const r = await fetch(`${SB}/storage/v1/object/reports/${name}`, { method: 'POST', headers: H({ 'Content-Type': 'image/jpeg' }), body: blob });
  await j(r);
  return `${SB}/storage/v1/object/public/reports/${name}`;
}
const remote = {
  list: () => fetch(`${SB}/rest/v1/reports?select=*&created_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}&order=created_at.desc&limit=300`, { headers: H() }).then(j).then(rows => rows.map(fromRow)),
  async create(b) {
    const [photo, shot] = await Promise.all([upload(b.photo), upload(b.shot)]);
    const hidden = b.kind === '분실물' && b.lostFound === '습득'; // 주운 물건의 사진·위치·세부 내용은 누구나 읽는 표에 두지 않고 관리자만 본다
    const body = { kind: b.kind, category: (b.category || '기타').slice(0, 20), lost_found: b.lostFound || null, detail: hidden ? '' : (b.detail || '').slice(0, 1000), item_desc: (b.itemDesc || '').slice(0, 200) || null, phone_public: b.phone && b.phonePublic ? String(b.phone).slice(0, 20) : null, location_label: hidden ? '' : (b.locationLabel || '').slice(0, 80), pin: hidden ? { found: b.pin?.found || '' } : b.pin || {}, photo: hidden ? null : photo, shot: hidden ? null : shot };
    const rows = await fetch(`${SB}/rest/v1/reports`, { method: 'POST', headers: H({ 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(body) }).then(j);
    const row = fromRow(rows[0]);
    if (hidden) {
      const fr = await fetch(`${SB}/rest/v1/rpc/set_private_found`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: row.id, photo_in: photo, shot_in: shot, label_in: (b.locationLabel || '').slice(0, 80), pin_in: b.pin || {}, detail_in: (b.detail || '').slice(0, 1000) }) });
      if (!fr.ok) throw new Error('위치와 사진을 저장하지 못했어요. 접수는 되었지만 관리자가 확인할 수 없어요.');
    }
    if (b.phone && !b.phonePublic) { // 비공개 번호는 누구나 읽는 표가 아니라 따로 저장 (관리자만 확인)
      const pr = await fetch(`${SB}/rest/v1/rpc/set_private_phone`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: row.id, phone_in: String(b.phone).slice(0, 20) }) });
      if (!pr.ok) throw new Error('전화번호를 저장하지 못했어요. 접수는 되었어요.');
    }
    const r = await fetch(`${SB}/rest/v1/rpc/set_owner_pin`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: row.id, pin_in: b.ownerPin }) });
    if (!r.ok) throw new Error('수정용 PIN을 저장하지 못했어요. 접수는 되었지만 나중에 수정할 수 없어요.');
    return row;
  },
  async setStatus(id, status, pin) {
    await fetch(`${SB}/rest/v1/rpc/set_status`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: id, new_status: status, pin_in: pin }) }).then(async r => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(/PIN/.test(e.message || '') ? 'PIN이 올바르지 않습니다.' : '변경에 실패했습니다.'); } });
    return { status };
  },
  async setAfterPhoto(id, dataUrl, pin) {
    const url = await upload(dataUrl);
    const r = await fetch(`${SB}/rest/v1/rpc/set_after_photo`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: id, url, pin_in: pin }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(/PIN/.test(e.message || '') ? 'PIN이 올바르지 않습니다.' : '저장에 실패했습니다.'); }
    return { afterPhoto: url };
  },
  async like(id, delta) {
    const r = await fetch(`${SB}/rest/v1/rpc/like_report`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: id, delta }) });
    return { likes: await j(r) };
  },
  async getPhone(id, pin) {
    const r = await fetch(`${SB}/rest/v1/rpc/admin_get_phone`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: id, pin_in: pin }) });
    if (!r.ok) throw new Error('PIN이 올바르지 않습니다.');
    return { phone: (await r.json()) || '' };
  },
  async getFound(id, pin, owner) {
    const r = await fetch(`${SB}/rest/v1/rpc/${owner ? 'owner_get_found' : 'admin_get_found'}`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: id, pin_in: pin }) });
    if (!r.ok) throw new Error('PIN이 올바르지 않습니다.');
    return (await r.json()) || {};
  },
  async verifyOwner(id, pin) {
    const r = await fetch(`${SB}/rest/v1/rpc/check_owner_pin`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: id, pin_in: pin }) });
    if (!r.ok || (await r.json().catch(() => false)) !== true) throw new Error('PIN이 올바르지 않습니다.');
    return {};
  },
  async update(id, pin, f) {
    const url = f.photo ? await upload(f.photo) : null;
    const r = await fetch(`${SB}/rest/v1/rpc/update_report`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: id, pin_in: pin, new_category: (f.category || '기타').slice(0, 20), new_detail: (f.detail || '').slice(0, 1000), new_lost_found: f.lostFound || null, new_photo: url }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(/PIN/.test(e.message || '') ? 'PIN이 올바르지 않습니다.' : '저장에 실패했습니다.'); }
    return { category: (f.category || '기타').slice(0, 20), detail: (f.detail || '').slice(0, 1000), lostFound: f.lostFound || null, ...(url ? { photo: url } : {}) };
  },
  async remove(id, pin) {
    const r = await fetch(`${SB}/rest/v1/rpc/delete_report`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ rid: id, pin_in: pin }) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(/PIN/.test(e.message || '') ? 'PIN이 올바르지 않습니다.' : '삭제에 실패했습니다.'); }
    return {};
  },
};

export const api = {
  ...(SB && KEY ? remote : local),
  waypoints: () => fetch('/data/waypoints.json').then(j),
};
